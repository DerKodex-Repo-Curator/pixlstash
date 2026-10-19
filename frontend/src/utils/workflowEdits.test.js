// The Workflow tab's change set, one edit at a time (#1850).
//
// The property under test throughout: a row put back to its saved value
// LEAVES the set (the bar counts entries), and no function changes the set it
// was handed (the rail draws the old one until the server answers).

import { describe, expect, it } from "vitest";

import {
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

describe("countChanges", () => {
  it("counts nothing for nothing waiting", () => {
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

  it("moves a clip strength the graph spells out as the same number", () => {
    // Stated on the loader, and equal: still one number, so it follows.
    const set = withLoraStrength(null, SLOT, 0.5, { strength: 0.85, strength_clip: 0.85 });
    expect(set.loras[0].strength_clip).toBe(0.5);
  });

  it.each([NaN, Infinity, undefined])(
    "stores no strength that is not a number (%s), and takes the waiting one out",
    (typed) => {
      const waiting = withLoraStrength(null, SLOT, 0.5, { strength: 0.85 });
      expect(withLoraStrength(waiting, SLOT, typed, { strength: 0.85 }).loras).toEqual([]);
      expect(withLoraStrength(null, SLOT, typed, { strength: 0.85 }).loras).toEqual([]);
    },
  );

  it("names a loader by its plain field where the row gives none", () => {
    // The server addresses a slot by node and field; `lora_name` is the
    // field of a plain loader, and an entry without one names nothing.
    const bare = { node_id: 22, sha256: "s2" };
    expect(withLoraRemoved(null, bare, true).skip_loras).toEqual([
      { node_id: "22", field: "lora_name" },
    ]);
    expect(withLoraStrength(null, bare, 0.5, { strength: 0.85 }).loras[0]).toMatchObject({
      node_id: "22",
      field: "lora_name",
    });
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
    // A strength set on a removed loader puts it back.
    const set = withLoraStrength(removed, SLOT, 0.5, { strength: 0.85 });
    expect(set.skip_loras).toEqual([]);
    expect(set.loras).toHaveLength(1);
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

  it("lays parameters over too: it is the server's rule whole, not part of it", () => {
    const steps = { slot_label: "s", input_name: "steps" };
    const set = withFragment(
      { values: [{ ...steps, value: 8 }, { slot_label: "s", input_name: "cfg", value: 7 }] },
      { values: [{ ...steps, value: 20 }] },
    );
    expect(set.values).toEqual([
      { ...steps, value: 20 },
      { slot_label: "s", input_name: "cfg", value: 7 },
    ]);
  });

  it("spells the fragment's slots as every other edit here does", () => {
    // A number for a node id and no field, as a caller may send them: the
    // rows find their entry by a string id and the field named outright.
    const set = withFragment(
      { loras: [{ ...SLOT, strength_model: 0.2 }] },
      { skip_loras: [{ node_id: 22 }], loras: [{ node_id: 14, sha256: "s1", strength_model: 1 }] },
    );
    expect(set.skip_loras).toEqual([{ node_id: "22", field: "lora_name" }]);
    expect(set.loras).toEqual([
      { node_id: "14", field: "lora_name", sha256: "s1", strength_model: 1 },
    ]);
    expect(loraRemoved(set, SLOT)).toBe(true);
  });
});

describe("the set a function was handed", () => {
  // The rail draws it until the server answers: an edit that wrote into it
  // would show a change nothing had stored.
  const given = () => ({
    models: [{ address: "a/b", filename: "x" }],
    loras: [{ ...SLOT, strength_model: 0.5, strength_clip: 0.5 }],
    skip_loras: [{ node_id: "14", field: "lora_name" }],
    stages: { upscale: true },
    values: [{ slot_label: "s", input_name: "steps", value: 8 }],
  });
  const freeze = (value) => {
    Object.values(value).forEach((part) => {
      if (part && typeof part === "object") freeze(part);
    });
    return Object.freeze(value);
  };

  it.each([
    ["withModel", (set) => withModel(set, "a/b", "y", "saved")],
    ["withModel, put back", (set) => withModel(set, "a/b", "", "saved")],
    ["withStage", (set) => withStage(set, "face_detailer", true, false)],
    ["withStage, put back", (set) => withStage(set, "upscale", false, false)],
    ["withLoraRemoved", (set) => withLoraRemoved(set, SLOT, true)],
    ["withLoraRemoved, put back", (set) => withLoraRemoved(set, { node_id: "14", field: "lora_name" }, false)],
    ["withLoraStrength", (set) => withLoraStrength(set, SLOT, 0.9, { strength: 0.85 })],
    [
      "withLoraStrength, on a removed loader",
      (set) => withLoraStrength(set, { node_id: "14", field: "lora_name", sha256: "s1" }, 0.9, { strength: 1 }),
    ],
    [
      "withFragment",
      (set) =>
        withFragment(set, {
          models: [{ address: "a/b", filename: "z" }],
          loras: [{ node_id: "14", field: "lora_name", sha256: "s1", strength_model: 1 }],
          skip_loras: [{ node_id: "22", field: "lora_name" }],
          stages: { upscale: false },
          values: [{ slot_label: "s", input_name: "steps", value: 20 }],
        }),
    ],
    ["withoutGoneLoaders", (set) => withoutGoneLoaders(set, [])],
  ])("is left as it was by %s", (_name, edit) => {
    // Frozen all the way down: a write into it throws rather than passes.
    const set = freeze(given());
    const made = edit(set);
    expect(made).not.toBe(set);
    expect(set).toEqual(given());
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
