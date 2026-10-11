// ComfyuiLinkLibraries: the switch that sets whether the ComfyUI link's key
// works in one library or in every one (#1811).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive } from "vue";

const setTokenLibraries = vi.hoisted(() => vi.fn());
vi.mock("../../api/users", () => ({ setTokenLibraries }));

const store = reactive({ libraries: [], canManage: true });
vi.mock("../../stores/useLibrariesStore", () => ({
  useLibrariesStore: () => store,
}));

vi.mock("vuetify/components", () => ({
  VSwitch: {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template:
      '<button role="switch" :aria-checked="String(!!modelValue)" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
}));

import ComfyuiLinkLibraries from "./ComfyuiLinkLibraries.vue";

const LINK = { linked: true, token_id: 7, all_libraries: false };
const show = (link = LINK) => mount(ComfyuiLinkLibraries, { props: { link } });
const toggle = (wrapper) => wrapper.find('[role="switch"]');

beforeEach(() => {
  setTokenLibraries.mockReset();
  setTokenLibraries.mockResolvedValue({ all_libraries: true });
  store.libraries = [{ uuid: "a" }, { uuid: "b" }];
  store.canManage = true;
});

describe("ComfyuiLinkLibraries", () => {
  it("is not offered with one library, off the local network, or with no link", () => {
    store.libraries = [{ uuid: "a" }];
    expect(toggle(show()).exists()).toBe(false);

    store.libraries = [{ uuid: "a" }, { uuid: "b" }];
    store.canManage = false;
    expect(toggle(show()).exists()).toBe(false);

    store.canManage = true;
    expect(toggle(show({ linked: false })).exists()).toBe(false);
    expect(toggle(show({ linked: true, token_id: null })).exists()).toBe(false);
    expect(toggle(show(null)).exists()).toBe(false);
    expect(toggle(show()).exists()).toBe(true);
  });

  it("widens the link's key, says what that means and reports it", async () => {
    const wrapper = show();
    expect(toggle(wrapper).attributes("aria-checked")).toBe("false");
    expect(wrapper.text()).toContain("one library only");

    await toggle(wrapper).trigger("click");
    await flushPromises();

    expect(setTokenLibraries).toHaveBeenCalledWith(7, true);
    expect(toggle(wrapper).attributes("aria-checked")).toBe("true");
    expect(wrapper.text()).toContain("whichever library is open");
    expect(wrapper.emitted("changed")).toEqual([[true]]);
  });

  it("shows a key that already covers every library, and narrows it", async () => {
    setTokenLibraries.mockResolvedValue({ all_libraries: false });
    const wrapper = show({ ...LINK, all_libraries: true });
    expect(toggle(wrapper).attributes("aria-checked")).toBe("true");

    await toggle(wrapper).trigger("click");
    await flushPromises();

    expect(setTokenLibraries).toHaveBeenCalledWith(7, false);
    expect(toggle(wrapper).attributes("aria-checked")).toBe("false");
  });

  it("puts the switch back and says why when the change is refused", async () => {
    setTokenLibraries.mockRejectedValue({
      response: { data: { detail: "Only the owner's own session can." } },
    });
    const wrapper = show();

    await toggle(wrapper).trigger("click");
    await flushPromises();

    expect(toggle(wrapper).attributes("aria-checked")).toBe("false");
    expect(wrapper.find('[role="alert"]').text()).toContain("own session");
    expect(wrapper.emitted("changed")).toBeUndefined();
  });
});
