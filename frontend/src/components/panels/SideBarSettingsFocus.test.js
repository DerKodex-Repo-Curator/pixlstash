// Settings opens from a prop, so Vuetify has no activator to give focus back
// to when it closes. The shelf's folder button is the door this matters for:
// it used to open a dialog of its own that put focus back on it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";

const apiGet = vi.fn();

vi.mock("../../utils/apiClient", async () => {
  const { ref: makeRef } = await import("vue");
  return {
    apiClient: {
      get: (...args) => apiGet(...args),
      post: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    onSessionReset: () => () => {},
    activateShareToken: vi.fn(),
    appendShareToken: (url) => url,
    checkLoginStatus: vi.fn(),
    checkSession: vi.fn(),
    isAuthenticated: makeRef(true),
    isReadOnly: makeRef(false),
    sessionContext: makeRef(null),
    login: vi.fn(),
    logout: vi.fn(),
    newOperationBatchId: () => "cli-test",
    operationBatchHeaders: () => undefined,
    setRequestClientId: vi.fn(),
    notifySessionReset: vi.fn(),
    toBackendWebSocketUrl: () => "",
    API_BASE_URL: "/api/v1",
  };
});

vi.mock("vuetify/components", async () => {
  const { vuetifyComponentStubs } = await import("../../testing/vuetifyStubs");
  return vuetifyComponentStubs();
});

vi.mock("vue-router", async () => {
  const { reactive } = await vi.importActual("vue");
  const route = reactive({
    query: {},
    params: {},
    path: "/",
    name: "all-pictures",
  });
  const { vi: vitest } = await import("vitest");
  return {
    useRoute: () => route,
    useRouter: () => ({
      push: vitest.fn(),
      replace: vitest.fn(),
      currentRoute: { value: { query: {} } },
    }),
  };
});

import SideBar from "./SideBar.vue";

function respond(url) {
  const u = String(url ?? "");
  if (u.includes("/characters")) return { data: [] };
  if (u.includes("/projects")) return { data: [] };
  if (u.includes("/picture_sets")) return { data: [] };
  if (u.includes("/summary")) return { data: { image_count: 0 } };
  return { data: [] };
}

async function mountSidebar() {
  const wrapper = mount(SideBar, {
    shallow: true,
    props: { backendUrl: "/api/v1" },
    global: {
      config: {
        compilerOptions: { isCustomElement: (tag) => tag.startsWith("v-") },
      },
    },
  });
  wrapper.vm.refreshSidebar();
  for (let i = 0; i < 5; i += 1) await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  apiGet.mockReset().mockImplementation((url) => Promise.resolve(respond(url)));
});

describe("closing Settings", () => {
  it("gives focus back to the control that opened it", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const wrapper = await mountSidebar();

    wrapper.vm.openSettingsDialog("models");
    await wrapper.vm.$nextTick();
    // The dialog takes focus while it is open.
    opener.blur();
    wrapper
      .findComponent({ name: "UserSettingsDialog" })
      .vm.$emit("update:open", false);
    await flushPromises();

    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
    opener.remove();
  });
});
