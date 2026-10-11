// "Move to library" in the two selection menus.
//
// `e2e/specs/menu-parity.spec.js` compares the menus as rendered, and the e2e
// backend has one library, so this entry renders in NEITHER there and two
// absences compare equal (the blind spot `menuRunEntryParity.test.js` names).
// Both menus are mounted here over the same registry instead.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";

vi.mock("../../utils/apiClient", async () => {
  const { ref } = await import("vue");
  return {
    API_BASE_URL: "/api/v1",
    apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
    isReadOnly: ref(false),
    onSessionReset: () => () => {},
    sessionContext: ref(null),
  };
});

vi.mock("../../api/snapshots", () => ({
  hashCompareSnapshot: vi.fn(),
}));

import { isReadOnly } from "../../utils/apiClient";
import { useLibrariesStore } from "../../stores/useLibrariesStore";
import SelectionMenu from "./SelectionMenu.vue";
import ImageGridContextMenu from "../widgets/ImageGridContextMenu.vue";

const ACTIVE = { uuid: "a", name: "Main", is_active: true, is_reachable: true };
const ARCHIVE = {
  uuid: "b",
  name: "Archive",
  is_active: false,
  is_reachable: true,
};
const UNPLUGGED = {
  uuid: "c",
  name: "Travel drive",
  is_active: false,
  is_reachable: false,
};

const stubs = {
  Tooltip: true,
  "v-icon": { template: "<i><slot /></i>" },
  teleport: true,
  AddToEntityControl: true,
};

// Each menu learns "read-only" and "this is the Scrapheap" its own way: the
// dropdown is told by its bar, the context menu works both out for itself.
const MENUS = [
  {
    name: "SelectionMenu.vue",
    scrapheap: { isScrapheapView: true },
    readOnly: { isReadOnly: true },
    mountMenu: (props = {}) =>
      mount(SelectionMenu, {
        props: {
          open: true,
          selectedCount: 3,
          selectedImageIds: ["10", "11", "12"],
          isReadOnly: false,
          isScrapheapView: false,
          ...props,
        },
        global: { stubs },
      }),
  },
  {
    name: "ImageGridContextMenu.vue",
    scrapheap: { selectedCharacter: "SCRAPHEAP" },
    readOnly: {},
    mountMenu: (props = {}) =>
      mount(ImageGridContextMenu, {
        props: {
          visible: true,
          selectedImageIds: ["10", "11", "12"],
          scrapheapPicturesId: "SCRAPHEAP",
          selectedCharacter: "ALL",
          backendUrl: "http://x",
          ...props,
        },
        global: { stubs },
      }),
  },
];

/** The submenu trigger, found by its label. */
function trigger(wrapper) {
  return wrapper
    .findAll(".ctx-submenu-wrap > button.ctx-item")
    .find((button) => button.text().includes("Move to library"));
}

beforeEach(() => {
  setActivePinia(createPinia());
  isReadOnly.value = false;
  useLibrariesStore().canManage = true;
});

describe.each(MENUS)("$name", ({ mountMenu, scrapheap, readOnly }) => {
  it("lists every other library that can be reached, and sends the one picked", async () => {
    useLibrariesStore().libraries = [ACTIVE, ARCHIVE, UNPLUGGED];
    const wrapper = mountMenu();

    expect(trigger(wrapper)).toBeDefined();
    // Looked up again after each step: opening the submenu re-renders the row.
    const wrap = () =>
      wrapper
        .findAll(".ctx-submenu-wrap")
        .find((candidate) => candidate.text().includes("Move to library"));
    await wrap().trigger("mouseenter");

    const rows = wrap().findAll(".ctx-submenu .ctx-item");
    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining("Archive"),
    ]);

    await rows[0].trigger("click");
    expect(wrapper.emitted("move-to-library")).toEqual([[ARCHIVE]]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("is absent when this is the only library", () => {
    useLibrariesStore().libraries = [ACTIVE];
    expect(trigger(mountMenu())).toBeUndefined();
  });

  it("opens and closes through button activation without hover", async () => {
    useLibrariesStore().libraries = [ACTIVE, ARCHIVE];
    const wrapper = mountMenu();
    expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
    // Native buttons dispatch click for Enter and Space as well as a pointer.
    await trigger(wrapper).trigger("click");
    expect(trigger(wrapper).attributes("aria-expanded")).toBe("true");
    expect(trigger(wrapper).element.parentElement.querySelector(".ctx-submenu")).not.toBeNull();
    await trigger(wrapper).trigger("click");
    expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
    expect(trigger(wrapper).element.parentElement.querySelector(".ctx-submenu")).toBeNull();
    wrapper.unmount();
  });

  it("is absent for an owner the library routes would refuse", () => {
    useLibrariesStore().libraries = [ACTIVE, ARCHIVE];
    useLibrariesStore().canManage = false;
    expect(trigger(mountMenu())).toBeUndefined();
  });

  it("is absent for a read-only session", () => {
    useLibrariesStore().libraries = [ACTIVE, ARCHIVE];
    isReadOnly.value = true;
    expect(trigger(mountMenu(readOnly))).toBeUndefined();
  });

  it("is absent in the Scrapheap, where nothing is left to move", () => {
    useLibrariesStore().libraries = [ACTIVE, ARCHIVE];
    expect(trigger(mountMenu(scrapheap))).toBeUndefined();
  });
});
