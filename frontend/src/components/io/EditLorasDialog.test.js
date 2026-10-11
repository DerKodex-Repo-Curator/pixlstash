// Edit LoRAs (#1478, #1850): what the owner sees in the list is exactly what
// the route is asked about, and the route's answer picks the one button.
//
// * A delete strikes the row through and offers Restore; the entry is then
//   ABSENT from the PUT, which is how the route reads a delete.
// * A reorder, by keyboard as much as by drag, is the order of `entries`.
// * Add appends one row at the end, and only a picked LoRA is sent.
// * Every gesture is a dry run, and its `changes` are what the dialog lists.
// * Deletes and shelf strengths end in Apply: nothing is written, and `apply`
//   carries them to the Workflow tab as a fragment of its unsaved changes.
// * A loader added or moved, or a strength the shelf has no digest for, ends
//   in Save: `overwrite` on the PUT, the workflow's next version.
// * `editable: false` opens read-only, with the planner's sentence.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const getLoraChain = vi.fn();
const saveLoraChain = vi.fn();
vi.mock("../../api/workflows", () => ({
  getLoraChain: (...args) => getLoraChain(...args),
  saveLoraChain: (...args) => saveLoraChain(...args),
}));
const listAdapters = vi.fn();
vi.mock("../../api/modelShelf", () => ({
  listAdapters: (...args) => listAdapters(...args),
}));
vi.mock("vuetify/components", async () => {
  const { vuetifyComponentStubs } = await import("../../testing/vuetifyStubs");
  return vuetifyComponentStubs();
});

import { useNoticeStore } from "../../stores/useNoticeStore";
import { useWorkflowsStore } from "../../stores/useWorkflowsStore";
import EditLorasDialog from "./EditLorasDialog.vue";

const KEY = "a".repeat(64);

const APPLY_NOTE =
  "Apply puts this in the Workflow tab as an unsaved change. Nothing is written until you save there.";

/** What the next dry runs answer; each test sets the kinds its edit makes. */
let dry;
const mounted = [];

const DELETED_33 = [
  { kind: "deleted", node_id: "33", text: "Loader #33 deleted: hairstyle-v3" },
  { kind: "rewired", node_id: "7", text: "#7 KSampler and 2 text encoders rewired" },
];
const MOVED_22 = [
  { kind: "moved", node_id: "31", text: "#22 and #31 swapped: film-grain-35mm now applies first" },
];

function loader(nodeId, filename, strength, overrides = {}) {
  const base = filename.split("/").pop();
  return {
    node_id: nodeId,
    class_type: "LoraLoader",
    field: "lora_name",
    filename,
    name: base.replace(/\.[^.]+$/, ""),
    strength,
    strength_clip: strength,
    sha256: `sha-${nodeId}`,
    on_shelf: true,
    ...overrides,
  };
}

function chain(overrides = {}) {
  return {
    workflow_id: KEY,
    editable: true,
    refusal: null,
    source: {
      node_id: "4",
      class_type: "CheckpointLoaderSimple",
      outputs: ["MODEL", "CLIP"],
    },
    sink: {
      summary: "KSampler #7 reads model · 2 text encoders read clip",
      consumers: [
        { node_id: "7", class_type: "KSampler", field: "model", type: "MODEL" },
      ],
    },
    loaders: [
      loader("14", "sub/lightning-8step.safetensors", 1.0),
      loader("22", "neon-rain-v2.safetensors", 0.85),
      loader("31", "film-grain-35mm.safetensors", 0.4),
      // Mixed case on purpose: the shelf match is case-folded and every other
      // fixture is lowercase.
      loader("33", "Hairstyle-V3.safetensors", 0.6, {
        sha256: null,
        on_shelf: false,
      }),
    ],
    added_loader_class: "LoraLoader",
    ...overrides,
  };
}

async function mountDialog(props = {}) {
  const wrapper = mount(EditLorasDialog, {
    props: {
      open: true,
      workflowId: KEY,
      cardName: "SDXL + face detailer",
      pictureCount: 184,
      ...props,
    },
    global: { stubs: { Tooltip: true, teleport: true } },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function primary(wrapper) {
  return wrapper.find("[data-testid='eld-primary']");
}

/** The bodies the route was sent, dry runs and writes apart. */
function sent(dryRun) {
  return saveLoraChain.mock.calls
    .map(([, body]) => body)
    .filter((body) => body.dry_run === dryRun);
}

async function setStrength(wrapper, index, value) {
  await wrapper.findAll(".eld-row")[index].find("input[type=number]").setValue(value);
  await flushPromises();
}

function textOf(wrapper) {
  return wrapper.text().replace(/\s+/g, " ");
}

function rowNames(wrapper) {
  return wrapper
    .findAll(".eld-row")
    .map((row) => {
      const name = row.find(".eld-name-text");
      const words = name.exists() ? name.text().trim() : "";
      return row.find(".eld-tag").exists() ? `${words} new` : words;
    });
}

/** A button's words, without the icon stub's `mdi-…` text. */
function labelOf(entry) {
  const own = entry.find(".app-btn__label");
  return (own.exists() ? own.text() : entry.text()).trim();
}

function button(wrapper, label) {
  const found = wrapper
    .findAll("button")
    .find((entry) => labelOf(entry) === label);
  if (!found) throw new Error(`no button reading ${label}`);
  return found;
}

function deleteButton(wrapper, index) {
  return wrapper.findAll(".eld-row")[index].find("[data-focus='delete']");
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  document.body.innerHTML = "";
  getLoraChain.mockResolvedValue(chain());
  listAdapters.mockResolvedValue([
    { filename: "skin-detail-xl.safetensors", sha256: "sha-skin", display_name: "" },
    { filename: "no-digest.safetensors", sha256: null },
  ]);
  dry = DELETED_33;
  saveLoraChain.mockImplementation(async (_key, body) =>
    body.dry_run
      ? { dry_run: true, name: null, workflow_id: null, changes: dry }
      : {
          dry_run: false,
          name: null,
          workflow_id: KEY,
          overwritten: true,
          changes: [],
        },
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("the chain as read", () => {
  it("lists the loaders between the two rails, in apply order, with strengths", async () => {
    const wrapper = await mountDialog();
    expect(getLoraChain).toHaveBeenCalledWith(KEY);
    expect(wrapper.find("[data-testid='eld-source']").text()).toContain(
      "CheckpointLoaderSimple",
    );
    expect(wrapper.find("[data-testid='eld-sink']").text()).toContain(
      "KSampler #7 reads model",
    );
    expect(rowNames(wrapper)).toEqual([
      "lightning-8step",
      "neon-rain-v2",
      "film-grain-35mm",
      // The file the shelf cannot name is shown as the FILE.
      "Hairstyle-V3.safetensors",
    ]);
    const strengths = wrapper
      .findAll(".eld-row input[type=number]")
      .map((input) => input.element.value);
    expect(strengths).toEqual(["1.00", "0.85", "0.40", "0.60"]);
  });

  it("flags the loader that is not on the shelf by its file name", async () => {
    const wrapper = await mountDialog();
    const said = textOf(wrapper);
    // The owner's wording: the file, and that it is missing. Not "a run
    // ignores that loader", which is false - ComfyUI loads it by file name.
    expect(said).toContain(
      "Hairstyle-V3.safetensors is missing from your model shelf.",
    );
    expect(said).not.toContain("ignores that loader");
    expect(textOf(wrapper)).toContain("No changes");
  });
});

describe("delete and restore", () => {
  it("sends an untouched strength back exactly as read, not as displayed", async () => {
    getLoraChain.mockResolvedValue(
      chain({
        loaders: [
          loader("14", "a.safetensors", 0.855),
          loader("22", "b.safetensors", 1.0),
        ],
      }),
    );
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 1).trigger("click");
    await flushPromises();
    // Shown as 0.86 (two decimals); sending that would re-weight a loader
    // the owner never touched.
    expect(sent(true).at(-1).entries).toEqual([
      { node_id: "14", strength: 0.855 },
    ]);
  });

  it("strikes the row through with Put back, and leaves it out of the PUT", async () => {
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();

    const row = wrapper.findAll(".eld-row")[3];
    expect(row.classes()).toContain("eld-row--deleted");
    expect(row.find(".eld-pos").text()).toBe("—");
    expect(row.text()).toContain("Put back");
    // The Workflow tab's words, since the two edit one set of changes.
    expect(row.find("[data-focus='restore']").attributes("aria-label")).toBe(
      "Put Hairstyle-V3 back",
    );
    expect(row.text()).toContain(", removed");
    expect(deleteButton(wrapper, 2).attributes("aria-label")).toBe(
      "Remove film-grain-35mm",
    );
    expect(wrapper.find("[role=status][aria-live=polite]").text()).toBe(
      "Hairstyle-V3 removed. Put back is on the same row.",
    );
    // Focus lands on the Put back of the row it happened on.
    expect(document.activeElement?.textContent?.trim()).toBe("Put back");
    expect(textOf(wrapper)).toContain("1 loader removed");

    const body = saveLoraChain.mock.calls[0][1];
    expect(body.dry_run).toBe(true);
    expect(body.entries.map((entry) => entry.node_id)).toEqual(["14", "22", "31"]);
    expect(sent(false)).toEqual([]);
  });

  it("puts a restored row back where it was", async () => {
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 1).trigger("click");
    await flushPromises();
    await button(wrapper, "Put back").trigger("click");
    await flushPromises();

    const row = wrapper.findAll(".eld-row")[1];
    expect(row.classes()).not.toContain("eld-row--deleted");
    expect(row.find(".eld-pos").text()).toBe("2");
    expect(textOf(wrapper)).toContain("No changes");
  });
});

describe("reordering by keyboard", () => {
  it("moves the focused row with Alt+↓, says so, and sends that order", async () => {
    const wrapper = await mountDialog();
    const handle = wrapper.findAll(".eld-row")[1].find("[data-focus='handle']");
    await handle.trigger("keydown", { key: "ArrowDown", altKey: true });
    await flushPromises();

    expect(rowNames(wrapper).slice(0, 3)).toEqual([
      "lightning-8step",
      "film-grain-35mm",
      "neon-rain-v2",
    ]);
    expect(wrapper.find("[role=status][aria-live=polite]").text()).toBe(
      "neon-rain-v2 moved to 3 of 4.",
    );
    // Focus follows the handle that moved, so a held Alt+↓ walks the list.
    expect(
      document.activeElement?.closest("[data-row]")?.getAttribute("data-row"),
    ).toBe("n:22");
    // A swap of neighbours is one change, as the owner made it.
    expect(textOf(wrapper)).toContain("1 loader moved");

    expect(sent(true).at(-1).entries.map((entry) => entry.node_id)).toEqual([
      "14",
      "31",
      "22",
      "33",
    ]);
  });


  it("moves past a deleted row rather than swapping with it", async () => {
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 2).trigger("click");
    await flushPromises();
    const handle = wrapper.findAll(".eld-row")[1].find("[data-focus='handle']");
    await handle.trigger("keydown", { key: "ArrowDown", altKey: true });
    await flushPromises();

    // 22 jumped the struck-through 31 and landed after 33: a real move the
    // save writes, not a swap with a row that is going anyway.
    expect(sent(true).at(-1).entries.map((entry) => entry.node_id)).toEqual([
      "14",
      "33",
      "22",
    ]);
  });

  it("does not move a row past the ends", async () => {
    const wrapper = await mountDialog();
    const handle = wrapper.findAll(".eld-row")[0].find("[data-focus='handle']");
    await handle.trigger("keydown", { key: "ArrowUp", altKey: true });
    await flushPromises();
    expect(rowNames(wrapper)[0]).toBe("lightning-8step");
    expect(textOf(wrapper)).toContain("No changes");
  });
});

describe("the chain as a graph", () => {
  it("titles each loader node with its class and id, and a new one with the class a save adds", async () => {
    const wrapper = await mountDialog();
    const titles = () =>
      wrapper.findAll(".eld-row .eld-node-title").map((title) => title.text());
    expect(titles()).toEqual([
      "LoraLoader #14",
      "LoraLoader #22",
      "LoraLoader #31",
      "LoraLoader #33",
    ]);
    await button(wrapper, "Add a LoRA").trigger("click");
    await flushPromises();
    expect(titles().at(-1)).toBe("LoraLoader");
    // One arrow into every loader, and one more into the reader.
    expect(wrapper.findAll(".eld-wire:not(.eld-wire--plain)")).toHaveLength(6);
  });
});

describe("a chain that stops at a branch", () => {
  it("says why the list is shorter than the workflow", async () => {
    const note =
      "The chain stops at #22 LoraLoader, because its model goes 2 ways from there.";
    getLoraChain.mockResolvedValue(chain({ branch_note: note }));
    const wrapper = await mountDialog();
    expect(wrapper.find("[data-testid='eld-branch']").text()).toBe(note);
  });

  it("says nothing when the chain runs straight", async () => {
    const wrapper = await mountDialog();
    expect(wrapper.find("[data-testid='eld-branch']").exists()).toBe(false);
  });
});

describe("Add a LoRA", () => {
  it("appends one picker row at the end, and sends only a picked LoRA", async () => {
    const wrapper = await mountDialog();
    await button(wrapper, "Add a LoRA").trigger("click");
    await flushPromises();

    const rows = wrapper.findAll(".eld-row");
    expect(rows).toHaveLength(5);
    const select = rows[4].find("select");
    // Only digested shelf rows can be added: the route adds by sha256.
    expect(select.findAll("option").map((option) => option.text())).toEqual([
      "Pick a LoRA from your shelf…",
      "skin-detail-xl",
    ]);
    // Nothing picked is not a change, and Add waits for it.
    expect(textOf(wrapper)).toContain("No changes");
    expect(button(wrapper, "Add a LoRA").attributes("disabled")).toBeDefined();

    await select.setValue("sha-skin");
    await flushPromises();
    expect(rowNames(wrapper)[4]).toBe("skin-detail-xl new");
    expect(textOf(wrapper)).toContain("1 loader added");

    expect(sent(true).at(-1).entries.at(-1)).toEqual({
      node_id: null,
      sha256: "sha-skin",
      strength: 1,
    });
  });

  it("says where the first loader of an empty chain goes, and which class", async () => {
    getLoraChain.mockResolvedValue(
      chain({
        loaders: [],
        source: { node_id: "4", class_type: "UNETLoader", outputs: ["MODEL"] },
        sink: {
          summary: "KSampler #9 reads model",
          consumers: [
            { node_id: "9", class_type: "KSampler", field: "model", type: "MODEL" },
          ],
        },
        added_loader_class: "LoraLoaderModelOnly",
      }),
    );
    const wrapper = await mountDialog({ cardName: "Character sheet" });
    // An empty chain is a wire between two nodes, and the button says the
    // loader is spliced into it; once a row stands it is an Add again.
    const labels = () => wrapper.findAll("button").map(labelOf);
    expect(labels()).not.toContain("Add a LoRA");
    // The sink comes after the button, so its name says which two nodes.
    expect(
      button(wrapper, "Insert LoRA between these nodes").attributes("aria-label"),
    ).toBe(
      "Insert LoRA between these nodes: UNETLoader #4 and KSampler #9",
    );
    await button(wrapper, "Insert LoRA between these nodes").trigger("click");
    await flushPromises();
    expect(labels()).toContain("Add a LoRA");
    expect(labels()).not.toContain("Insert LoRA between these nodes");
    expect(textOf(wrapper)).toContain(
      "The loader goes in after #4 UNETLoader, and the 1 input reading its MODEL is rewired to it. This graph has no CLIP source, so LoraLoaderModelOnly is used.",
    );
  });

  // Each of these keeps the button an Add, off the wire: the splice wording
  // claims two nodes it can insert between, and here one is missing or the
  // insert is not on offer.
  it.each([
    [
      // What the route sends when nothing reading the chain could be named:
      // a sink with no summary, not a missing sink.
      "no reader",
      { sink: { summary: null, consumers: [] } },
    ],
    ["no model source", { source: null }],
    ["a read-only chain", { editable: false, refusal: "Node 68 cannot be edited." }],
  ])("keeps Add a LoRA on an empty chain with %s", async (_case, overrides) => {
    getLoraChain.mockResolvedValue(chain({ loaders: [], ...overrides }));
    const wrapper = await mountDialog();
    expect(button(wrapper, "Add a LoRA").exists()).toBe(true);
  });

  it("says Nothing found reading the chain for a reader it could not name", async () => {
    getLoraChain.mockResolvedValue(
      chain({ loaders: [], sink: { summary: null, consumers: [] } }),
    );
    const wrapper = await mountDialog();
    expect(wrapper.find("[data-testid='eld-sink']").text()).toBe(
      "Nothing found reading the chain",
    );
  });

  it("keeps Add a LoRA when every loader is deleted, since the rows stay on screen", async () => {
    const wrapper = await mountDialog();
    for (let index = 0; index < 4; index += 1) {
      await deleteButton(wrapper, index).trigger("click");
      await flushPromises();
    }
    expect(wrapper.findAll(".eld-row--deleted")).toHaveLength(4);
    expect(button(wrapper, "Add a LoRA").exists()).toBe(true);
  });
});

describe("one button: Apply or Save", () => {
  const SAVE_NOTE =
    "cannot wait as an unsaved change. Save writes it straight away: SDXL + face detailer keeps its name and its 184 pictures, and this chain becomes its next version. The version menu in the Workflow tab takes it back.";

  const press = [
    ["the button", (wrapper) => primary(wrapper).trigger("click")],
    ["Enter", (wrapper) => wrapper.find(".app-dialog").trigger("keydown", { key: "Enter" })],
  ];

  function note(wrapper) {
    return wrapper.find("[data-testid='eld-note']");
  }

  function footer(wrapper) {
    return wrapper.findAll(".app-dialog__footer button").map(labelOf);
  }

  async function swapSecondAndThird(wrapper) {
    const handle = wrapper.findAll(".eld-row")[1].find("[data-focus='handle']");
    await handle.trigger("keydown", { key: "ArrowDown", altKey: true });
    await flushPromises();
  }

  it("offers nothing to press, and asks the route nothing, before an edit", async () => {
    const wrapper = await mountDialog();
    expect(labelOf(primary(wrapper))).toBe("Apply");
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    // The note says what the button does, and is the button's description.
    expect(note(wrapper).text()).toBe(APPLY_NOTE);
    expect(note(wrapper).attributes("id")).toBeTruthy();
    expect(primary(wrapper).attributes("aria-describedby")).toBe(
      note(wrapper).attributes("id"),
    );
    await wrapper.find(".app-dialog").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(saveLoraChain).not.toHaveBeenCalled();
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it.each(press)(
    "applies a delete as an unsaved change with %s, and writes nothing",
    async (_how, accept) => {
      const wrapper = await mountDialog();
      const push = vi.spyOn(useNoticeStore(), "push");
      await deleteButton(wrapper, 3).trigger("click");
      await flushPromises();

      // The rewired line a delete brings with it is listed, and is no Save.
      const listed = wrapper
        .findAll("[data-testid='eld-changes'] li")
        .map((item) => item.text());
      expect(listed).toEqual([
        "Loader #33 deleted: hairstyle-v3",
        "#7 KSampler and 2 text encoders rewired",
      ]);
      expect(labelOf(primary(wrapper))).toBe("Apply");
      expect(primary(wrapper).attributes("disabled")).toBeUndefined();
      expect(note(wrapper).text()).toBe(APPLY_NOTE);

      await accept(wrapper);
      await flushPromises();

      expect(wrapper.emitted("apply")).toEqual([
        [{ skip_loras: [{ node_id: "33", field: "lora_name" }], loras: [] }],
      ]);
      expect(wrapper.emitted("close")).toHaveLength(1);
      expect(wrapper.emitted("overwritten")).toBeUndefined();
      // The dry run is all the route was ever asked.
      expect(saveLoraChain).toHaveBeenCalledTimes(1);
      expect(sent(false)).toEqual([]);
      expect(push).not.toHaveBeenCalled();
    },
  );

  it("applies a delete and new strengths in the slots the chain read names", async () => {
    getLoraChain.mockResolvedValue(
      chain({
        loaders: [
          // Model and CLIP weighted as one number: the CLIP follows.
          loader("14", "a.safetensors", 1.0, { field: "lora_01" }),
          // Weighted apart: the CLIP keeps its own.
          loader("22", "b.safetensors", 0.85, { field: "lora_02", strength_clip: 0.5 }),
          // A model-only loader has no CLIP strength to set.
          loader("31", "c.safetensors", 0.4, { strength_clip: null }),
          loader("33", "d.safetensors", 0.6, { field: "lora_04" }),
        ],
      }),
    );
    dry = [
      { kind: "deleted", node_id: "33", text: "Loader #33 deleted: d" },
      { kind: "strength", node_id: "14", text: "#14 a from 1.00 to 0.90" },
      { kind: "strength", node_id: "22", text: "#22 b from 0.85 to 0.70" },
      { kind: "strength", node_id: "31", text: "#31 c from 0.40 to 0.30" },
      { kind: "rewired", node_id: "7", text: "#7 KSampler rewired" },
    ];
    const wrapper = await mountDialog();
    await setStrength(wrapper, 0, "0.9");
    await setStrength(wrapper, 1, "0.7");
    await setStrength(wrapper, 2, "0.3");
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();

    expect(labelOf(primary(wrapper))).toBe("Apply");
    await primary(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.emitted("apply")).toEqual([
      [
        {
          skip_loras: [{ node_id: "33", field: "lora_04" }],
          loras: [
            {
              node_id: "14",
              field: "lora_01",
              sha256: "sha-14",
              strength_model: 0.9,
              strength_clip: 0.9,
            },
            {
              node_id: "22",
              field: "lora_02",
              sha256: "sha-22",
              strength_model: 0.7,
              strength_clip: 0.5,
            },
            {
              node_id: "31",
              field: "lora_name",
              sha256: "sha-31",
              strength_model: 0.3,
              strength_clip: null,
            },
          ],
        },
      ],
    ]);
    expect(sent(false)).toEqual([]);
  });

  describe("the button's word changing under the reader", () => {
    const said = (wrapper) =>
      wrapper.find("[data-testid='eld-button-said']").text();

    it("says nothing while it still reads Apply, however many removals", async () => {
      const wrapper = await mountDialog();
      await deleteButton(wrapper, 3).trigger("click");
      await flushPromises();
      await deleteButton(wrapper, 2).trigger("click");
      await flushPromises();
      expect(labelOf(primary(wrapper))).toBe("Apply");
      expect(said(wrapper)).toBe("");
    });

    it("says the new word and why when an edit turns Apply into Save, and back", async () => {
      const wrapper = await mountDialog();
      await deleteButton(wrapper, 3).trigger("click");
      await flushPromises();
      expect(said(wrapper)).toBe("");

      // A move on top of the removal: the same button now writes at once.
      dry = [...DELETED_33, ...MOVED_22];
      await swapSecondAndThird(wrapper);
      expect(labelOf(primary(wrapper))).toBe("Save");
      expect(said(wrapper)).toBe(
        `The button now reads Save. ${note(wrapper).text()}`,
      );
      expect(said(wrapper)).toContain("Moving or adding a loader cannot wait");
      // The gesture's own words are not overwritten by it.
      expect(wrapper.find("[role=status][aria-live=polite]").text()).toContain(
        "moved to",
      );

      // The move taken back: Apply again, and that is said too.
      dry = DELETED_33;
      await swapSecondAndThird(wrapper);
      expect(labelOf(primary(wrapper))).toBe("Apply");
      expect(said(wrapper)).toBe(
        "The button now reads Apply. Apply puts this in the Workflow tab as an unsaved change. Nothing is written until you save there.",
      );
    });
  });

  describe("the same edit made twice", () => {
    it("is said the second time too", async () => {
      dry = MOVED_22;
      const wrapper = await mountDialog();
      const said = () =>
        wrapper.find("[data-testid='eld-button-said']").text();
      await swapSecondAndThird(wrapper);
      expect(said()).toContain("The button now reads Save.");
      // Taken back: no edit, the button reads Apply and does nothing.
      await swapSecondAndThird(wrapper);
      expect(labelOf(primary(wrapper))).toBe("Apply");
      expect(said()).toBe("");
      await swapSecondAndThird(wrapper);
      expect(said()).toContain("The button now reads Save.");
    });
  });

  describe("the footer's summary", () => {
    const summary = (wrapper) =>
      wrapper.find("[data-testid='eld-count']").text();

    it("says what was done in its own words, each kind counted", async () => {
      const wrapper = await mountDialog();
      expect(summary(wrapper)).toBe("No changes");
      await deleteButton(wrapper, 3).trigger("click");
      await flushPromises();
      expect(summary(wrapper)).toBe("1 loader removed");
      await deleteButton(wrapper, 2).trigger("click");
      await flushPromises();
      expect(summary(wrapper)).toBe("2 loaders removed");
      await setStrength(wrapper, 0, "0.5");
      expect(summary(wrapper)).toBe("2 loaders removed, 1 strength changed");
    });

    it("counts a move as a move, whatever the dry run has yet to say", async () => {
      const wrapper = await mountDialog();
      await swapSecondAndThird(wrapper);
      expect(summary(wrapper)).toBe("1 loader moved");
    });
  });

  it.each(press)(
    "saves a moved loader straight away with %s, as the next version",
    async (_how, accept) => {
      dry = MOVED_22;
      const wrapper = await mountDialog();
      const store = useWorkflowsStore();
      const refetch = vi.spyOn(store, "refetch").mockResolvedValue();
      const select = vi.spyOn(store, "select");
      const push = vi.spyOn(useNoticeStore(), "push");
      await swapSecondAndThird(wrapper);

      expect(labelOf(primary(wrapper))).toBe("Save");
      expect(primary(wrapper).attributes("disabled")).toBeUndefined();
      expect(note(wrapper).text()).toBe(`Moving or adding a loader ${SAVE_NOTE}`);

      await accept(wrapper);
      await flushPromises();

      expect(saveLoraChain.mock.calls.at(-1)[0]).toBe(KEY);
      expect(sent(false)).toEqual([
        {
          entries: [
            { node_id: "14", strength: 1 },
            { node_id: "31", strength: 0.4 },
            { node_id: "22", strength: 0.85 },
            { node_id: "33", strength: 0.6 },
          ],
          name: null,
          dry_run: false,
          overwrite: true,
        },
      ]);
      expect(refetch).toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
      expect(push.mock.calls[0][0].text).toBe("Saved over “SDXL + face detailer”.");
      expect(wrapper.emitted("overwritten")).toEqual([[KEY]]);
      expect(wrapper.emitted("apply")).toBeUndefined();
      expect(wrapper.emitted("close")).toHaveLength(1);
    },
  );

  it("saves a strength for a LoRA the shelf has no digest for", async () => {
    dry = [{ kind: "strength", node_id: "33", text: "#33 hairstyle-v3 from 0.60 to 0.70" }];
    const wrapper = await mountDialog();
    await setStrength(wrapper, 3, "0.7");

    expect(labelOf(primary(wrapper))).toBe("Save");
    expect(note(wrapper).text()).toBe(
      `A strength for a LoRA missing from your model shelf ${SAVE_NOTE}`,
    );
    await primary(wrapper).trigger("click");
    await flushPromises();

    expect(sent(false)).toHaveLength(1);
    expect(sent(false)[0]).toMatchObject({ dry_run: false, overwrite: true });
    expect(sent(false)[0].entries.at(-1)).toEqual({ node_id: "33", strength: 0.7 });
    expect(wrapper.emitted("overwritten")).toEqual([[KEY]]);
    expect(wrapper.emitted("apply")).toBeUndefined();
  });

  it.each([
    [
      "a loader added",
      [
        { kind: "added", node_id: "34", text: "A loader added for skin-detail-xl at 1.00" },
        { kind: "rewired", node_id: "7", text: "#7 KSampler rewired" },
      ],
    ],
    ["a loader moved beside a delete", [...DELETED_33, ...MOVED_22]],
    // Not something the planner answers; if it ever did, nothing in the
    // unsaved changes would stand for it.
    ["a rewire with no delete", [{ kind: "rewired", node_id: "7", text: "#7 KSampler rewired" }]],
  ])("reads Save for %s, and hands nothing to the tab", async (_case, changes) => {
    dry = changes;
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();
    expect(labelOf(primary(wrapper))).toBe("Save");
    await primary(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(sent(false)).toHaveLength(1);
  });

  it("has Cancel and the one button, and never offers a new workflow", async () => {
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();
    expect(footer(wrapper)).toEqual(["Cancel", "Apply"]);
    dry = [...DELETED_33, ...MOVED_22];
    await swapSecondAndThird(wrapper);
    expect(footer(wrapper)).toEqual(["Cancel", "Save"]);

    expect(wrapper.find("[data-testid='eld-save-mode']").exists()).toBe(false);
    expect(wrapper.find("[role=radio]").exists()).toBe(false);
    // No name to ask for: nothing here makes a workflow.
    expect(wrapper.find("input[type=text]").exists()).toBe(false);
    expect(textOf(wrapper)).not.toMatch(
      /new workflow|the original|\bcopy\b|clone|\bfixed\b|\bedited\b/i,
    );
  });

  it("keeps focus on the button when its word changes", async () => {
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();
    const element = primary(wrapper).element;
    element.focus();
    expect(document.activeElement).toBe(element);

    // A drag moves no focus of its own, unlike Alt+arrow on the handle.
    dry = [...DELETED_33, ...MOVED_22];
    const rows = wrapper.findAll(".eld-row");
    await rows[1].find("[data-focus='handle']").trigger("dragstart");
    await rows[0].trigger("drop");
    await flushPromises();

    expect(labelOf(primary(wrapper))).toBe("Save");
    expect(primary(wrapper).element).toBe(element);
    expect(document.activeElement).toBe(element);
  });

  it("waits for the dry run of the edit on screen, one request at a time", async () => {
    const asked = [];
    saveLoraChain.mockImplementation(
      (_key, body) => new Promise((resolve) => asked.push({ body, resolve })),
    );
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();
    expect(textOf(wrapper)).toContain("Working out what changes…");
    expect(primary(wrapper).attributes("disabled")).toBeDefined();

    // A second edit while the first is still being asked about.
    await swapSecondAndThird(wrapper);
    expect(asked).toHaveLength(1);
    asked[0].resolve({ dry_run: true, changes: DELETED_33 });
    await flushPromises();

    // That answer is about the chain before the move: it is not listed and
    // not pressable, and the route is asked again for what is on screen.
    expect(wrapper.find("[data-testid='eld-changes']").exists()).toBe(false);
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    expect(asked).toHaveLength(2);
    expect(asked[1].body.entries.map((entry) => entry.node_id)).toEqual([
      "14",
      "31",
      "22",
    ]);
    asked[1].resolve({ dry_run: true, changes: [...DELETED_33, ...MOVED_22] });
    await flushPromises();
    expect(labelOf(primary(wrapper))).toBe("Save");
    expect(primary(wrapper).attributes("disabled")).toBeUndefined();

    // A third edit: the lines listed are the edit before it, so the button
    // and Enter wait for the route again.
    await button(wrapper, "Put back").trigger("click");
    await flushPromises();
    expect(asked).toHaveLength(3);
    expect(wrapper.find("[data-testid='eld-changes']").exists()).toBe(true);
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find(".app-dialog").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(asked).toHaveLength(3);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("says why when the route cannot say what an edit changes, and offers no press", async () => {
    saveLoraChain.mockRejectedValue({
      response: { status: 409, data: { detail: "Loader #33 cannot be rewired around." } },
    });
    const wrapper = await mountDialog();
    await deleteButton(wrapper, 3).trigger("click");
    await flushPromises();
    expect(wrapper.find("[role=alert]").text()).toContain(
      "Loader #33 cannot be rewired around.",
    );
    expect(primary(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find(".app-dialog").trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(saveLoraChain).toHaveBeenCalledTimes(1);
  });

  it("does not report a landed save as failed when the grid re-read throws", async () => {
    dry = MOVED_22;
    const wrapper = await mountDialog();
    vi.spyOn(useWorkflowsStore(), "refetch").mockRejectedValue(
      new Error("grid read failed"),
    );
    await swapSecondAndThird(wrapper);
    await primary(wrapper).trigger("click");
    await flushPromises();

    // Closed, with no alert: left open, a second press writes it again.
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    expect(wrapper.emitted("close")).toBeTruthy();
    expect(wrapper.emitted("overwritten")).toEqual([[KEY]]);
    expect(sent(false)).toHaveLength(1);
  });

  it("stays open and says why when the save is refused", async () => {
    dry = MOVED_22;
    const wrapper = await mountDialog();
    await swapSecondAndThird(wrapper);
    saveLoraChain.mockRejectedValueOnce({
      response: { status: 503, data: { detail: "ComfyUI did not answer." } },
    });
    await primary(wrapper).trigger("click");
    await flushPromises();
    expect(wrapper.find("[role=alert]").text()).toContain("ComfyUI did not answer.");
    expect(wrapper.emitted("close")).toBeFalsy();
    expect(wrapper.emitted("overwritten")).toBeUndefined();
    // The edit is still on screen, and still pressable.
    expect(primary(wrapper).attributes("disabled")).toBeUndefined();
  });
});

describe("read-only", () => {
  it("shows the planner's sentence and offers no edit", async () => {
    getLoraChain.mockResolvedValue(
      chain({
        editable: false,
        refusal: "ComfyUI did not answer, so the chain cannot be typed.",
      }),
    );
    const wrapper = await mountDialog();
    expect(textOf(wrapper)).toContain(
      "ComfyUI did not answer, so the chain cannot be typed.",
    );
    // The list is still shown, as read.
    expect(rowNames(wrapper)).toHaveLength(4);
    expect(deleteButton(wrapper, 0).attributes("disabled")).toBeDefined();
    expect(
      wrapper.findAll(".eld-row")[0].find("[data-focus='handle']").attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.findAll(".eld-row")[0].find("[data-focus='handle']").attributes("draggable"),
    ).toBe("false");
    expect(button(wrapper, "Add a LoRA").attributes("disabled")).toBeDefined();
    expect(primary(wrapper).exists()).toBe(false);
    expect(button(wrapper, "Close").exists()).toBe(true);
  });
});

describe("opened from Save as recipe", () => {
  it("opens with the named loader already deleted, matched case-folded", async () => {
    const wrapper = await mountDialog({ dropLora: "hairstyle-v3.safetensors" });
    const row = wrapper.findAll(".eld-row")[3];
    expect(row.classes()).toContain("eld-row--deleted");
    expect(row.text()).toContain("Put back");
    expect(textOf(wrapper)).toContain("1 loader removed");
    // Asked about as it opens, so the delete is one press from the tab.
    expect(labelOf(primary(wrapper))).toBe("Apply");
    expect(primary(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("says so when the chain has no loader for it", async () => {
    const wrapper = await mountDialog({ dropLora: "elsewhere.safetensors" });
    expect(textOf(wrapper)).toContain(
      "This workflow has no loader for elsewhere.safetensors",
    );
    expect(textOf(wrapper)).toContain("No changes");
  });
});

describe("a forked chain, drawn side by side", () => {
  function forked(overrides = {}) {
    return chain({
      loaders: [
        loader("10", "film-look-v2.safetensors", 0.6),
        loader("11", "hairstyle-v3.safetensors", 0.65),
      ],
      sink: {
        summary: "2 text encoders read clip",
        consumers: [
          { node_id: "6", class_type: "CLIPTextEncode", field: "clip", type: "CLIP" },
        ],
      },
      lanes: [
        {
          source: null,
          sampler: { node_id: "3", class_type: "KSampler", title: "Base pass" },
          sink: { summary: "KSampler #3 reads model", consumers: [] },
          loaders: [loader("12", "lightning-8step.safetensors", 1.0)],
          added_loader_class: "LoraLoaderModelOnly",
        },
        {
          source: null,
          sampler: { node_id: "15", class_type: "KSampler", title: null },
          sink: { summary: "KSampler #15 reads model", consumers: [] },
          loaders: [loader("13", "detail-tweaker-xl.safetensors", 0.5)],
          added_loader_class: "LoraLoaderModelOnly",
        },
      ],
      ...overrides,
    });
  }

  function laneRows(wrapper, index) {
    const lane = wrapper.findAll("[data-testid='eld-lane']")[index];
    return lane
      .findAll(".eld-row")
      .map((row) => row.find(".eld-name-text").text());
  }

  it("draws the shared loaders once, then one lane per pass with its sampler", async () => {
    getLoraChain.mockResolvedValue(forked());
    const wrapper = await mountDialog();
    const trunk = wrapper.find("[data-testid='eld-trunk']");
    expect(trunk.text()).toContain("Both passes");
    expect(trunk.findAll(".eld-row").map((row) => row.find(".eld-name-text").text())).toEqual([
      "film-look-v2",
      "hairstyle-v3",
    ]);
    const lanes = wrapper.findAll("[data-testid='eld-lane']");
    expect(lanes.map((lane) => lane.find(".eld-lane-head").text().replace(/\s+/g, " "))).toEqual([
      "Base pass KSampler #3 · 3 LoRAs in all",
      "KSampler #15 3 LoRAs in all",
    ]);
    expect(laneRows(wrapper, 0)).toEqual(["lightning-8step"]);
    expect(laneRows(wrapper, 1)).toEqual(["detail-tweaker-xl"]);
    // A lane row counts on from the trunk: the third LoRA its sampler gets.
    expect(lanes[1].find(".eld-pos").text()).toBe("3");
  });

  it("moves a loader across the fork from the row menu, and sends each pass", async () => {
    getLoraChain.mockResolvedValue(forked());
    const wrapper = await mountDialog();
    const hires = wrapper.findAll("[data-testid='eld-lane']")[1].find(".eld-row");
    const targets = hires.findAll("[data-move]").map((item) => item.text());
    expect(targets).toEqual(["Move to both passes", "Move to Base pass"]);
    await hires.find("[data-move='0']").trigger("click");
    await flushPromises();

    expect(laneRows(wrapper, 0)).toEqual(["lightning-8step", "detail-tweaker-xl"]);
    expect(laneRows(wrapper, 1)).toEqual([]);
    expect(wrapper.find("[role=status][aria-live=polite]").text()).toBe(
      "detail-tweaker-xl moved to Base pass, at 4.",
    );
    expect(textOf(wrapper)).toContain("1 loader moved");

    const body = sent(true).at(-1);
    expect(body.entries.map((entry) => entry.node_id)).toEqual(["10", "11"]);
    expect(body.lanes.map((lane) => lane.map((entry) => entry.node_id))).toEqual([
      ["12", "13"],
      [],
    ]);
  });

  it("says which pass a row dropped across the fork landed in", async () => {
    getLoraChain.mockResolvedValue(forked());
    const wrapper = await mountDialog();
    const lanes = wrapper.findAll("[data-testid='eld-lane']");
    await lanes[1].find("[data-focus='handle']").trigger("dragstart");
    await lanes[0].find(".eld-row").trigger("drop");
    await flushPromises();
    expect(laneRows(wrapper, 0)).toEqual(["detail-tweaker-xl", "lightning-8step"]);
    expect(wrapper.find("[role=status][aria-live=polite]").text()).toBe(
      "detail-tweaker-xl moved to Base pass, at 3.",
    );
  });

  it("keeps Alt+arrow inside the row's own segment", async () => {
    getLoraChain.mockResolvedValue(forked());
    const wrapper = await mountDialog();
    const last = wrapper.find("[data-testid='eld-trunk']").findAll(".eld-row")[1];
    await last.find("[data-focus='handle']").trigger("keydown", {
      key: "ArrowDown",
      altKey: true,
    });
    await flushPromises();
    expect(laneRows(wrapper, 0)).toEqual(["lightning-8step"]);
    expect(textOf(wrapper)).toContain("No changes");
    // Nothing moved, so nothing is announced as moving.
    expect(wrapper.find("[role=status][aria-live=polite]").text()).toBe("");
  });

  it("adds a LoRA to one pass only", async () => {
    getLoraChain.mockResolvedValue(forked());
    const wrapper = await mountDialog();
    const lane = wrapper.findAll("[data-testid='eld-lane']")[1];
    await lane.find("button[aria-label='Add a LoRA for KSampler #15 only']").trigger("click");
    await flushPromises();
    await wrapper.find("select").setValue("sha-skin");
    await flushPromises();
    const body = sent(true).at(-1);
    expect(body.lanes[1]).toEqual([
      { node_id: "13", strength: 0.5 },
      { node_id: null, sha256: "sha-skin", strength: 1 },
    ]);
    expect(body.lanes[0]).toEqual([{ node_id: "12", strength: 1 }]);
  });

  it("has no trunk when every pass loads its own model", async () => {
    const [base, hires] = forked().lanes;
    getLoraChain.mockResolvedValue(
      forked({
        source: null,
        loaders: [],
        lanes: [
          { ...base, source: { node_id: "1", class_type: "UNETLoader", outputs: ["MODEL"] } },
          { ...hires, source: { node_id: "2", class_type: "UNETLoader", outputs: ["MODEL"] } },
        ],
      }),
    );
    const wrapper = await mountDialog();
    expect(wrapper.find("[data-testid='eld-trunk']").exists()).toBe(false);
    expect(wrapper.find(".eld-fork").exists()).toBe(false);
    const row = wrapper.findAll("[data-testid='eld-lane']")[0].find(".eld-row");
    expect(row.findAll("[data-move]").map((item) => item.text())).toEqual([
      "Move to KSampler #15",
    ]);
  });
});
