// Opening a workflow in the owner's ComfyUI: the Workflow tab's button and More
// menu, and the Workflows grid's verb menus, which are the same two verbs.
//
// ComfyUI takes no workflow from a URL, so the id rides along as
// `?pixlstash_workflow=` and the ComfyUI-PixlStash node fetches the graph
// (`GET /workflows/{id}/graph`) and loads it. The node asks for the graph with
// its own savers and Adapter Loader in place of the stock nodes, so a picture
// queued in ComfyUI comes back here; `pixlstash_original=1` tells it to ask
// for the workflow's own nodes instead.

import { computed, ref, watch } from "vue";

import { getPixlstashNode } from "../api/comfyui";
import { useFilterStore } from "../stores/useFilterStore";
import { useNoticeStore } from "../stores/useNoticeStore";
import { comfyuiLink } from "../utils/comfyuiLink";

/**
 * The desktop shell's bridge, when there is one. Its window opens only `https:`
 * outside the app and ComfyUI is plain `http:`, so on the desktop the link goes
 * through `desktop:openComfyui` instead of `window.open`.
 */
function desktopBridge() {
  return typeof window !== "undefined" ? window.pixlstashDesktop : null;
}

/**
 * Open workflow `id` in ComfyUI, in a new tab.
 *
 * Synchronous on purpose: a `window.open` after an await is what popup
 * blockers refuse. The caller gates it (`useComfyuiOpen`).
 *
 * @param {string} id
 * @param {boolean} [original] - the workflow's own nodes, not PixlStash's.
 */
export function openWorkflowInComfyui(id, original = false) {
  const filterStore = useFilterStore();
  const notices = useNoticeStore();
  if (!id || !filterStore.comfyuiUrl) return;
  const url = comfyuiLink(filterStore.comfyuiUrl, {
    pixlstash_workflow: id,
    ...(original ? { pixlstash_original: "1" } : {}),
  });
  if (!url) {
    notices.push({
      level: "error",
      text: "The ComfyUI address in Settings is not a web address.",
    });
    return;
  }
  const desktop = desktopBridge();
  if (desktop?.openComfyui) {
    desktop
      .openComfyui(url)
      .then((opened) => {
        if (!opened) throw new Error("the shell refused the link");
      })
      .catch((err) => {
        console.warn("[workflows] the desktop shell would not open ComfyUI", err);
        notices.push({ level: "error", text: "Could not open ComfyUI." });
      });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Whether a workflow can be opened in ComfyUI from here, and what opens.
 *
 * Asks ComfyUI for the PixlStash node once per mount and again when the
 * address in Settings changes.
 */
export function useComfyuiOpen() {
  const filterStore = useFilterStore();
  const desktop = desktopBridge();

  /** Whether there is a ComfyUI to open, and a way to open it from here. */
  const canOpenComfyui = computed(
    () => Boolean(filterStore.comfyuiUrl) && (!desktop || !!desktop.openComfyui),
  );

  /**
   * ComfyUI answered that it lacks the ComfyUI-PixlStash node's
   * `open_workflow.js`, so a link would open on whatever it had last. Only a
   * definite no refuses: an unreachable ComfyUI, or a failed ask, leaves the
   * verb to try.
   */
  const comfyuiLacksNode = ref(false);
  /**
   * The nodes ComfyUI has are from before a workflow opened there saved back
   * (#1852): what opens is a copy. Only a definite no.
   */
  const comfyuiOpensACopy = ref(false);
  let nodeCheck = 0;
  watch(
    () => canOpenComfyui.value && filterStore.comfyuiUrl,
    async (url) => {
      const check = ++nodeCheck;
      comfyuiLacksNode.value = false;
      comfyuiOpensACopy.value = false;
      if (!url) return;
      try {
        const { can_open_workflows: canOpen, saves_back: savesBack } =
          await getPixlstashNode();
        if (check !== nodeCheck) return;
        comfyuiLacksNode.value = canOpen === false;
        comfyuiOpensACopy.value = canOpen === true && savesBack === false;
      } catch (err) {
        console.warn("[workflows] could not ask ComfyUI for the PixlStash node", err);
      }
    },
    { immediate: true },
  );

  return { canOpenComfyui, comfyuiLacksNode, comfyuiOpensACopy };
}
