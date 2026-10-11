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
import { useRunDialogStore } from "../../stores/useRunDialogStore";
import { useTasksStore } from "../../stores/useTasksStore";
import { useWorkflowsStore } from "../../stores/useWorkflowsStore";

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

    tasksStore.setComfyuiRun("run-1", { label: "One" });
    expect(tasksTabFor(tasksStore)).toMatchObject({
      busy: true,
      busyTooltip: "1 active task",
    });

    tasksStore.setComfyuiRun("run-2", { label: "Two" });
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

  it("draws a ComfyUI run with its own progress and an abort", async () => {
    const tasksStore = useTasksStore();
    tasksStore.setComfyuiRun("run-1", {
      status: "running",
      percent: 40,
      message: "sampling step 4",
      label: "Cinematic portrait",
    });
    const wrapper = mount(TasksPanel, globalOpts);
    const text = textOf(wrapper);
    expect(text).not.toContain("No active tasks");
    expect(text).toContain("Cinematic portrait");
    expect(text).toContain("sampling step 4");
    expect(wrapper.find(".tm-comfy-fill").attributes("style")).toContain(
      "width: 40%",
    );

    const abort = wrapper.find('button[aria-label="Abort ComfyUI run"]');
    expect(abort.exists()).toBe(true);
    const aborted = vi.spyOn(tasksStore, "abortComfyuiRun");
    await abort.trigger("click");
    expect(aborted).toHaveBeenCalledWith("run-1");
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

  /** A changed run of WF, queued from the popup and finished. */
  function ranAndFinished() {
    const runDialog = useRunDialogStore();
    runDialog.ranWith(WF, record);
    runDialog.runEvent(completed);
    return runDialog;
  }

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
    // Not an active task, and the panel is not empty either.
    expect(textOf(wrapper)).not.toContain("No active tasks");
    expect(tasksTabFor(useTasksStore()).busy).toBeUndefined();
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
    const done = wrapper.find('[data-testid="tm-offer-done"]');
    expect(done.text()).toBe("Saved to Portrait, soft window light.");
    expect(document.activeElement).toBe(done.element);
    expect(runDialog.ranChanges[WF]).toBeUndefined();
    expect(runDialog.saved).toMatchObject({ workflowId: WF, savedAs: "" });
    expect(reread).toHaveBeenCalled();
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
    expect(wrapper.find('[data-testid="tm-offer-done"]').text()).toBe(
      "Saved as Portrait on Juggernaut.",
    );
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
