"""The ComfyUI pack draws a model's generated mark exactly as the shelf does.

A model with no picture wears two initials on a coloured tile. The shelf
computes it in ``frontend/src/utils/modelShelf.js`` (``generatedMark``) and the
pack's loader nodes and picker in their own port
(``integrations/ComfyUI-PixlStash/web/js/model_mark.js``), because the pack
cannot import the app's code. This runs both in Node over the same rows and
fails on any difference, so the two cannot drift apart unnoticed.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_UTILS = REPO_ROOT / "frontend" / "src" / "utils"
PACK_MARK = (
    REPO_ROOT / "integrations" / "ComfyUI-PixlStash" / "web" / "js" / "model_mark.js"
)

# Each row exercises one step of the name chain or the colour key. Initials
# read only the first two words, so a stripping rule shows only on a name that
# is one word once stripped: `lora_int8` is LO, and LI if `int8` is not eaten.
ROWS = [
    {"display_name": "World of Wordcraft", "base_model": "SDXL 1.0"},
    {"display_name": "Return_of_the_King"},
    {"display_name": "In-Context LoRA", "base_model_folded": "flux.1"},
    {"display_name": "The Thing"},
    {"display_name": "  ", "filename": "portrait_mix_v2.safetensors"},
    {"matched_name": "Stable Diffusion 3.5 Large", "filename": "sd3.5_large.st"},
    {"filename": "sd3.5_large_controlnet_canny.safetensors", "base_model": "SD3.5"},
    {"filename": "qwen-image-edit-2511-Q4_K_M.gguf", "base_model": "Qwen Image"},
    {"filename": "krea2_turbo_int8_scaled.safetensors"},
    {"filename": "some_model_scaled.safetensors"},
    {"filename": "my_lora_000002750.safetensors", "base_model": "Flux.2"},
    {"filename": "char-step1200-epoch3.safetensors"},
    {"filename": "char_01200.safetensors"},
    {"filename": "char_1234.safetensors"},
    {"filename": "000002750.safetensors"},
    {"filename": "/home/me/models/loras/Zimage_Turbo-bf16.safetensors"},
    {
        "filename": "x.safetensors",
        "base_model": "flux1",
        "base_model_folded": "flux.1",
        "base_model_canonical": "Z-Image",
    },
    {"filename": "x.safetensors", "base_model": "flux1", "base_model_folded": "a"},
    {},
]
# Every quant spelling, the modifiers alone and beside one, GGUF tails, and
# near-misses that are part of a name.
ROWS += [
    {"filename": f"lora_{tail}.safetensors"}
    for tail in (
        "fp32 f32 fp16 f16 bf16 fp8 f8 e4m3 e4m3fn e5m2 nvfp4 mxfp4 fp4 nf4 "
        "int8 i8 int4 i4 int2 fp8_scaled int8_fast awq gptq_int4 scaled fast "
        "Q4_K_M Q8_0 IQ3_XXS IQ4_XL IQ4_NL TQ1_0 Q5_K Q4_X q4 K_M"
    ).split()
]
# Enough base models to land on every palette entry, in order.
ROWS += [{"filename": "a b", "base_model": f"base {i}"} for i in range(400)]

DRIVER = """
import { readFileSync } from "node:fs";
import { generatedMark as app } from "./modelShelf.js";
import { generatedMark as pack } from "./model_mark.js";

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
console.log(JSON.stringify(rows.map((row) => ({ app: app(row), pack: pack(row) }))));
"""


def _missing(message: str) -> None:
    if os.getenv("GITHUB_ACTIONS") == "true":
        pytest.fail(message)
    pytest.skip(message)


def test_pack_mark_matches_the_shelf(tmp_path):
    if not PACK_MARK.is_file():
        _missing(
            "integrations/ComfyUI-PixlStash is not checked out "
            "(git submodule update --init); the CI checkout must set "
            "`submodules: true`."
        )
    node = shutil.which("node")
    if not node:
        _missing("node is not installed, so neither mark can be computed.")

    (tmp_path / "package.json").write_text('{"type": "module"}')
    shelf = (APP_UTILS / "modelShelf.js").read_text(encoding="utf-8")
    # Vite resolves the extensionless import; Node's ESM loader does not.
    shelf = shelf.replace('from "./setAppearance";', 'from "./setAppearance.js";')
    (tmp_path / "modelShelf.js").write_text(shelf, encoding="utf-8")
    shutil.copy(APP_UTILS / "setAppearance.js", tmp_path)
    shutil.copy(PACK_MARK, tmp_path)
    (tmp_path / "driver.js").write_text(DRIVER)
    (tmp_path / "rows.json").write_text(json.dumps(ROWS))

    done = subprocess.run(
        [node, "driver.js", "rows.json"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert done.returncode == 0, done.stderr
    marks = json.loads(done.stdout)

    assert len(marks) == len(ROWS)
    for row, mark in zip(ROWS, marks):
        assert mark["pack"] == mark["app"], row
    # The rows must reach more than one colour and more than one shape of
    # initials, or agreeing on them proves little.
    # 48 palette entries, 39 distinct hues among them.
    assert len({m["app"]["color"] for m in marks}) > 30
    assert len({m["app"]["initials"] for m in marks}) > 8
