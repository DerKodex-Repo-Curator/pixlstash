// The order a stack offers to Make cover / Move earlier / Move later. The order
// route refuses a list that misses any member, so a stack whose members are not
// all known to be on screen must offer no order at all.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("../api/stacks", () => ({
  getStack: vi.fn(),
  listStackPictures: vi.fn(),
  createStack: vi.fn(),
  setStackOrder: vi.fn(() => Promise.resolve({})),
  removeStackMembers: vi.fn(),
}));

import { useStackOrdering } from "./useStackOrdering.js";

function makeStack(images) {
  const deps = {
    allGridImages: ref(images),
    lastFetchedGridImages: ref(images),
    loadedRanges: ref([]),
    visibleStart: ref(0),
    visibleEnd: ref(images.length),
    renderBuffer: ref(0),
    divisibleViewWindow: ref(4),
    stackReorderDrag: ref(null),
    stackReorderHoverId: ref(null),
    stackReorderHoverSide: ref(null),
    setStackReorderHoverId: vi.fn(),
    setStackReorderHoverSide: vi.fn(),
    selectedImageIds: ref([]),
    preserveScrollOnNextFetch: ref(false),
  };
  const callbacks = new Proxy({}, { get: () => vi.fn(() => []) });
  const stack = useStackOrdering(deps, {}, vi.fn(), callbacks);
  stack.expandedStackIds.value = new Set(["7"]);
  return stack;
}

const member = (id, position, extra = {}) => ({
  id,
  stack_id: 7,
  stack_position: position,
  ...extra,
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("useStackOrdering: the order an open stack offers", () => {
  it("offers the order when every member is on screen", () => {
    const stack = makeStack([
      member(1, 0, { stackCount: 3 }),
      member(2, 1),
      member(3, 2),
    ]);
    expect(stack.getOpenStackPlace({ id: 2, stack_id: 7 })).toEqual({
      stackId: "7",
      position: 1,
      count: 3,
    });
  });

  it("offers none when the badge says more members exist", () => {
    const stack = makeStack([member(1, 0, { stackCount: 4 }), member(2, 1)]);
    expect(stack.getOpenStackPlace({ id: 2, stack_id: 7 })).toBeNull();
    expect(stack.moveStackMember(2, "cover")).toBe(false);
  });

  it("offers none when no row says how big the stack is", () => {
    const stack = makeStack([member(1, 0), member(2, 1)]);
    expect(stack.getOpenStackPlace({ id: 2, stack_id: 7 })).toBeNull();
  });

  it("trusts the members list fetched on expand over a stale badge", () => {
    const stack = makeStack([member(1, 0, { stackCount: 2 }), member(2, 1)]);
    stack.expandedStackMembers.value = new Map([
      ["7", { ids: ["1", "2", "3"], images: [] }],
    ]);
    expect(stack.getOpenStackPlace({ id: 2, stack_id: 7 })).toBeNull();
  });
});
