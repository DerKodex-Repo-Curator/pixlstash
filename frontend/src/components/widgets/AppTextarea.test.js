import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import AppTextarea from "./AppTextarea.vue";

describe("AppTextarea highlight", () => {
  it("marks the words the text names, on a hidden copy", () => {
    const wrapper = mount(AppTextarea, {
      props: { modelValue: "Mira on a beach", highlight: ["mira"] },
    });
    const mark = wrapper.find("mark");
    expect(mark.text()).toBe("Mira");
    expect(mark.element.parentElement.getAttribute("aria-hidden")).toBe("true");
    // The copy carries the whole text, so the mark sits where the word is.
    expect(mark.element.parentElement.textContent).toBe("Mira on a beach\n");
  });

  it("draws no copy when there are no words to look for", () => {
    const wrapper = mount(AppTextarea, {
      props: { modelValue: "mira", highlight: [] },
    });
    expect(wrapper.find("[aria-hidden]").exists()).toBe(false);
    expect(wrapper.find("mark").exists()).toBe(false);
  });

  it("keeps the copy level with a field that is already scrolled", async () => {
    const wrapper = mount(AppTextarea, {
      props: { modelValue: "on a beach", highlight: ["mira"] },
    });
    wrapper.find("textarea").element.scrollTop = 40;
    // No scroll event: the text changing is what has to carry it over.
    await wrapper.setProps({ modelValue: "on a beach, mira" });
    expect(wrapper.find("[aria-hidden]").element.scrollTop).toBe(40);
  });
});

describe("AppTextarea caret", () => {
  it("remembers where the caret was when focus left, for the text it was in", async () => {
    const wrapper = mount(AppTextarea, { props: { modelValue: "a portrait of on a beach" } });
    // Never placed: nothing to report.
    expect(wrapper.vm.selection()).toBeNull();
    const field = wrapper.find("textarea");
    field.element.setSelectionRange(11, 14);
    await field.trigger("blur");
    expect(wrapper.vm.selection()).toEqual({ start: 11, end: 14 });
    // The text moved on: the old caret no longer points anywhere meaningful.
    await wrapper.setProps({ modelValue: "on a beach" });
    expect(wrapper.vm.selection()).toBeNull();
  });

  it("reports the live caret while the field has focus", () => {
    const wrapper = mount(AppTextarea, {
      props: { modelValue: "a portrait of on a beach" },
      attachTo: document.body,
    });
    const field = wrapper.find("textarea").element;
    field.focus();
    field.setSelectionRange(14, 14);
    // No blur: a button that takes no focus on click (Safari) must still know.
    expect(wrapper.vm.selection()).toEqual({ start: 14, end: 14 });
    wrapper.unmount();
  });

  it("puts the caret where it is told on focus", () => {
    const wrapper = mount(AppTextarea, {
      props: { modelValue: "a portrait of Mira on a beach" },
      attachTo: document.body,
    });
    wrapper.vm.focus(18);
    const field = wrapper.find("textarea").element;
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([18, 18]);
    wrapper.unmount();
  });
});
