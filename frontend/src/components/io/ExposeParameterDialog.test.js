// Expose a parameter: a node, one of its settings, and its type where ComfyUI
// did not say; the pick is handed over as an address and the value it holds.

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vuetify/components", async () => {
  const { vuetifyComponentStubs } = await import("../../testing/vuetifyStubs");
  return vuetifyComponentStubs();
});

import ExposeParameterDialog from "./ExposeParameterDialog.vue";

const NODES = [
  {
    node_id: "8",
    title: "Final upscale",
    class_type: "ImageScaleBy",
    inputs: [
      { slot_label: "core:up", input_name: "scale_by", value: 1.5, kind: "number", options: null },
      {
        slot_label: "core:up",
        input_name: "upscale_method",
        value: "lanczos",
        kind: "choice",
        options: ["nearest-exact", "lanczos"],
      },
    ],
  },
  {
    node_id: "9",
    title: "Pack node",
    class_type: "SomePackNode",
    inputs: [
      { slot_label: "label-9", input_name: "count", value: "7", kind: null, options: null },
      { slot_label: "label-9", input_name: "mode", value: "fast", kind: null, options: null },
    ],
  },
];

function mountDialog(props = {}) {
  return mount(ExposeParameterDialog, {
    props: { open: true, nodes: NODES, ...props },
    global: { stubs: { teleport: true } },
  });
}

const select = (wrapper, id) => wrapper.find(`[data-testid="${id}"] select`);
const expose = (wrapper) => wrapper.find('[data-testid="xpd-expose"]');

describe("ExposeParameterDialog", () => {
  it("opens on the first node's first setting and hands that over", async () => {
    const wrapper = mountDialog();
    expect(select(wrapper, "xpd-node").findAll("option").map((o) => o.text())).toEqual([
      "Final upscale",
      "Pack node",
    ]);
    expect(wrapper.find('[data-testid="xpd-now"]').text()).toContain("1.5");
    // ComfyUI typed it, so nobody is asked what it is.
    expect(wrapper.find('[data-testid="xpd-kind"]').exists()).toBe(false);
    await expose(wrapper).trigger("click");
    expect(wrapper.emitted("expose")).toEqual([
      [{ slot_label: "core:up", input_name: "scale_by", value: 1.5, name: "scale_by" }],
    ]);
  });

  it("lists only the chosen node's settings", async () => {
    const wrapper = mountDialog();
    await select(wrapper, "xpd-node").setValue("9");
    expect(select(wrapper, "xpd-input").findAll("option").map((o) => o.text())).toEqual([
      "count",
      "mode",
    ]);
  });

  it("asks the type where ComfyUI did not say, and reads the value as it", async () => {
    const wrapper = mountDialog();
    await select(wrapper, "xpd-node").setValue("9");
    // Guessed from the graph's value, which is text here.
    expect(select(wrapper, "xpd-kind").element.value).toBe("text");
    await select(wrapper, "xpd-kind").setValue("number");
    await expose(wrapper).trigger("click");
    expect(wrapper.emitted("expose")).toEqual([
      [{ slot_label: "label-9", input_name: "count", value: 7, name: "count" }],
    ]);
  });

  it("refuses a value that is not of the type picked", async () => {
    const wrapper = mountDialog();
    await select(wrapper, "xpd-node").setValue("9");
    await select(wrapper, "xpd-input").setValue("mode");
    await select(wrapper, "xpd-kind").setValue("number");
    expect(wrapper.find('[role="alert"]').text()).toBe("fast is not a number.");
    await expose(wrapper).trigger("click");
    expect(wrapper.emitted("expose")).toBeUndefined();
  });

  it("says so when there is nothing left to expose, or no graph to read", () => {
    expect(mountDialog({ nodes: [] }).find('[data-testid="xpd-none"]').exists()).toBe(true);
    const failed = mountDialog({ nodes: [], failed: "No graph." });
    expect(failed.find('[data-testid="xpd-failed"]').text()).toBe("No graph.");
    expect(failed.find('[data-testid="xpd-none"]').exists()).toBe(false);
  });

  it("suggests the setting alone as its name, and hands over the one typed", async () => {
    const resize = {
      node_id: "5",
      title: "Resize Image/Mask",
      class_type: "ResizeImageMaskNode",
      inputs: [
        { slot_label: "core:rs", input_name: "resize_type", value: "scale by multiplier", kind: "choice", options: ["scale by multiplier"] },
        { slot_label: "core:rs", input_name: "resize_type.multiplier", value: 4, kind: "number", options: null },
      ],
    };
    const wrapper = mountDialog({ nodes: [resize] });
    const name = wrapper.find('[data-testid="xpd-name"] input');
    expect(name.element.value).toBe("resize_type");
    await select(wrapper, "xpd-input").setValue("resize_type.multiplier");
    expect(name.element.value).toBe("multiplier");
    await name.setValue("  Scale ");
    await expose(wrapper).trigger("click");
    expect(wrapper.emitted("expose")).toEqual([
      [{ slot_label: "core:rs", input_name: "resize_type.multiplier", value: 4, name: "Scale" }],
    ]);
  });

  it("falls back to the suggested name when the field is cleared", async () => {
    const wrapper = mountDialog();
    await wrapper.find('[data-testid="xpd-name"] input').setValue("   ");
    await expose(wrapper).trigger("click");
    expect(wrapper.emitted("expose")[0][0].name).toBe("scale_by");
  });

  it("tells two nodes of one name apart by their number", () => {
    const twins = [NODES[0], { ...NODES[0], node_id: "12" }];
    const wrapper = mountDialog({ nodes: twins });
    expect(select(wrapper, "xpd-node").findAll("option").map((o) => o.text())).toEqual([
      "Final upscale #8",
      "Final upscale #12",
    ]);
  });
});
