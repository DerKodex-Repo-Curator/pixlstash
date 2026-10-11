<template>
  <div class="personpick" role="group" :aria-label="ariaLabel || undefined">
    <template v-for="o in options" :key="String(o.id)">
      <!-- Fixed: the popup was opened ON this person, so the tile is a
           statement, not a control. Said as a checkbox that cannot be
           cleared, so it reads like the tiles beside it. -->
      <span
        v-if="o.fixed"
        class="persontile persontile--on"
        role="checkbox"
        aria-checked="true"
        aria-disabled="true"
        data-testid="person-fixed"
      >
        <span class="persontile__face">
          <img v-if="faceOf(o)" :src="faceOf(o)" alt="" @error="broken.add(o.id)" />
          <v-icon v-else aria-hidden="true">mdi-account-outline</v-icon>
        </span>
        <span class="persontile__name">{{ o.label }}</span>
      </span>
      <button
        v-else
        type="button"
        role="checkbox"
        class="persontile"
        :class="{ 'persontile--on': isOn(o) }"
        :aria-checked="isOn(o) ? 'true' : 'false'"
        :disabled="disabled"
        :data-person="String(o.id)"
        @click="emit('toggle', o.id)"
      >
        <span class="persontile__face">
          <img
            v-if="faceOf(o)"
            :src="faceOf(o)"
            alt=""
            loading="lazy"
            @error="broken.add(o.id)"
          />
          <v-icon v-else aria-hidden="true">{{
            o.id === NO_ONE ? "mdi-account-off-outline" : "mdi-account-outline"
          }}</v-icon>
        </span>
        <span class="persontile__name">{{ o.label }}</span>
      </button>
    </template>
  </div>
</template>

<script setup>
/**
 * Pick the people a run is of, by face: one tile per person, and "No one".
 *
 * Several can be picked, so each tile is a checkbox (`aria-checked`, a choice
 * and not a press) and a tab stop of its own; pressing a picked tile unpicks
 * it. "No one" is the tile for the empty pick: on while nobody is picked, and
 * pressing it takes everyone off. It follows OptionRows' rule: NO FILL. A
 * picked tile is an olive ring round the face and a medium-weight name; hover
 * is the ink wash, which follows the pointer and not the value.
 */
import { computed, reactive } from "vue";
import { VIcon } from "vuetify/components";
import { characterThumbnailUrl } from "../../api/characters";

/** The id of the "No one" tile: no person is a choice, not an absence. */
const NO_ONE = null;

const props = defineProps({
  /** `[{ id, name }]`: the people offered, in the order to draw them. */
  people: { type: Array, required: true },
  /** The ids of the people picked, the fixed one included. */
  modelValue: { type: Array, default: () => [] },
  /** The person the run was opened on: drawn picked, with nothing to press. */
  fixedId: { type: [Number, String, null], default: null },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: "" },
});

/** `toggle(id)`: a tile was pressed. Null is "No one". */
const emit = defineEmits(["toggle"]);

const options = computed(() => [
  // With somebody fixed the run is never of no one.
  ...(props.fixedId == null ? [{ id: NO_ONE, label: "No one" }] : []),
  ...props.people.map((person) => ({
    id: person.id,
    label: person.name,
    fixed: person.id === props.fixedId,
  })),
]);

function isOn(option) {
  return option.id === NO_ONE
    ? !props.modelValue.length
    : props.modelValue.includes(option.id);
}

/** People whose thumbnail would not load: they keep their tile, with a glyph. */
const broken = reactive(new Set());

function faceOf(option) {
  if (option.id === NO_ONE || broken.has(option.id)) return "";
  return characterThumbnailUrl(option.id);
}
</script>

<style scoped>
.personpick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.persontile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  /* One face and its ring, plus the tile's own padding either side. */
  width: calc(var(--space-9) + var(--space-3));
  padding: var(--space-3) var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
}

button.persontile {
  cursor: pointer;
  transition: background var(--dur-1) var(--ease-standard);
}

button.persontile:not(:disabled):hover {
  background: var(--hover-wash);
}

button.persontile:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Weight is the second cue, so the answer survives without colour. */
.persontile--on {
  font-weight: var(--weight-medium);
}

.persontile__face {
  display: grid;
  place-items: center;
  width: var(--space-8);
  height: var(--space-8);
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: var(--hover-wash);
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  /* Room for the ring, held whether or not it is drawn, so choosing a tile
     moves nothing. */
  outline: var(--focus-width) solid transparent;
  outline-offset: var(--space-1);
}

/* One olive mark per tile: the ring. */
.persontile--on .persontile__face {
  outline-color: var(--active-bar);
}

.persontile__face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.persontile__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
