import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import KindMenu from "./KindMenu.vue";

// A menu that opens: the activator's click toggles `v-model`, and the content
// renders only while it is open, as Vuetify's does.
const VMenuStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: `<div>
    <slot name="activator" :props="{ onClick: () => $emit('update:modelValue', !modelValue) }" />
    <slot v-if="modelValue" />
  </div>`,
};

const stubs = { "v-menu": VMenuStub, "v-icon": true, Tooltip: true };

function mountMenu(props = {}) {
  return mount(KindMenu, {
    props: {
      fileKind: "unknown",
      kindText: "Unclassified",
      subject: "t5 xxl",
      suggestedKind: "text_encoder",
      suggestedBy: 3,
      suggestedFields: ["clip_name"],
      ...props,
    },
    global: { stubs },
  });
}

async function open(wrapper) {
  await wrapper.find("[data-testid='kind-menu']").trigger("click");
}

describe("KindMenu", () => {
  it("writes the suggestion out under the chip, and names it to a screen reader", () => {
    const wrapper = mountMenu();
    expect(wrapper.find("[data-testid='kind-suggestion']").text()).toBe(
      "Text encoder?",
    );
    expect(wrapper.find("[data-testid='kind-menu']").attributes("aria-label")).toBe(
      "Kind: Unclassified. Suggested: Text encoder.",
    );
  });

  it("pins the suggestion first, with its count, focused, and files it", async () => {
    const wrapper = mountMenu();
    await open(wrapper);
    const items = wrapper.findAll(".ctx-item");
    const pinned = wrapper.find("[data-testid='kind-menu-suggested']");
    expect(items[0].element).toBe(pinned.element);
    expect(pinned.text()).toContain("3 workflows");
    expect(pinned.attributes()).toHaveProperty("data-autofocus");
    expect(
      wrapper.find("[data-testid='kind-menu-unknown']").attributes("aria-checked"),
    ).toBe("true");

    await pinned.trigger("click");
    expect(wrapper.emitted("pick")).toEqual([["text_encoder"]]);
    expect(wrapper.find("[data-testid='kind-menu-suggested']").exists()).toBe(false);
  });

  it("names the evidence in a sentence that agrees with its count", async () => {
    const tip = async (props) => {
      const wrapper = mountMenu(props);
      await open(wrapper);
      return wrapper
        .find("[data-testid='kind-menu-suggested'] tooltip-stub")
        .attributes("text");
    };
    expect(await tip({ suggestedBy: 1 })).toBe(
      "1 workflow loads this as a text encoder, by clip_name.",
    );
    expect(await tip({})).toBe(
      "3 workflows load this as a text encoder, by clip_name.",
    );
  });

  it("files any other kind the same way, and hands Adapter… to the dialog", async () => {
    const wrapper = mountMenu();
    await open(wrapper);
    await wrapper.find("[data-testid='kind-menu-vae']").trigger("click");
    await open(wrapper);
    await wrapper.find("[data-testid='kind-menu-adapter']").trigger("click");
    expect(wrapper.emitted("pick")).toEqual([["vae"]]);
    expect(wrapper.emitted("adapter")).toHaveLength(1);
  });

  it("dismisses the offer, and after a dismissal offers it again", async () => {
    const offered = mountMenu();
    await open(offered);
    await offered.find("[data-testid='kind-menu-dismiss']").trigger("click");
    expect(offered.emitted("suggest")).toEqual([[false]]);

    const decided = mountMenu({ decided: true });
    expect(decided.find("[data-testid='kind-suggestion']").exists()).toBe(false);
    await open(decided);
    expect(decided.find("[data-testid='kind-menu-suggested']").exists()).toBe(false);
    expect(decided.find("[data-testid='kind-menu-dismiss']").exists()).toBe(false);
    await decided.find("[data-testid='kind-menu-suggest-again']").trigger("click");
    expect(decided.emitted("suggest")).toEqual([[true]]);
  });

  it("is a plain kind menu where no workflow suggests anything", async () => {
    const wrapper = mountMenu({ suggestedKind: "", suggestedBy: 0 });
    expect(wrapper.find("[data-testid='kind-suggestion']").exists()).toBe(false);
    await open(wrapper);
    expect(wrapper.find("[data-testid='kind-menu-suggest-again']").exists()).toBe(
      false,
    );
    expect(
      wrapper.find("[data-testid='kind-menu-unknown']").attributes(),
    ).toHaveProperty("data-autofocus");
  });

  it("leaves Adapter… out where nothing can ask for the algorithm", async () => {
    const wrapper = mountMenu({ adapter: false });
    await open(wrapper);
    expect(wrapper.find("[data-testid='kind-menu-adapter']").exists()).toBe(false);
  });
});
