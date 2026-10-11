// The ComfyUI runs in the tasks store (#1862): they are whatever the backend's
// poll last reported, so a run's row is there for a tab that did not start it
// and survives every view switch, and its abort asks the backend.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";

import { useTasksStore } from "./useTasksStore";
import { getWorkerProgress } from "../api/workers";
import { abortRun } from "../api/comfyui";
import { useNoticeStore } from "./useNoticeStore";

vi.mock("../api/workers", () => ({ getWorkerProgress: vi.fn() }));
vi.mock("../api/comfyui", () => ({ abortRun: vi.fn(async () => ({})) }));

const RUN = {
  prompt_id: "p-1",
  label: "Night market",
  workflow_id: "auto:a",
  status: "running",
  percent: 25,
};

function answer(runs) {
  return { status: "success", workers: {}, process: {}, ...(runs ? { runs } : {}) };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("the runs in flight", () => {
  it("are read from the poll, and gone when the poll stops listing them", async () => {
    const store = useTasksStore();
    getWorkerProgress.mockResolvedValue(answer([RUN]));
    store.startPolling();
    await flushPromises();
    try {
      expect(store.comfyuiRuns).toEqual([RUN]);
      expect(store.activeEntries).toEqual([
        {
          kind: "comfyui",
          key: "comfyui",
          run: {
            status: "running",
            percent: 25,
            label: "Night market",
            message: "ComfyUI running…",
          },
        },
      ]);
      expect(store.hasActiveTasks).toBe(true);

      // The run ended: the backend no longer lists it.
      getWorkerProgress.mockResolvedValue(answer([]));
      store.nudge();
      await vi.waitFor(() => expect(store.comfyuiRuns).toEqual([]));
      expect(store.activeEntries).toEqual([]);

      // A backend that says nothing of runs (an older one) lists none.
      getWorkerProgress.mockResolvedValue(answer([RUN]));
      store.nudge();
      await vi.waitFor(() => expect(store.comfyuiRuns).toEqual([RUN]));
      getWorkerProgress.mockResolvedValue(answer(null));
      store.nudge();
      await vi.waitFor(() => expect(store.comfyuiRuns).toEqual([]));
    } finally {
      store.stopPolling();
    }
  });

  it("are stopped by the backend, and read again at once", async () => {
    const store = useTasksStore();
    getWorkerProgress.mockResolvedValue(answer([RUN]));
    store.startPolling();
    await flushPromises();
    try {
      const polls = getWorkerProgress.mock.calls.length;
      getWorkerProgress.mockResolvedValue(answer([]));
      await store.abortComfyuiRuns();
      expect(abortRun).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(getWorkerProgress.mock.calls.length).toBeGreaterThan(polls),
      );
      await vi.waitFor(() => expect(store.comfyuiRuns).toEqual([]));
      expect(useNoticeStore().notices).toEqual([]);
    } finally {
      store.stopPolling();
    }
  });

  it("say so when the backend could not stop them", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    abortRun.mockRejectedValueOnce(new Error("ComfyUI unreachable"));
    await useTasksStore().abortComfyuiRuns();
    expect(useNoticeStore().notices.map((notice) => notice.text)).toEqual([
      "ComfyUI could not be told to stop.",
    ]);
    warned.mockRestore();
  });
});
