import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useSortStore } from "../../stores/useSortStore";
import { useOperationStore } from "../../stores/useOperationStore";

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("../../utils/apiClient", async () => {
  const { ref, computed } = await import("vue");
  return {
    apiClient: {
      get: (...args) => apiGet(...args),
      post: (...args) => apiPost(...args),
      patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    },
    onSessionReset: () => () => {},
    activateShareToken: vi.fn(),
    appendShareToken: (url) => url,
    checkLoginStatus: vi.fn(), checkSession: vi.fn(),
    isAuthenticated: ref(true), isReadOnly: computed(() => false),
    login: vi.fn(), logout: vi.fn(),
    sessionContext: ref({ scope: "ALL" }),
    setRequestClientId: vi.fn(),
    newOperationBatchId: vi.fn(() => `cli-${crypto.randomUUID()}`),
    operationBatchHeaders: (batchId) => ({ headers: { "X-Operation-Batch-Id": batchId } }),
    API_BASE_URL: "/api/v1",
  };
});
vi.mock("vuetify/components", async () => {
  const { vuetifyComponentStubs } = await import("../../testing/vuetifyStubs");
  return vuetifyComponentStubs();
});
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, params: {}, path: "/", name: "grid" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: ref({ query: {} }) }),
}));

import ImageGrid from "./ImageGrid.vue";

const library = { uuid: "archive", name: "Archive" };
const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
let wrapper;

beforeEach(() => {
  setActivePinia(createPinia());
  useSelectionStore().selectedCharacter = "ALL";
  useSortStore().selectedSort = "DATE";
  apiGet.mockReset().mockImplementation((url) => Promise.resolve({
    data: String(url).includes("/count") ? { count: 0 } : [],
  }));
  apiPost.mockReset().mockImplementation((url, body) => Promise.resolve({
    data: url === "/pictures/move-to-library"
      ? { moved: body.picture_ids, moved_count: body.picture_ids.length }
      : {},
  }));
});

afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});

async function prepareGrid() {
  wrapper = mount(ImageGrid, {
    shallow: true,
    props: { backendUrl: "/api/v1" },
    global: {
      stubs: { "v-icon": true, "v-snackbar": true },
      config: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("v-") } },
    },
  });
  await flushPromises();
  const pictures = ids.map((id) => ({ id, stack_id: null, tags: [] }));
  wrapper.vm.allGridImages = pictures;
  wrapper.vm.$.setupState.lastFetchedGridImages = pictures;
  wrapper.vm.selectedImageIds = [...ids];
  apiGet.mockClear();
}

describe("a move spanning multiple requests", () => {
  it("retains tiles and selection for copies whose sources stayed live", async () => {
    await prepareGrid();
    wrapper.vm.selectedImageIds = [1, 2, 3];
    apiPost.mockResolvedValue({ data: {
      moved: [1], moved_count: 1,
      copied_but_locked: [2], copied_but_not_moved: [3],
    } });

    await wrapper.vm.$.setupState.moveSelectedToLibrary(library);

    expect(wrapper.vm.selectedImageIds).toEqual([2, 3]);
    // The moved tile is held as an undo ghost; the retained copies stay live.
    const ghosts = useOperationStore().ghostPictureIds;
    expect(ghosts).toEqual([1]);
    expect(wrapper.vm.allGridImages.filter((picture) => !ghosts.includes(picture.id))
      .map((picture) => picture.id)).toEqual(ids.slice(1));
  });

  it("uses one gesture id for every chunk, and a new id for the next gesture", async () => {
    await prepareGrid();
    await wrapper.vm.$.setupState.moveSelectedToLibrary(library);
    const requests = apiPost.mock.calls.filter(([url]) => url === "/pictures/move-to-library");
    expect(requests.map(([, body]) => body.picture_ids.length)).toEqual([1000, 1]);
    const batchIds = requests.map(([, , config]) => config.headers["X-Operation-Batch-Id"]);
    expect(batchIds[0]).toMatch(/^cli-/);
    expect(batchIds[1]).toBe(batchIds[0]);

    wrapper.vm.selectedImageIds = [1002];
    await wrapper.vm.$.setupState.moveSelectedToLibrary(library);
    expect(apiPost.mock.calls.at(-1)[2].headers["X-Operation-Batch-Id"]).not.toBe(batchIds[0]);
  });

  it("removes confirmed successes and refreshes after a later chunk fails", async () => {
    await prepareGrid();
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiPost.mockReset()
      .mockResolvedValueOnce({ data: { moved: ids.slice(0, 1000), moved_count: 1000 } })
      .mockRejectedValueOnce(new Error("Library is busy"));
    await wrapper.vm.$.setupState.moveSelectedToLibrary(library);

    expect(wrapper.vm.selectedImageIds).toEqual([1001]);
    expect(wrapper.vm.allGridImages.map((picture) => picture.id)).toEqual([1001]);
    expect(wrapper.emitted("refresh-sidebar")).toBeTruthy();
    // Let the debounced grid reload run and confirm that it reads server state.
    await vi.waitFor(() => expect(
      apiGet.mock.calls.some(([url]) => String(url).includes("/pictures/count")),
      JSON.stringify(apiGet.mock.calls.map(([url]) => url)),
    ).toBe(true), { timeout: 2500 });
  });
});
