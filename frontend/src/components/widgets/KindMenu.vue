<template>
  <v-menu
    v-model="open"
    location="bottom start"
    origin="top start"
    :offset="4"
    :disabled="disabled"
  >
    <template #activator="{ props: menuProps }">
      <!-- The kind as it is read, and the menu that sets it. Two lines while
           an offer stands: the chip, then the kind the workflows agree on,
           written out with its dot so it never rests on colour alone. -->
      <button
        v-bind="menuProps"
        type="button"
        class="kmenu-btn"
        :class="{ 'kmenu-btn--open': open }"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        :disabled="disabled"
        :tabindex="tabindex"
        data-testid="kind-menu"
        @click.stop
        @dblclick.stop
        @keydown.stop
      >
        <span class="kmenu-chip"
          >{{ kindText }}<v-icon class="kmenu-caret">mdi-menu-down</v-icon></span
        >
        <span v-if="offered" class="kmenu-sug" data-testid="kind-suggestion"
          ><span class="kmenu-dot" aria-hidden="true"></span
          >{{ suggestedLabel }}?</span
        >
      </button>
    </template>
    <div
      v-if="open"
      ref="menuEl"
      class="ctx-menu kmenu"
      role="menu"
      tabindex="-1"
      :aria-label="`Kind of ${subject}`"
      @keydown="onMenuKeydown"
    >
      <template v-if="offered">
        <div class="ctx-label section-label">{{ evidenceHeading }}</div>
        <button
          class="ctx-item kmenu-pinned"
          type="button"
          role="menuitem"
          data-testid="kind-menu-suggested"
          data-autofocus
          @click="choose(suggestedKind)"
        >
          <Tooltip :text="evidenceNote || evidence" activator="parent" />
          <v-icon class="ctx-icon">mdi-sitemap-outline</v-icon>
          <span class="ctx-label-text">{{ suggestedLabel }}</span>
          <span v-if="!evidenceNote" class="ctx-meta">{{ workflowsText }}</span>
        </button>
        <div class="ctx-sep"></div>
      </template>
      <div class="ctx-label section-label">Set kind</div>
      <button
        v-for="option in options"
        :key="option.value"
        class="ctx-item"
        type="button"
        role="menuitemradio"
        :aria-checked="option.value === fileKind"
        :data-autofocus="!offered && option.value === fileKind ? '' : undefined"
        :data-testid="`kind-menu-${option.value}`"
        @click="choose(option.value)"
      >
        <v-icon v-if="option.value === fileKind" class="ctx-icon"
          >mdi-check</v-icon
        >
        <span v-else class="ctx-icon" aria-hidden="true"></span>
        <span class="ctx-label-text">{{ option.label }}</span>
      </button>
      <template v-if="suggestedKind">
        <div class="ctx-sep"></div>
        <button
          v-if="offered"
          class="ctx-item"
          type="button"
          role="menuitem"
          data-testid="kind-menu-dismiss"
          @click="suggest(false)"
        >
          <v-icon class="ctx-icon">mdi-close</v-icon>
          <span class="ctx-label-text">Don't suggest a kind</span>
        </button>
        <button
          v-else
          class="ctx-item"
          type="button"
          role="menuitem"
          data-testid="kind-menu-suggest-again"
          @click="suggest(true)"
        >
          <v-icon class="ctx-icon">mdi-sitemap-outline</v-icon>
          <span class="ctx-label-text">Suggest a kind again</span>
        </button>
      </template>
    </div>
  </v-menu>
</template>

<script setup>
// The Kind chip as a menu that sets the kind in place (#1962), on the shelf's
// Kind column and under a Workflow-tab loader.
//
// The kind every workflow that loads the model agrees on is a suggestion, not
// a write: it sits under the chip and pinned, focused, at the top of the menu,
// so Enter files it. Choosing ANY kind, the one already set included, is a
// person deciding what the file is, and the offer stops; the server records
// that on the `file_kind` write. "Don't suggest" records it without a kind,
// and "Suggest a kind again" takes it back.

import { computed, nextTick, ref, watch } from "vue";

import Tooltip from "./Tooltip.vue";
import { fileKindLabel } from "../../utils/modelShelf.js";
import { onMenuKeydown } from "../../utils/menuKeyboard.js";

const props = defineProps({
  /** The stored `model.file_kind`. */
  fileKind: { type: String, default: "" },
  /** What the chip reads: the shelf's kind cell, or "Unclassified on shelf". */
  kindText: { type: String, required: true },
  /** The model, for the accessible names: its name or file. */
  subject: { type: String, default: "this model" },
  /** `suggested_kind` off the shelf row, or "". */
  suggestedKind: { type: String, default: "" },
  /** How many workflows load it as that. */
  suggestedBy: { type: Number, default: 0 },
  /** The loader fields that name it. */
  suggestedFields: { type: Array, default: () => [] },
  /**
   * Where the suggestion comes from, when it is not the workflows that load
   * the model: the pinned section's heading, and what its tooltip says in
   * place of the workflow count.
   */
  evidenceHeading: { type: String, default: "Workflows load it as" },
  evidenceNote: { type: String, default: "" },
  /** A person has decided the kind: the suggestion is not offered. */
  decided: { type: Boolean, default: false },
  /** Offer "Adapter…", which needs the algorithm dialog the shelf owns. */
  adapter: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  /** The button's tab stop: a shelf row hands it the row's roving one. */
  tabindex: { type: Number, default: 0 },
});

const emit = defineEmits(["pick", "adapter", "suggest"]);

const open = ref(false);
const menuEl = ref(null);

// The dialog's order, in the shelf's own words. `adapter` asks for its
// algorithm, so it is an ellipsis verb that hands over to that dialog.
const KINDS = [
  "checkpoint",
  "vae",
  "text_encoder",
  "controlnet",
  "upscaler",
  "adapter",
  "unknown",
];
const options = computed(() =>
  KINDS.filter((kind) => props.adapter || kind !== "adapter").map((kind) => ({
    value: kind,
    label: kind === "adapter" ? "Adapter…" : fileKindLabel(kind),
  })),
);

const offered = computed(() => Boolean(props.suggestedKind) && !props.decided);
const suggestedLabel = computed(() => fileKindLabel(props.suggestedKind));
const workflowsText = computed(
  () => `${props.suggestedBy} ${props.suggestedBy === 1 ? "workflow" : "workflows"}`,
);
const evidence = computed(
  () =>
    `${workflowsText.value} ${props.suggestedBy === 1 ? "loads" : "load"} ` +
    `this as a ${suggestedLabel.value.toLowerCase()}` +
    (props.suggestedFields.length
      ? `, by ${props.suggestedFields.join(", ")}.`
      : "."),
);
const ariaLabel = computed(
  () =>
    `Kind: ${props.kindText}.` +
    (offered.value ? ` Suggested: ${suggestedLabel.value}.` : ""),
);

// The suggestion is focused as the menu opens, so Enter files it; without one,
// the current kind. `v-menu` mounts its content on open, hence the wait.
watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  requestAnimationFrame(() =>
    menuEl.value?.querySelector("[data-autofocus]")?.focus(),
  );
});

function choose(kind) {
  open.value = false;
  if (kind === "adapter") emit("adapter");
  else emit("pick", kind);
}

function suggest(on) {
  open.value = false;
  emit("suggest", on);
}
</script>

<style scoped>
.kmenu-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  max-width: 100%;
  padding: var(--space-1) var(--space-2);
  margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.kmenu-btn:hover:not(:disabled),
.kmenu-btn--open {
  background: var(--hover-wash);
}

.kmenu-btn:disabled {
  cursor: default;
}

/* The shelf's `.shelf-chip`, with the caret that says it opens. */
.kmenu-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  padding: 0 var(--space-2);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--radius-sm);
  font-size: var(--text-2xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(var(--v-theme-on-background), 0.7);
}

.kmenu-caret {
  flex: none;
  font-size: var(--text-xs);
}

/* Amber: attention, never olive (selected) or teal (unsaved). */
.kmenu-sug {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  font-size: var(--text-2xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgb(var(--v-theme-accent));
}

.kmenu-dot {
  flex: none;
  width: var(--badge-size-dot);
  height: var(--badge-size-dot);
  border-radius: var(--radius-pill);
  background: rgb(var(--v-theme-accent));
}

.kmenu {
  min-width: 240px;
}

.kmenu-pinned {
  font-weight: var(--weight-semibold);
}

.kmenu-pinned .ctx-icon {
  opacity: 1;
  color: rgb(var(--v-theme-accent));
}
</style>
