// Clone onto a set: which sets the dialog offers.
//
// A set hidden in this library (#1869) is not offered here, hand-made or from
// pictures: the dialog has no "Show them", so the payload's own list decides.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const fetchWorkflowSets = vi.fn();
const planSetClones = vi.fn();
vi.mock("../../api/modelShelf", () => ({
  fetchWorkflowSets: (...args) => fetchWorkflowSets(...args),
}));
vi.mock("../../api/workflows", () => ({
  getLoraChain: vi.fn(async () => null),
  planSetClones: (...args) => planSetClones(...args),
  listWorkflowCards: vi.fn(async () => ({ cards: [], one_offs: 0, hidden: 0 })),
}));
vi.mock("vuetify/components", async () => {
  const { vuetifyComponentStubs } = await import("../../testing/vuetifyStubs");
  return vuetifyComponentStubs();
});

import CloneOntoSetDialog from "./CloneOntoSetDialog.vue";

function handSet(id, checkpointId) {
  return {
    id,
    name: `set ${id}`,
    members: [
      {
        id: checkpointId,
        sha256: String(checkpointId).repeat(64),
        slot: "checkpoint",
        kind: "checkpoint",
        name: `ckpt-${checkpointId}`,
        filename: `ckpt-${checkpointId}.safetensors`,
        on_shelf: true,
      },
    ],
  };
}

function combination(checkpointId) {
  return {
    key: String(checkpointId),
    models: [
      {
        id: checkpointId,
        kind: "checkpoint",
        name: `ckpt-${checkpointId}`,
        filename: `ckpt-${checkpointId}.safetensors`,
      },
    ],
    recipes: 1,
    picture_count: 1,
    covers: [],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  fetchWorkflowSets.mockReset();
  planSetClones.mockReset().mockResolvedValue({ plans: [] });
});

describe("CloneOntoSetDialog", () => {
  it("plans a clone onto no set hidden in this library, of either kind", async () => {
    fetchWorkflowSets.mockResolvedValue({
      combinations: [combination(1), combination(2)],
      hand_made: [handSet(7, 3), handSet(8, 4)],
      hidden_sets: ["hand:7", "model:1"],
    });
    mount(CloneOntoSetDialog, {
      props: { open: true, workflowId: `auto:${"a".repeat(64)}` },
    });
    await flushPromises();

    expect(planSetClones).toHaveBeenCalledTimes(1);
    const keys = planSetClones.mock.calls[0][1].map((set) => set.key);
    // The shown one of each kind stays: the hide took exactly its own two.
    expect(keys.sort()).toEqual(["hand:8", "model:2"]);
  });
});
