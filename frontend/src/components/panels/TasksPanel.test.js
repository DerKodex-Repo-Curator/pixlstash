// The task manager's body, now that two inspectors mount it.
//
// The rows themselves moved out of StatsSidebar untouched, so what is worth
// asserting is what the move made possible to get wrong:
//
// * the fast poll cadence, which used to follow the selected tab and now
//   follows this component being mounted. Nothing asserted it before, and it
//   is the one behaviour the extraction deliberately changed;
// * that the panel renders each kind of entry at all, in a file that is not
//   also about tags or about workflows.

import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const getWorkflowChanges = vi.fn();
const saveWorkflow = vi.fn();
const saveWorkflowAsNew = vi.fn();
// The rest of the module is the Workflows store's, which the panel only reads.
vi.mock("../../api/workflows", async (original) => ({
  ...(await original()),
  getWorkflowChanges: (...args) => getWorkflowChanges(...args),
  saveWorkflow: (...args) => saveWorkflow(...args),
  saveWorkflowAsNew: (...args) => saveWorkflowAsNew(...args),
}));
const readOnly = vi.hoisted(() => ({ ref: null }));
vi.mock("../../utils/apiClient", async (original) => {
  const { ref: makeRef } = await import("vue");
  readOnly.ref = makeRef(false);
  return { ...(await original()), isReadOnly: readOnly.ref };
});

import TasksPanel, { tasksTabFor } from "./TasksPanel.vue";
import { useNoticeStore } from "../../stores/useNoticeStore";
import { useRunDialogStore } from "../../stores/useRunDialogStore";
import { useTasksStore } from "../../stores/useTasksStore";
import { useWorkflowsStore } from "../../stores/useWorkflowsStore";
import { abortRun } from "../../api/comfyui";

vi.mock("../../api/comfyui", () => ({ abortRun: vi.fn(async () => ({})) }));

const globalOpts = { global: { stubs: { "v-icon": true, Tooltip: true } } };

function textOf(wrapper) {
  return wrapper.text().replace(/\s+/g, " ");
}

// Every panel a test mounts is taken down again, its watchers with it.
enableAutoUnmount(afterEach);

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  readOnly.ref.value = false;
  getWorkflowChanges.mockReset();
  saveWorkflow.mockReset();
  saveWorkflowAsNew.mockReset();
});

describe("the tab the hosts declare", () => {
  // Both inspectors take their descriptor from here, so this is the only place
  // its wording is decided — and the only place it can be wrong. Asserting the
  // tooltip as a hand-written prop on AppInspector tested the band, not this.
  it("counts in words, and says one task in the singular", () => {
    const tasksStore = useTasksStore();
    expect(tasksTabFor(tasksStore)).toEqual({
      value: "tasks",
      label: "Tasks",
      icon: "mdi-timeline-clock-outline",
    });

    tasksStore.comfyuiRuns = [{ prompt_id: "run-1", label: "One" }];
    expect(tasksTabFor(tasksStore)).toMatchObject({
      busy: true,
      busyTooltip: "1 active task",
    });

    tasksStore.setImportRun("import-1", { label: "Two" });
    expect(tasksTabFor(tasksStore)).toMatchObject({
      busy: true,
      busyTooltip: "2 active tasks",
    });
  });
});

describe("the task manager's poll cadence", () => {
  // Mounted IS "the tab is on screen": an inspector unmounts its body when the
  // rail collapses, so this follows what is visible rather than which tab was
  // last picked. Nothing else in the app calls setTasksTabOpen.
  it("asks for the fast cadence while it is mounted, and gives it back", () => {
    const tasksStore = useTasksStore();
    const spy = vi.spyOn(tasksStore, "setTasksTabOpen");
    expect(tasksStore.tasksTabOpen).toBe(false);

    const wrapper = mount(TasksPanel, globalOpts);
    expect(spy).toHaveBeenCalledWith(true);
    expect(tasksStore.tasksTabOpen).toBe(true);

    wrapper.unmount();
    expect(spy).toHaveBeenLastCalledWith(false);
    expect(tasksStore.tasksTabOpen).toBe(false);
  });

  // The store counts panels rather than holding a flag: one host's unmount
  // must not drop the cadence back to idle under another host that is still
  // showing the panel. Not reachable while the two inspectors are `v-if` /
  // `v-else` siblings; the panel is shared on purpose, so it is asserted.
  it("stays fast while any panel is still mounted", () => {
    const tasksStore = useTasksStore();
    const first = mount(TasksPanel, globalOpts);
    const second = mount(TasksPanel, globalOpts);
    expect(tasksStore.tasksTabOpen).toBe(true);

    first.unmount();
    expect(tasksStore.tasksTabOpen).toBe(true);

    second.unmount();
    expect(tasksStore.tasksTabOpen).toBe(false);
  });
});

describe("what the task manager shows", () => {
  it("says so when there is nothing running", () => {
    const wrapper = mount(TasksPanel, globalOpts);
    expect(textOf(wrapper)).toContain("No active tasks");
    expect(wrapper.find(".tm-worker-row").exists()).toBe(false);
  });

  // #1862: the runs are what the backend's poll reported and nothing else, so
  // the row is there with no view mounted to follow them - a run another tab
  // or MCP started included.
  it("draws the runs the backend reports, with progress and an abort", async () => {
    const tasksStore = useTasksStore();
    tasksStore.comfyuiRuns = [
      { prompt_id: "p-1", label: "Night market", status: "queued", percent: 0 },
      {
        prompt_id: "p-2",
        label: "Cinematic portrait",
        status: "running",
        percent: 40,
      },
      { prompt_id: "p-3", label: "Upscale", status: "queued", percent: 0 },
    ];
    const wrapper = mount(TasksPanel, globalOpts);
    const text = textOf(wrapper);
    expect(text).not.toContain("No active tasks");
    // One row, named for the run ComfyUI is on, counting the rest.
    expect(wrapper.findAll(".tm-worker-row")).toHaveLength(1);
    expect(text).toContain("Cinematic portrait");
    expect(text).toContain("ComfyUI running… 2 more queued");
    expect(wrapper.find(".tm-comfy-fill").attributes("style")).toContain(
      "width: 40%",
    );

    // The abort asks the backend, not a handler some view registered.
    const abort = wrapper.find('button[aria-label="Abort ComfyUI run"]');
    expect(abort.exists()).toBe(true);
    expect(abortRun).not.toHaveBeenCalled();
    await abort.trigger("click");
    expect(abortRun).toHaveBeenCalledTimes(1);
  });

  it("names the first run in line while none has started", () => {
    const tasksStore = useTasksStore();
    tasksStore.comfyuiRuns = [
      { prompt_id: "p-1", label: "Night market", status: "queued", percent: 0 },
    ];
    const text = textOf(mount(TasksPanel, globalOpts));
    expect(text).toContain("Night market");
    expect(text).toContain("ComfyUI queued…");
    expect(text).not.toContain("more queued");
  });

  it("gives an import row the FLIP target the import dialog flies into", () => {
    const tasksStore = useTasksStore();
    tasksStore.setImportRun("import-7", {
      status: "running",
      percent: 25,
      current: 5,
      total: 20,
      label: "Importing pictures",
      message: "Importing on the server…",
    });
    const wrapper = mount(TasksPanel, globalOpts);
    // ImageImporter finds the row by this attribute; a renamed one would land
    // the chip nowhere and the flight would read as "the import went missing".
    expect(wrapper.find('[data-import-task-row="import-7"]').exists()).toBe(
      true,
    );
    expect(textOf(wrapper)).toContain("5 / 20");
  });

  it("reads the machine out, and says n/a rather than a wrong number", () => {
    const tasksStore = useTasksStore();
    tasksStore.systemUsage = {
      cpu_percent_all_cores: 42,
      ram_used_gb: 12.3,
      ram_total_gb: 64,
      ram_percent: 19.2,
    };
    const wrapper = mount(TasksPanel, globalOpts);
    const items = wrapper
      .findAll(".tm-system-item")
      .map((i) => [
        i.find(".tm-system-label").text(),
        i.find(".tm-system-value").text(),
      ]);
    // No VRAM reading at all is a fact about the machine, not a zero.
    expect(items).toEqual([
      ["CPU", "42%"],
      ["RAM", "12.3 GB / 64.0 GB (19%)"],
      ["VRAM", "n/a"],
    ]);
  });
});

// ── Save what a run changed (#1850) ──────────────────────────────────────
//
// The Run popup's two verbs again, after the pictures are back. What can go
// wrong quietly: an offer drawn from this tab's own memory of a run when the
// server no longer holds one (saved elsewhere, run again), a save sent that
// is not the set the run was made with, and a row that takes the keyboard
// away with it.
describe("the offer to save what a run changed", () => {
  const WF = `auto:${"a".repeat(64)}`;
  const OTHER = `auto:${"b".repeat(64)}`;
  const RAN = {
    models: [{ address: "core:CheckpointLoader/ckpt_name", filename: "juggernautXL.safetensors" }],
    loras: [],
    skip_loras: [{ node_id: "8", field: "lora_name" }],
    stages: {},
    values: [{ slot_label: "KSampler", input_name: "steps", value: 32 }],
  };
  const OPEN = { open: true, reason: null };
  const state = (overrides = {}) => ({
    workflow_id: WF,
    version: 3,
    waiting: null,
    count: 0,
    ran: RAN,
    save: { open: false, reason: "Nothing to save." },
    save_as_new: OPEN,
    ran_save: OPEN,
    ...overrides,
  });
  const record = {
    name: "Portrait, soft window light",
    count: 3,
    text: "Checkpoint, 1 LoRA removed, Steps.",
    promptIds: ["p-1"],
  };
  const completed = {
    plugin: "ComfyUI",
    status: "completed",
    run_id: "comfyui-p-1",
    workflow_id: WF,
  };
  const offer = (wrapper, id = WF) => wrapper.find(`[data-offer="${id}"]`);
  const button = (wrapper, text) =>
    wrapper.findAll("button").find((b) => b.text().trim() === text);
  const refusal = (status, detail) => ({ response: { status, data: { detail } } });

  async function mountPanel() {
    const wrapper = mount(TasksPanel, { ...globalOpts, attachTo: document.body });
    await flushPromises();
    return wrapper;
  }

  /** A changed run of a workflow, queued from the popup and finished. */
  function ranAndFinished(workflowId = WF, name = record.name) {
    const runDialog = useRunDialogStore();
    runDialog.ranWith(workflowId, { ...record, name });
    runDialog.runEvent({ ...completed, workflow_id: workflowId });
    return runDialog;
  }
  const doneLine = (wrapper) => wrapper.find('[data-testid="tm-offer-done"]');

  beforeEach(() => {
    getWorkflowChanges.mockResolvedValue(state());
    saveWorkflow.mockResolvedValue({ workflow_id: WF, version: 4 });
  });

  it("asks nothing and offers nothing where no run changed anything", async () => {
    const wrapper = await mountPanel();
    expect(getWorkflowChanges).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="tm-offers"]').exists()).toBe(false);
    expect(textOf(wrapper)).toContain("No active tasks");
  });

  it("waits for the run's pictures, then says what it changed in the band's words", async () => {
    const runDialog = useRunDialogStore();
    runDialog.ranWith(WF, record);
    const wrapper = await mountPanel();
    // Queued, not finished: nothing to decide yet.
    expect(getWorkflowChanges).not.toHaveBeenCalled();
    expect(offer(wrapper).exists()).toBe(false);

    runDialog.runEvent(completed);
    await flushPromises();
    expect(getWorkflowChanges).toHaveBeenCalledWith(WF);
    expect(textOf(offer(wrapper))).toContain(
      "Ran with 3 changes from the workflow: Checkpoint, 1 LoRA removed, Steps.",
    );
    expect(textOf(offer(wrapper))).toContain("Portrait, soft window light");
    expect(button(wrapper, "Save")).toBeTruthy();
    expect(button(wrapper, "Save as new…")).toBeTruthy();
    // The panel is not empty with an offer in it.
    expect(textOf(wrapper)).not.toContain("No active tasks");
  });

  it("draws nothing the server does not hold, whatever this tab remembers", async () => {
    // Saved from another tab, or the workflow ran again from the grid.
    getWorkflowChanges.mockResolvedValue(state({ ran: null, ran_save: null }));
    ranAndFinished();
    const wrapper = await mountPanel();
    expect(getWorkflowChanges).toHaveBeenCalledWith(WF);
    expect(offer(wrapper).exists()).toBe(false);
    expect(textOf(wrapper)).toContain("No active tasks");
  });

  it("offers what it could read when one workflow's answer does not come", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getWorkflowChanges.mockImplementation((id) =>
      id === WF ? Promise.reject(new Error("Network Error")) : Promise.resolve(state()),
    );
    ranAndFinished(WF);
    ranAndFinished(OTHER, "Night market");
    const wrapper = await mountPanel();
    // Not knowing is not an offer, and it does not cost the other its own.
    expect(offer(wrapper, WF).exists()).toBe(false);
    expect(textOf(offer(wrapper, OTHER))).toContain("Night market");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("offers the selected workflow's from the server alone after a reload, with a count", async () => {
    const workflows = useWorkflowsStore();
    workflows.cards = [{ id: WF, name: "Portrait, soft window light" }];
    workflows.selectedKeys = [WF];
    const wrapper = await mountPanel();
    expect(getWorkflowChanges).toHaveBeenCalledWith(WF);
    // The labels were the popup's: width and height apart, no Size, no names.
    expect(textOf(offer(wrapper))).toContain("Ran with 3 changes from the workflow.");
    expect(textOf(offer(wrapper))).not.toContain("Checkpoint");
    expect(textOf(offer(wrapper))).toContain("Portrait, soft window light");
  });

  it("does not offer a selected workflow whose run is still out", async () => {
    const workflows = useWorkflowsStore();
    workflows.selectedKeys = [WF];
    useRunDialogStore().ranWith(WF, record);
    const wrapper = await mountPanel();
    expect(offer(wrapper).exists()).toBe(false);
  });

  it("saves exactly what the run was made with, as a save from a run", async () => {
    const runDialog = ranAndFinished();
    const workflows = useWorkflowsStore();
    const reread = vi.spyOn(workflows, "invalidate");
    const wrapper = await mountPanel();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();

    expect(saveWorkflow).toHaveBeenCalledWith(WF, {
      changes: RAN,
      version: 3,
      from_run: true,
    });
    // The offer goes, said where it was, with the keyboard on that line.
    expect(offer(wrapper).exists()).toBe(false);
    const done = doneLine(wrapper);
    expect(done.text()).toBe("Saved to Portrait, soft window light.");
    expect(document.activeElement).toBe(done.element);
    expect(runDialog.ranChanges[WF]).toBeUndefined();
    expect(runDialog.saved).toMatchObject({ workflowId: WF, savedAs: "" });
    expect(reread).toHaveBeenCalled();
  });

  it("does not redraw an offer from an answer asked before the save", async () => {
    ranAndFinished();
    const workflows = useWorkflowsStore();
    // Selected as well, so it is still asked about once its record is gone.
    workflows.selectedKeys = [WF];
    const wrapper = await mountPanel();
    const answer = [];
    getWorkflowChanges.mockImplementation(
      () => new Promise((resolve) => answer.push(resolve)),
    );
    // The grid is read again: a second asking, still out when Save is pressed.
    workflows.cards = [{ id: WF, name: record.name }];
    await flushPromises();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(answer).toHaveLength(2);
    // The asking made after the save is answered first, the one before it last.
    answer[1](state({ ran: null, ran_save: null }));
    await flushPromises();
    answer[0](state());
    await flushPromises();
    expect(offer(wrapper).exists()).toBe(false);
    expect(doneLine(wrapper).text()).toBe("Saved to Portrait, soft window light.");
  });

  it("sends one save at a time, whichever Save is pressed while it is out", async () => {
    let land;
    saveWorkflow.mockImplementation(() => new Promise((resolve) => (land = resolve)));
    ranAndFinished(WF);
    ranAndFinished(OTHER, "Night market");
    const wrapper = await mountPanel();
    const save = button(offer(wrapper, WF), "Save");
    // Twice before the button has been drawn busy, then the other row's.
    save.trigger("click");
    save.trigger("click");
    await flushPromises();
    // No verb of either row looks live while it would be dropped.
    const closed = (id, text) => button(offer(wrapper, id), text).attributes("disabled");
    for (const id of [WF, OTHER]) {
      expect(closed(id, "Save")).toBeDefined();
      expect(closed(id, "Save as new…")).toBeDefined();
    }
    await button(offer(wrapper, OTHER), "Save").trigger("click");
    await flushPromises();
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
    expect(saveWorkflow.mock.calls[0][0]).toBe(WF);

    land({ workflow_id: WF, version: 4 });
    await flushPromises();
    expect(offer(wrapper, WF).exists()).toBe(false);
    expect(closed(OTHER, "Save")).toBeUndefined();
    expect(closed(OTHER, "Save as new…")).toBeUndefined();
  });

  it("closes a row's name question while another row's save is out", async () => {
    let land;
    saveWorkflow.mockImplementation(() => new Promise((resolve) => (land = resolve)));
    ranAndFinished(WF);
    ranAndFinished(OTHER, "Night market");
    const wrapper = await mountPanel();
    await button(offer(wrapper, WF), "Save as new…").trigger("click");
    await flushPromises();
    await button(offer(wrapper, OTHER), "Save").trigger("click");
    await flushPromises();

    const asking = offer(wrapper, WF);
    const name = asking.find("input");
    expect(button(asking, "Back").attributes("disabled")).toBeDefined();
    expect(button(asking, "Save as new workflow").attributes("disabled")).toBeDefined();
    expect(name.attributes("readonly")).toBeDefined();
    // The keys wait as the buttons do: no second write, and no leaving.
    await name.trigger("keydown", { key: "Enter" });
    await name.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(saveWorkflowAsNew).not.toHaveBeenCalled();
    expect(offer(wrapper, WF).find("input").exists()).toBe(true);

    // The other row's save landing does not answer this row's question.
    land({ workflow_id: OTHER, version: 4 });
    await flushPromises();
    expect(offer(wrapper, OTHER).exists()).toBe(false);
    expect(name.element.value).toBe("Portrait, soft window light 2");
    expect(button(asking, "Back").attributes("disabled")).toBeUndefined();
    expect(button(asking, "Save as new workflow").attributes("disabled")).toBeUndefined();
    expect(name.attributes("readonly")).toBeUndefined();
  });

  it("prints the server's reason for a closed Save and sends nothing", async () => {
    const reason = "A checkpoint change is saved as a new workflow.";
    getWorkflowChanges.mockResolvedValue(state({ ran_save: { open: false, reason } }));
    ranAndFinished();
    const wrapper = await mountPanel();
    const save = button(wrapper, "Save");
    const why = offer(wrapper).find(".tm-offer-why");
    expect(why.text()).toBe(reason);
    expect(save.attributes("disabled")).toBeUndefined();
    expect(save.attributes("aria-disabled")).toBe("true");
    expect(save.attributes("aria-describedby")).toBe(why.attributes("id"));
    await save.trigger("click");
    await flushPromises();
    expect(saveWorkflow).not.toHaveBeenCalled();
    // Save as new… is always open.
    expect(button(wrapper, "Save as new…").attributes("aria-disabled")).toBeUndefined();
  });

  it("asks for a name for Save as new…, and Back gives the two verbs back", async () => {
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    const name = offer(wrapper).find("input");
    expect(document.activeElement).toBe(name.element);
    expect(name.element.value).toBe("Portrait, soft window light 2");
    expect(name.element.value).not.toMatch(/copy|clone|fixed|edited/i);
    expect(button(wrapper, "Save")).toBeUndefined();

    await button(wrapper, "Back").trigger("click");
    await flushPromises();
    expect(offer(wrapper).find("input").exists()).toBe(false);
    expect(document.activeElement).toBe(button(wrapper, "Save as new…").element);
    expect(saveWorkflowAsNew).not.toHaveBeenCalled();
  });

  // Two rows, one name question between them. Rows are patched in order, so
  // the row that starts asking is mounted before or after the row that stops,
  // depending on which is higher: the keyboard goes to the asking one's field
  // either way.
  it.each([
    ["an earlier row while a later one is asking", OTHER, WF],
    ["a later row while an earlier one is asking", WF, OTHER],
  ])("puts the keyboard in the name field of %s", async (_name, first, second) => {
    ranAndFinished(WF);
    ranAndFinished(OTHER, "Night market");
    const wrapper = await mountPanel();
    expect(
      wrapper.findAll("[data-offer]").map((row) => row.attributes("data-offer")),
    ).toEqual([WF, OTHER]);
    await button(offer(wrapper, first), "Save as new…").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(offer(wrapper, first).find("input").element);

    await button(offer(wrapper, second), "Save as new…").trigger("click");
    await flushPromises();
    expect(offer(wrapper, first).find("input").exists()).toBe(false);
    const name = offer(wrapper, second).find("input").element;
    expect(document.activeElement).toBe(name);
    // Selected, to be typed over.
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, name.value.length]);
  });

  it("takes Enter in the name field as the save, and Escape as Back", async () => {
    saveWorkflowAsNew.mockResolvedValue({ workflow_id: OTHER, new_workflow: true });
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    await offer(wrapper).find("input").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(offer(wrapper).find("input").exists()).toBe(false);
    expect(document.activeElement).toBe(button(wrapper, "Save as new…").element);

    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    const name = offer(wrapper).find("input");
    // Twice before the field has been drawn busy: one new workflow, not two.
    name.trigger("keydown", { key: "Enter" });
    name.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(saveWorkflowAsNew).toHaveBeenCalledTimes(1);
    expect(saveWorkflowAsNew).toHaveBeenCalledWith(WF, {
      name: "Portrait, soft window light 2",
      changes: RAN,
      from_run: true,
    });
    expect(doneLine(wrapper).text()).toBe("Saved as Portrait, soft window light 2.");
  });

  it("stores the run's changes as a new workflow under the name given", async () => {
    saveWorkflowAsNew.mockResolvedValue({
      workflow_id: OTHER,
      name: "Portrait on Juggernaut",
      new_workflow: true,
    });
    const runDialog = ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    await offer(wrapper).find("input").setValue(" Portrait on Juggernaut ");
    await button(wrapper, "Save as new workflow").trigger("click");
    await flushPromises();

    expect(saveWorkflowAsNew).toHaveBeenCalledWith(WF, {
      name: "Portrait on Juggernaut",
      changes: RAN,
      from_run: true,
    });
    expect(saveWorkflow).not.toHaveBeenCalled();
    expect(doneLine(wrapper).text()).toBe("Saved as Portrait on Juggernaut.");
    expect(runDialog.saved).toMatchObject({ workflowId: WF, savedAs: OTHER });
  });

  it("sends no new workflow without a name", async () => {
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    await offer(wrapper).find("input").setValue("  ");
    await button(wrapper, "Save as new workflow").trigger("click");
    await flushPromises();
    expect(saveWorkflowAsNew).not.toHaveBeenCalled();
  });

  it("keeps the offer and prints the server's sentence when a save is refused", async () => {
    saveWorkflow.mockRejectedValue(
      refusal(409, "This workflow got a newer version since these changes were made."),
    );
    const runDialog = ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(offer(wrapper).find('[role="alert"]').text()).toBe(
      "This workflow got a newer version since these changes were made.",
    );
    expect(runDialog.ranChanges[WF]).toBeDefined();
    expect(runDialog.saved).toBeNull();
  });

  it("keeps asking for the name and prints the server's sentence when Save as new is refused", async () => {
    saveWorkflowAsNew.mockRejectedValue(
      refusal(409, "A checkpoint this machine does not have cannot be saved."),
    );
    const runDialog = ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    await offer(wrapper).find("input").setValue("Portrait on Juggernaut");
    await button(wrapper, "Save as new workflow").trigger("click");
    await flushPromises();
    expect(offer(wrapper).find('[role="alert"]').text()).toBe(
      "A checkpoint this machine does not have cannot be saved.",
    );
    // Still the question, with what was typed, and open to be sent again.
    const name = offer(wrapper).find("input");
    expect(name.element.value).toBe("Portrait on Juggernaut");
    expect(name.attributes("disabled")).toBeUndefined();
    expect(doneLine(wrapper).exists()).toBe(false);
    expect(runDialog.ranChanges[WF]).toBeDefined();
    expect(runDialog.saved).toBeNull();
  });

  // Enter leaves the keyboard in the name field, so the field must be able
  // to keep it while the write is out. jsdom does not take focus from a field
  // that is disabled; a browser does, so what is asserted is that it never is.
  it("keeps the keyboard in the name field through a Save as new that is refused", async () => {
    let refuse;
    saveWorkflowAsNew.mockImplementation(
      () => new Promise((_resolve, reject) => (refuse = reject)),
    );
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save as new…").trigger("click");
    await flushPromises();
    const name = offer(wrapper).find("input");
    await name.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(saveWorkflowAsNew).toHaveBeenCalledTimes(1);
    expect(name.attributes("disabled")).toBeUndefined();
    expect(name.attributes("readonly")).toBeDefined();
    expect(document.activeElement).toBe(name.element);
    // Escape waits for the write, as Back does.
    await name.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(offer(wrapper).find("input").exists()).toBe(true);

    refuse(refusal(409, "A checkpoint this machine does not have cannot be saved."));
    await flushPromises();
    // Said by the alert, with the keyboard where the answer is typed.
    expect(offer(wrapper).find('[role="alert"]').text()).toBe(
      "A checkpoint this machine does not have cannot be saved.",
    );
    expect(document.activeElement).toBe(name.element);
    expect(name.attributes("readonly")).toBeUndefined();
  });

  it("says ComfyUI did not answer on a 503", async () => {
    saveWorkflow.mockRejectedValue(refusal(503, "something upstream"));
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(offer(wrapper).find('[role="alert"]').text()).toContain(
      "ComfyUI did not answer, so nothing was saved.",
    );
  });

  // The line is the receipt of the last save made here. What it must never
  // do is sit beside something newer as if it were the news.
  it("leaves a save's line beside an offer that was there before it, and a later save writes over it", async () => {
    ranAndFinished(WF);
    ranAndFinished(OTHER, "Night market");
    const wrapper = await mountPanel();
    const lines = () =>
      wrapper.findAll('[data-testid="tm-offer-done"]').map((line) => line.text());
    await button(offer(wrapper, WF), "Save").trigger("click");
    await flushPromises();
    expect(lines()).toEqual(["Saved to Portrait, soft window light."]);
    expect(offer(wrapper, OTHER).exists()).toBe(true);

    await button(offer(wrapper, OTHER), "Save").trigger("click");
    await flushPromises();
    expect(lines()).toEqual(["Saved to Night market."]);
    expect(document.activeElement).toBe(doneLine(wrapper).element);
  });

  it("takes a save's line down when an offer arrives after it, and hands on the keyboard it held", async () => {
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(doneLine(wrapper).element);

    // Another workflow's run comes back with changes of its own.
    ranAndFinished(OTHER, "Night market");
    await flushPromises();
    expect(offer(wrapper, OTHER).exists()).toBe(true);
    expect(doneLine(wrapper).exists()).toBe(false);
    // Not left on a line that is gone, with the page to tab through again.
    expect(document.activeElement).toBe(button(wrapper, "Save as new…").element);
  });

  it("leaves the keyboard alone when the line it takes down did not hold it", async () => {
    ranAndFinished();
    const wrapper = await mountPanel();
    await button(wrapper, "Save").trigger("click");
    await flushPromises();
    doneLine(wrapper).element.blur();

    ranAndFinished(OTHER, "Night market");
    await flushPromises();
    expect(doneLine(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  // A save from a run writes what the run used. What was changed in the
  // Workflow tab after the run is either still waiting there or, where the
  // saved workflow cannot take it, gone. The server says which once, so a
  // receipt that says "Saved" and no more reads as the save having lost it.
  describe("what a save left of the changes made after the run", () => {
    // A model for a loader that is gone, and a LoRA set on one the run removed.
    const NOT_KEPT = {
      models: [{ address: "core:CheckpointLoader/ckpt_name", filename: "dreamshaper.safetensors" }],
      loras: [{ node_id: "8", field: "lora_name", sha256: "c".repeat(64), strength_model: 0.8 }],
      skip_loras: [],
      stages: {},
      values: [],
    };
    const RECEIPT = "Saved to Portrait, soft window light.";
    const LOST =
      "Could not keep 2 changes made after the run: Checkpoint, 1 LoRA changed. The saved workflow no longer has what was changed, so this is gone: not saved, and not left waiting.";
    const waiting = (count) =>
      `Portrait, soft window light still has ${count} waiting in the Workflow tab. They were not part of this save.`;
    const lostLine = (wrapper) => wrapper.find(".tm-offer-lost");

    async function saved(answer) {
      saveWorkflow.mockResolvedValue({ workflow_id: WF, version: 4, ...answer });
      ranAndFinished();
      const wrapper = await mountPanel();
      await button(wrapper, "Save").trigger("click");
      await flushPromises();
      return wrapper;
    }

    it("says how many still wait in the Workflow tab, and that the save was not of them", async () => {
      const wrapper = await saved({ still_waiting: 2, not_kept: null });
      expect(textOf(doneLine(wrapper))).toBe(`${RECEIPT} ${waiting("2 changes")}`);
      expect(lostLine(wrapper).exists()).toBe(false);
    });

    it("names what could not be kept, as lost, and says why", async () => {
      const wrapper = await saved({ still_waiting: 0, not_kept: NOT_KEPT });
      expect(lostLine(wrapper).text()).toBe(LOST);
      expect(textOf(doneLine(wrapper))).toBe(`${RECEIPT} ${LOST}`);
      // Said on the line, so not a second time on a card.
      expect(useNoticeStore().notices).toEqual([]);
    });

    it("says both in the line that takes the keyboard, what was lost first", async () => {
      const wrapper = await saved({ still_waiting: 1, not_kept: NOT_KEPT });
      const done = doneLine(wrapper);
      expect(textOf(done)).toBe(`${RECEIPT} ${LOST} ${waiting("1 change")}`);
      // Read where focus lands: inside the line, not beside it.
      expect(document.activeElement).toBe(done.element);
      expect(done.element.contains(lostLine(wrapper).element)).toBe(true);

      // The line goes as it always did, with all it said, and hands focus on.
      ranAndFinished(OTHER, "Night market");
      await flushPromises();
      expect(doneLine(wrapper).exists()).toBe(false);
      expect(textOf(wrapper)).not.toContain("Could not keep");
      expect(textOf(wrapper)).not.toContain("still has");
      expect(document.activeElement).toBe(button(wrapper, "Save as new…").element);
    });

    it.each([
      ["nothing waits and nothing was lost", { still_waiting: 0, not_kept: null }],
      ["the answer is an older server's", {}],
      ["what was not kept is an empty set", { not_kept: { ...NOT_KEPT, models: [], loras: [] } }],
    ])("leaves the receipt as it was when %s", async (_name, answer) => {
      const wrapper = await saved(answer);
      const done = doneLine(wrapper);
      expect(done.text()).toBe(RECEIPT);
      expect(done.element.children).toHaveLength(0);
      expect(document.activeElement).toBe(done.element);
    });

    it("says after Save as new that they wait on the workflow saved from, not the new one", async () => {
      saveWorkflowAsNew.mockResolvedValue({
        workflow_id: OTHER,
        name: "Portrait on Juggernaut",
        new_workflow: true,
        still_waiting: 2,
        not_kept: null,
      });
      ranAndFinished();
      const wrapper = await mountPanel();
      await button(wrapper, "Save as new…").trigger("click");
      await flushPromises();
      await offer(wrapper).find("input").setValue("Portrait on Juggernaut");
      await button(wrapper, "Save as new workflow").trigger("click");
      await flushPromises();
      const done = doneLine(wrapper);
      expect(textOf(done)).toBe(`Saved as Portrait on Juggernaut. ${waiting("2 changes")}`);
      expect(document.activeElement).toBe(done.element);
    });

    // The server says what it dropped once, in this answer. A tab closed
    // while the save was out has no line to say it on.
    it("says what was lost on a notice that stays when the tab closed before the save landed", async () => {
      let land;
      saveWorkflow.mockImplementation(() => new Promise((resolve) => (land = resolve)));
      ranAndFinished();
      const wrapper = await mountPanel();
      await button(wrapper, "Save").trigger("click");
      wrapper.unmount();
      land({ workflow_id: WF, version: 4, still_waiting: 1, not_kept: NOT_KEPT });
      await flushPromises();
      expect(useNoticeStore().notices).toMatchObject([
        { level: "warning", text: `${RECEIPT} ${LOST}`, timeout: 0 },
      ]);
    });

    it("raises no notice from a closed tab for a save that lost nothing", async () => {
      let land;
      saveWorkflow.mockImplementation(() => new Promise((resolve) => (land = resolve)));
      ranAndFinished();
      const wrapper = await mountPanel();
      await button(wrapper, "Save").trigger("click");
      wrapper.unmount();
      land({ workflow_id: WF, version: 4, still_waiting: 1, not_kept: null });
      await flushPromises();
      expect(useNoticeStore().notices).toEqual([]);
    });
  });

  it("takes the offer down when the workflow changes somewhere else", async () => {
    ranAndFinished();
    const workflows = useWorkflowsStore();
    const wrapper = await mountPanel();
    expect(offer(wrapper).exists()).toBe(true);
    // A save from another tab is announced, and the grid is read again.
    getWorkflowChanges.mockResolvedValue(state({ ran: null, ran_save: null }));
    workflows.cards = [{ id: WF, name: "Portrait, soft window light" }];
    await flushPromises();
    expect(offer(wrapper).exists()).toBe(false);
  });

  it("offers nothing, and asks nothing, in a read-only session", async () => {
    readOnly.ref.value = true;
    ranAndFinished();
    useWorkflowsStore().selectedKeys = [WF];
    const wrapper = await mountPanel();
    expect(getWorkflowChanges).not.toHaveBeenCalled();
    expect(offer(wrapper).exists()).toBe(false);
  });
});
