// One row of the Workflow tab's Parameters panel: what its name says.

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import WorkflowDefaultRow from "./WorkflowDefaultRow.vue";

const ROW = {
  label: "resize_type.multiplier",
  slot_label: "core:a",
  input_name: "resize_type.multiplier",
  value: 4,
  provenance: "edited",
  pinned: true,
  exposed: true,
};

function mountRow(props) {
  return mount(WorkflowDefaultRow, {
    props,
    global: { stubs: { Tooltip: true, "v-icon": true } },
  });
}

describe("a parameter row's name", () => {
  it("is the setting alone, with its node and whole name in the tip", () => {
    const wrapper = mountRow({ row: ROW, node: "Resize Image/Mask" });
    const name = wrapper.find(".wfdef-name");
    expect(name.text()).toBe("multiplier Yours");
    expect(name.findComponent({ name: "Tooltip" }).props("text")).toBe(
      "Resize Image/Mask · resize_type.multiplier",
    );
    // The field is named after the row and the tip, so the node is not
    // hover-only.
    expect(wrapper.find("[data-testid='wfdef-input']").attributes("aria-label")).toBe(
      "multiplier (Resize Image/Mask · resize_type.multiplier)",
    );
  });

  it("is the name the owner gave it, where they gave one", () => {
    const wrapper = mountRow({ row: { ...ROW, name: "Scale" }, node: "Resize Image/Mask" });
    const name = wrapper.find(".wfdef-name");
    expect(name.text()).toBe("Scale Yours");
    expect(name.findComponent({ name: "Tooltip" }).props("text")).toBe(
      "Resize Image/Mask · resize_type.multiplier",
    );
  });

  it("has no tip where the row already says all of it", () => {
    const wrapper = mountRow({ row: { ...ROW, label: "cfg", exposed: false } });
    expect(wrapper.find(".wfdef-name").findComponent({ name: "Tooltip" }).exists()).toBe(
      false,
    );
  });
});
