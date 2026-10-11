// The Workflow tab's change set, one edit at a time (#1850).
//
// The property under test throughout: a row put back to its saved value
// LEAVES the set (the bar counts entries), and no function changes the set it
// was handed (the rail draws the old one until the server answers).

import { describe, expect, it } from "vitest";

import {
  changesOf,
  countChanges,
  loraRemoved,
  loraStrength,
  modelPick,
  stageOn,
  withFragment,
  withLoraRemoved,
  withLoraStrength,
  withModel,
  withoutGoneLoaders,
  withStage,
} from "./workflowEdits";

const SLOT = { node_id: "22", field: "lora_name", sha256: "s2" };

describe("changesOf and countChanges", () => {
  it("answers a whole, empty set for nothing waiting", () => {
    expect(changesOf(null)).toEqual({
      models: [],
      loras: [],
      skip_loras: [],
      stages: {},
      values: [],
    });
    expect(countChanges(null)).toBe(0);
  });

  it("counts every entry, parameters it never edits included", () => {
    expect(
      countChanges({
        models: [{ address: "a/b", filename: "x" }],
        loras: [SLOT],
        skip_loras: [{ node_id: "1", field: "lora_name" }],
        stages: { upscale: true, face_detailer: false },
        values: [{ slot_label: "s", input_name: "steps", value: 8 }],
      }),
    ).toBe(6);
  });

  it("copies: the set it was given is never the one it hands back", () => {
    const given = { models: [], stages: {} };
    const made = changesOf(given);
    made.models.push({});
    made.stages.upscale = true;
    expect(given).toEqual({ models: [], stages: {} });
  });
});

describe("a model pick", () => {
  it("is one entry per loader address, replaced by the next pick", () => {
    let set = withModel(null, "core:m1/ckpt_name", "a.safetensors", "saved.safetensors");
    set = withModel(set, "core:m1/ckpt_name", "b.safetensors", "saved.safetensors");
    expect(set.models).toEqual([
      { address: "core:m1/ckpt_name", filename: "b.safetensors" },
    ]);
    expect(modelPick(set, "core:m1/ckpt_name")).toBe("b.safetensors");
    expect(modelPick(set, "core:m2/vae_name")).toBe(null);
  });

  it("leaves the set when the file is the saved one, whatever its folders or case", () => {
    const set = withModel(
      { models: [{ address: "core:m1/ckpt_name", filename: "b.safetensors" }] },
      "core:m1/ckpt_name",
      "SDXL/Saved.safetensors",
      "saved.safetensors",
    );
    expect(set.models).toEqual([]);
    expect(withModel(set, "core:m1/ckpt_name", "", "saved.safetensors").models).toEqual([]);
  });
});

describe("a stage", () => {
  it("joins when it differs from saved and leaves when it is put back", () => {
    const on = withStage(null, "upscale", true, false);
    expect(on.stages).toEqual({ upscale: true });
    expect(stageOn(on, "upscale", false)).toBe(true);
    expect(withStage(on, "upscale", false, false).stages).toEqual({});
  });

  it("reads the saved answer where nothing waits", () => {
    expect(stageOn(null, "upscale", true)).toBe(true);
    expect(stageOn({ stages: { upscale: false } }, "upscale", true)).toBe(false);
  });
});

describe("a LoRA loader", () => {
  it("takes a strength, the clip strength following where the two were one", () => {
    const set = withLoraStrength(null, SLOT, 0.5, { strength: 0.85, strength_clip: null });
    expect(set.loras).toEqual([
      { node_id: "22", field: "lora_name", sha256: "s2", strength_model: 0.5, strength_clip: 0.5 },
    ]);
    expect(loraStrength(set, SLOT)).toBe(0.5);
  });

  it("leaves a clip strength alone where the graph set it apart", () => {
    const set = withLoraStrength(null, SLOT, 0.5, { strength: 0.85, strength_clip: 0.3 });
    expect(set.loras[0].strength_clip).toBe(0.3);
  });

  it("leaves the set at the saved strength, and for a loader the shelf cannot name", () => {
    const waiting = withLoraStrength(null, SLOT, 0.5, { strength: 0.85 });
    expect(withLoraStrength(waiting, SLOT, 0.85, { strength: 0.85 }).loras).toEqual([]);
    expect(
      withLoraStrength(null, { ...SLOT, sha256: "" }, 0.5, { strength: 0.85 }).loras,
    ).toEqual([]);
    expect(loraStrength(null, SLOT)).toBe(null);
  });

  it("is removed or set, never both, and put back leaves nothing", () => {
    const waiting = withLoraStrength(null, SLOT, 0.5, { strength: 0.85 });
    const removed = withLoraRemoved(waiting, { node_id: 22, field: "lora_name" }, true);
    expect(removed.loras).toEqual([]);
    expect(removed.skip_loras).toEqual([{ node_id: "22", field: "lora_name" }]);
    expect(loraRemoved(removed, SLOT)).toBe(true);
    const back = withLoraRemoved(removed, SLOT, false);
    expect(back.skip_loras).toEqual([]);
    expect(loraRemoved(back, SLOT)).toBe(false);
    // Removing twice is still one entry.
    expect(withLoraRemoved(removed, SLOT, true).skip_loras).toHaveLength(1);
  });

  it("tells two slots of one stacker node apart", () => {
    const set = withLoraRemoved(null, { node_id: "5", field: "lora_name_1" }, true);
    expect(loraRemoved(set, { node_id: "5", field: "lora_name_2" })).toBe(false);
  });
});

describe("a fragment laid over the set", () => {
  it("wins thing by thing, and a slot it removes is no longer set (nor the reverse)", () => {
    const set = withFragment(
      {
        models: [{ address: "a/b", filename: "old" }],
        loras: [{ ...SLOT, strength_model: 0.2 }],
        skip_loras: [{ node_id: "14", field: "lora_name" }],
        stages: { upscale: true },
      },
      {
        models: [{ address: "a/b", filename: "new" }],
        skip_loras: [{ node_id: "22", field: "lora_name" }],
        loras: [{ node_id: "14", field: "lora_name", sha256: "s1", strength_model: 1 }],
        stages: { face_detailer: true },
      },
    );
    expect(set.models).toEqual([{ address: "a/b", filename: "new" }]);
    expect(set.skip_loras).toEqual([{ node_id: "22", field: "lora_name" }]);
    expect(set.loras).toEqual([
      { node_id: "14", field: "lora_name", sha256: "s1", strength_model: 1 },
    ]);
    expect(set.stages).toEqual({ upscale: true, face_detailer: true });
  });
});

describe("after a chain edit took loaders out", () => {
  it("keeps only the LoRA entries whose loader is still there, and everything else", () => {
    const set = withoutGoneLoaders(
      {
        models: [{ address: "a/b", filename: "x" }],
        loras: [{ ...SLOT, strength_model: 0.5 }],
        skip_loras: [
          { node_id: "31", field: "lora_name" },
          { node_id: "14", field: "lora_name" },
        ],
        stages: { upscale: true },
      },
      [{ node_id: "14", field: "lora_name" }],
    );
    expect(set.loras).toEqual([]);
    expect(set.skip_loras).toEqual([{ node_id: "14", field: "lora_name" }]);
    expect(set.models).toHaveLength(1);
    expect(set.stages).toEqual({ upscale: true });
  });
});
