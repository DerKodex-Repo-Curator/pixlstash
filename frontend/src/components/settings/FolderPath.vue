<template>
  <!-- The folder name is the part that identifies a folder, so the path gives
       way in the MIDDLE: the head shrinks to an ellipsis while the last segment
       keeps its width. The home directory, the one part that says nothing, is
       said in one word; the full path is the tooltip. -->
  <span class="fp">
    <Tooltip :text="path" activator="parent" />
    <span class="visually-hidden">{{ path }}</span>
    <span v-if="parts.home" class="fp__home" aria-hidden="true">
      <v-icon size="12">mdi-home-outline</v-icon>home
    </span>
    <span class="fp__head" aria-hidden="true">{{ parts.head }}</span>
    <span class="fp__tail" aria-hidden="true">{{ parts.tail }}</span>
  </span>
</template>

<script setup>
import { computed } from "vue";
import { VIcon } from "vuetify/components";

import Tooltip from "../widgets/Tooltip.vue";
import { splitFolderPath } from "../../utils/folderPath";

const props = defineProps({
  path: { type: String, required: true },
});

const parts = computed(() => splitFolderPath(props.path));
</script>

<style scoped>
.fp {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-base);
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}

.fp__home {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 18px;
  padding: 0 var(--space-2);
  margin-right: var(--space-1);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--radius-sm);
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
}

/* Shrinks first, but never below the width of its ellipsis. */
.fp__head {
  flex: 0 1 auto;
  min-width: 2ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fp__head:empty {
  min-width: 0;
}

.fp__tail {
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
