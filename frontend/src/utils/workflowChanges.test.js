// workflowChanges.test.js - a set of changes to a workflow, in the client.
//
// These are the parts the Run popup and the Tasks tab share, so what is worth
// asserting is what makes the two agree with each other and with the server:
// one sentence for one set, the server's own rule for laying one set over
// another, and the explicit answer that stops a save keeping a change the
// owner put back.

import { describe, expect, it } from "vitest";

import {
  answering,
  changesWord,
  describeChanges,
  modelWord,
  noChanges,
  over,
  saveFailure,
  suggestedName,
  whole,
} from "./workflowChanges";

const CKPT = "core:CheckpointLoader/ckpt_name";
const VAE = "core:VAELoader/vae_name";
const slot = (node, extra = {}) => ({ node_id: node, field: "lora_name", ...extra });
const value = (slotLabel, inputName, v) => ({
  slot_label: slotLabel,
  input_name: inputName,
  value: v,
});

describe("a set with every list present", () => {
  it("fills in what a set leaves out, and keeps what it has", () => {
    const models = [{ address: CKPT, filename: "a.safetensors" }];
    expect(whole({ models, stages: { upscale: false } })).toEqual({
      ...noChanges(),
      models,
      stages: { upscale: false },
    });
  });

  it("reads no set as an empty one, a new one each time", () => {
    expect(whole(null)).toEqual(noChanges());
    expect(whole(undefined)).toEqual(noChanges());
    // Callers push onto the lists: two readers must not share them.
    expect(whole(null).loras).not.toBe(whole(null).loras);
  });

  it("copies: the set it was given is never the one it hands back", () => {
    const given = { models: [], stages: {} };
    const made = whole(given);
    made.models.push({});
    made.stages.upscale = true;
    expect(given).toEqual({ models: [], stages: {} });
  });

  it("carries nothing but the five things a set holds", () => {
    expect(whole({ stages: {}, count: 3, version: 2 })).toEqual(noChanges());
  });
});

describe("laying one set over another", () => {
  it("lets the top win thing by thing, and keeps what it does not name", () => {
    const base = {
      models: [
        { address: CKPT, filename: "a.safetensors" },
        { address: VAE, filename: "vae.safetensors" },
      ],
      stages: { upscale: false, face_detailer: true },
      values: [value("KSampler", "steps", 20), value("KSampler", "cfg", 5)],
    };
    const top = {
      models: [{ address: CKPT, filename: "b.safetensors" }],
      stages: { upscale: true },
      values: [value("KSampler", "steps", 32)],
    };
    expect(over(base, top)).toEqual({
      models: [
        { address: CKPT, filename: "b.safetensors" },
        { address: VAE, filename: "vae.safetensors" },
      ],
      loras: [],
      skip_loras: [],
      stages: { upscale: true, face_detailer: true },
      values: [value("KSampler", "steps", 32), value("KSampler", "cfg", 5)],
    });
  });

  it("never leaves a loader both set and removed, whichever said which", () => {
    const set = slot("7", { sha256: "s".repeat(64), strength_model: 0.5 });
    expect(over({ skip_loras: [slot("7")] }, { loras: [set] })).toMatchObject({
      loras: [set],
      skip_loras: [],
    });
    expect(over({ loras: [set] }, { skip_loras: [slot("7")] })).toMatchObject({
      loras: [],
      skip_loras: [slot("7")],
    });
  });

  it("reads a missing set as an empty one", () => {
    expect(over(null, undefined)).toEqual(noChanges());
  });
});

describe("a set of changes in words", () => {
  it("names them in one order: models, LoRAs, stages, parameters", () => {
    const said = describeChanges(
      {
        // Given out of order, as a form would.
        values: [value("KSampler", "steps", 32)],
        skip_loras: [slot("8")],
        models: [{ address: CKPT, filename: "b.safetensors" }],
      },
      { value: () => "Steps" },
    );
    expect(said).toEqual({ count: 3, text: "Checkpoint, 1 LoRA removed, Steps." });
  });

  it("counts what is naturally plural, and says it in the plural", () => {
    const said = describeChanges({
      loras: [slot("1"), slot("2")],
      skip_loras: [slot("3"), slot("4"), slot("5")],
    });
    expect(said).toEqual({ count: 5, text: "2 LoRAs changed, 3 LoRAs removed." });
  });

  it("reads two loaders of one file as one model, and two files as two", () => {
    const twice = [
      { address: "core:A/ckpt_name", filename: "b.safetensors" },
      { address: "core:B/ckpt_name", filename: "B.safetensors" },
    ];
    expect(describeChanges({ models: twice })).toEqual({
      count: 1,
      text: "Checkpoint.",
    });
    expect(
      describeChanges({
        models: [
          { address: "core:A/clip_name1", filename: "l.safetensors" },
          { address: "core:A/clip_name2", filename: "g.safetensors" },
        ],
      }),
    ).toEqual({ count: 2, text: "2 text encoders." });
  });

  it("says a stage with which way it went", () => {
    expect(
      describeChanges({ stages: { upscale: false, face_detailer: true } }).text,
    ).toBe("Upscale off, Face detailer on.");
  });

  it("reads width and height of one node as one Size", () => {
    const both = [
      value("EmptyLatentImage", "width", 1024),
      value("EmptyLatentImage", "height", 1024),
    ];
    expect(describeChanges({ values: both })).toEqual({ count: 1, text: "Size." });
    // One alone is that parameter, and two nodes' are not a pair.
    expect(describeChanges({ values: [both[0]] }).text).toBe("width.");
    expect(
      describeChanges({ values: [both[0], value("Other", "height", 512)] }).count,
    ).toBe(2);
  });

  it("falls back to the widget's name where the form has no word for it", () => {
    expect(
      describeChanges(
        { values: [value("KSampler", "steps", 1), value("KSampler", "cfg", 2)] },
        { value: (_slot, name) => (name === "cfg" ? "CFG" : undefined) },
      ).text,
    ).toBe("steps, CFG.");
  });

  it("says nothing for an empty set", () => {
    expect(describeChanges(null)).toEqual({ count: 0, text: "" });
  });

  it("counts in words", () => {
    expect(changesWord(1)).toBe("1 change");
    expect(changesWord(3)).toBe("3 changes");
  });
});

describe("what a loader is called from its address", () => {
  it.each([
    ["core:CheckpointLoader/ckpt_name", "Checkpoint"],
    ["core:UNETLoader/unet_name", "Checkpoint"],
    ["core:VAELoader/vae_name", "VAE"],
    ["core:DualCLIPLoader/clip_name2", "Text encoder"],
    ["core:Upscaler/model_name", "Model"],
  ])("%s is a %s", (address, word) => {
    expect(modelWord(address).one).toBe(word);
  });
});

describe("a save beside what waits on the workflow", () => {
  // The form as the owner left it: everything back at what the workflow has.
  const form = {
    model: (address) => (address === CKPT ? "saved.safetensors" : undefined),
    lora: (node) =>
      node === "7"
        ? { sha256: "s".repeat(64), strength_model: 0.6 }
        : node === "8"
          ? null
          : undefined,
    stage: (name) => (name === "upscale" ? true : undefined),
    value: (_slot, name) => (name === "steps" ? 8 : undefined),
  };

  it("states the form's answer for every waiting change the form put back", () => {
    const waiting = {
      models: [{ address: CKPT, filename: "waiting.safetensors" }],
      loras: [slot("7", { sha256: "t".repeat(64), strength_model: 1 })],
      stages: { upscale: false },
      values: [value("KSampler", "steps", 28)],
    };
    expect(answering(noChanges(), waiting, form)).toEqual({
      models: [{ address: CKPT, filename: "saved.safetensors" }],
      loras: [slot("7", { sha256: "s".repeat(64), strength_model: 0.6 })],
      skip_loras: [],
      stages: { upscale: true },
      values: [value("KSampler", "steps", 8)],
    });
  });

  it("sets a loader that waited to be removed and is back in the form", () => {
    expect(
      answering(noChanges(), { skip_loras: [slot("7")] }, form).loras,
    ).toEqual([slot("7", { sha256: "s".repeat(64), strength_model: 0.6 })]);
  });

  it("lets the form's own change stand where it has one", () => {
    const own = {
      models: [{ address: CKPT, filename: "mine.safetensors" }],
      skip_loras: [slot("7")],
      stages: { upscale: false },
      values: [value("KSampler", "steps", 40)],
    };
    const waiting = {
      models: [{ address: CKPT, filename: "waiting.safetensors" }],
      loras: [slot("7", { sha256: "t".repeat(64), strength_model: 1 })],
      stages: { upscale: true },
      values: [value("KSampler", "steps", 28)],
    };
    expect(answering(own, waiting, form)).toEqual({ ...noChanges(), ...own });
  });

  it("says a loader once where the form changed it and another LoRA waits on it", () => {
    // Node 7 is the form's own change. Answered for as well, it would be sent
    // twice: once as the change, once as the form's present answer.
    const mine = slot("7", { sha256: "m".repeat(64), strength_model: 0.8 });
    const waiting = { loras: [slot("7", { sha256: "t".repeat(64), strength_model: 1 })] };
    expect(answering({ loras: [mine] }, waiting, form).loras).toEqual([mine]);
  });

  it("leaves to what waits a thing the form has no control for", () => {
    const waiting = {
      models: [{ address: VAE, filename: "waiting-vae.safetensors" }],
      skip_loras: [slot("99")],
      stages: { face_detailer: false },
      values: [value("Other", "tile", 512)],
    };
    expect(answering(noChanges(), waiting, form)).toEqual(noChanges());
  });

  it("cannot state a loader the shelf has no digest for, and does not try", () => {
    const blind = { ...form, lora: () => ({ sha256: "", strength_model: 1 }) };
    expect(
      answering(noChanges(), { skip_loras: [slot("7")] }, blind).loras,
    ).toEqual([]);
  });

  it("does not answer for a loader the form itself has removed", () => {
    // `own` is what says node 8 is removed, and it is what holds: a reader
    // that still had a LoRA to answer with for that loader is not taken up.
    const stillAnswers = { ...form, lora: () => ({ sha256: "s".repeat(64), strength_model: 1 }) };
    const own = { skip_loras: [slot("8")] };
    const waiting = { loras: [slot("8", { sha256: "t".repeat(64) })] };
    expect(answering(own, waiting, stillAnswers)).toMatchObject({
      loras: [],
      skip_loras: [slot("8")],
    });
  });

  it("keeps a loader removed over a LoRA that waits on it, by the caller's removal", () => {
    // The contract `answering` leans on: a form that answers null for a
    // loader (node 8 here) has it in `own.skip_loras`. Nothing is added for
    // it, and laid over what waits, as the server lays a save, the removal
    // wins.
    const own = { skip_loras: [slot("8")] };
    const waiting = { loras: [slot("8", { sha256: "t".repeat(64) })] };
    expect(form.lora("8")).toBeNull();
    const sent = answering(own, waiting, form);
    expect(sent).toEqual({ ...noChanges(), ...own });
    expect(over(waiting, sent)).toMatchObject({ loras: [], skip_loras: [slot("8")] });
  });
});

describe("the sentence for a save that did not land", () => {
  const refusal = (status, detail) => ({
    message: `Request failed with status code ${status}`,
    response: { status, data: { detail } },
  });

  it("says ComfyUI did not answer on a 503, whatever came with it", () => {
    expect(saveFailure(refusal(503, "upstream said something"))).toBe(
      "ComfyUI did not answer, so nothing was saved. Start ComfyUI and save again.",
    );
  });

  it("prints a 409's reason as the server sent it", () => {
    const reason = "A checkpoint change is saved as a new workflow.";
    expect(saveFailure(refusal(409, reason))).toBe(reason);
  });

  it("falls back to the transport's message, then to its own words", () => {
    expect(saveFailure(new Error("Network Error"))).toBe("Network Error");
    expect(saveFailure(null)).toBe("Could not save the workflow.");
  });
});

describe("the name a new workflow is offered", () => {
  it("is the workflow's, with the model it now loads", () => {
    expect(suggestedName("Portrait", "Juggernaut XL")).toBe("Portrait (Juggernaut XL)");
  });

  it("is numbered where no model was picked, and never says where it came from", () => {
    expect(suggestedName("Portrait")).toBe("Portrait 2");
    for (const name of [suggestedName("Portrait"), suggestedName("", "X")]) {
      expect(name).not.toMatch(/copy|clone|fixed|edited/i);
    }
  });
});
