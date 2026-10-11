<template>
  <!-- The version the workflow is on, and the way back to an earlier one
       (#1850, rule 3 of #1846). A quiet chip on its own line under the picture
       count: the count shares its line with the star chart, and the three do
       not fit the 288px rail together. -->
  <span ref="root" class="wfver">
    <v-menu v-model="open" location="bottom start" :offset="4">
      <template #activator="{ props: menuProps }">
        <button
          v-bind="menuProps"
          class="wfver-btn"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="open ? 'true' : 'false'"
          data-testid="wftab-version"
        >
          <!-- A row acts at once, so what the menu is for is said before it
               is opened. -->
          <Tooltip text="Go back to an earlier version" activator="parent" />
          <v-icon size="16" aria-hidden="true">mdi-history</v-icon>
          <span>{{ label }}</span>
          <v-icon size="16" aria-hidden="true">mdi-chevron-down</v-icon>
        </button>
      </template>
      <div
        class="ctx-menu wfver-menu"
        role="menu"
        aria-label="Versions"
        tabindex="-1"
        data-testid="wftab-version-menu"
        @keydown="onMenuKeydown"
      >
        <div class="section-label ctx-label" aria-hidden="true">Versions</div>
        <!-- Newest first, as the server sends them. The current one is a
             checked radio row, so it is said and not only drawn; choosing it
             just closes the menu. The leading slot is kept on every row so
             the numbers share a left edge. Named outright: the two spans
             would otherwise be read run together, "Version 32 Oct". -->
        <button
          v-for="row in versions ?? []"
          :key="row.version"
          class="ctx-item"
          type="button"
          role="menuitemradio"
          :aria-checked="row.current ? 'true' : 'false'"
          :aria-label="partsOf(row).join(', ')"
          :data-version="row.version"
          @click="choose(row)"
        >
          <v-icon v-if="row.current" class="ctx-icon" aria-hidden="true"
            >mdi-check</v-icon
          >
          <span v-else class="ctx-icon" aria-hidden="true"></span>
          <span class="ctx-label-text">Version {{ row.version }}</span>
          <span class="ctx-meta">{{ partsOf(row).slice(1).join(" · ") }}</span>
        </button>
        <!-- The read is out, or failed: a row that says so, never an empty
             surface. Opening the menu again asks again. -->
        <button
          v-if="!versions"
          class="ctx-item ctx-item--disabled"
          type="button"
          role="menuitem"
          aria-disabled="true"
          data-testid="wftab-version-unread"
        >
          <span class="ctx-label-text">{{
            failed
              ? "Could not read the versions just now."
              : "Reading the versions…"
          }}</span>
        </button>
      </div>
    </v-menu>
  </span>
</template>

<script>
/**
 * A version's day as the head and the menu say it: `today`, `2 Oct`, and the
 * year too once it is not this one. "" for a stamp that is missing or will not
 * parse.
 *
 * @param {string|null} iso - when the version was stored. A stamp with no zone
 *   is UTC, as the backend's naive stamps are everywhere else in the app.
 * @param {Date} [now]
 * @returns {string}
 */
export function versionDay(iso, now = new Date()) {
  if (!iso) return "";
  const text = String(iso);
  const naive = text.includes("T") && !/(Z|[+-]\d{2}:\d{2})$/.test(text);
  const at = new Date(naive ? `${text}Z` : text);
  if (Number.isNaN(at.getTime())) return "";
  if (at.toDateString() === now.toDateString()) return "today";
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
</script>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { VIcon, VMenu } from "vuetify/components";

import { onMenuKeydown } from "../../utils/menuKeyboard";
import Tooltip from "../widgets/Tooltip.vue";

const props = defineProps({
  /** The current version's number. */
  number: { type: Number, required: true },
  /** When the current version was stored (ISO 8601), or null. */
  at: { type: String, default: null },
  /**
   * `GET /workflows/{id}/versions`'s rows, newest first:
   * `{version, created_at, reason, current}`. Null while they are unread.
   */
  versions: { type: Array, default: null },
  /** The read of `versions` failed. */
  failed: { type: Boolean, default: false },
});

const emit = defineEmits(["open", "go-back"]);

const open = ref(false);
const root = ref(null);

const label = computed(() =>
  [`Version ${props.number}`, versionDay(props.at)].filter(Boolean).join(" · "),
);

/**
 * A row's number, its day and the reason the save stored. The reason is the
 * server's own words, printed as sent: null (the version a workflow arrived
 * as) leaves the number and the day.
 */
function partsOf(row) {
  return [
    `Version ${row.version}`,
    versionDay(row.created_at),
    row.reason,
  ].filter(Boolean);
}

function choose(row) {
  open.value = false;
  if (!row.current) emit("go-back", row);
}

/** Put the keyboard on the chip. */
function focus() {
  root.value?.querySelector(".wfver-btn")?.focus();
}

// A closed menu takes the row that had focus with it, and focus would fall to
// the page: it goes back to the chip, unless the click that closed the menu
// landed on another control.
watch(open, async (now) => {
  if (now) {
    emit("open");
    return;
  }
  await nextTick();
  const active = document.activeElement;
  if (!active || active === document.body || active.closest(".wfver-menu")) {
    focus();
  }
});

defineExpose({ focus });
</script>

<style scoped>
.wfver {
  display: flex;
}

/* The mock-up's `.ver`: metadata until pointed at. Pulled left by its own
   padding so the glyph sits on the head's left edge. */
.wfver-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--control-h-sm);
  margin-left: calc(-1 * var(--space-3));
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  white-space: nowrap;
  transition:
    background var(--dur-1) var(--ease-standard),
    color var(--dur-1) var(--ease-standard);
}

.wfver-btn:hover,
.wfver-btn[aria-expanded="true"] {
  background: var(--hover-wash);
  color: rgb(var(--v-theme-on-surface));
}

.wfver-menu {
  min-width: 280px;
}
</style>
