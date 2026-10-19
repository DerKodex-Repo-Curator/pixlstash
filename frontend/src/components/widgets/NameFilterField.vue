<template>
  <div class="tbm-input-wrap">
    <v-icon size="16" class="tbm-input-icon">mdi-magnify</v-icon>
    <input
      ref="fieldRef"
      class="tbm-input tbm-input--with-icon"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="label"
      autocomplete="off"
      spellcheck="false"
      @input="emit('update:modelValue', $event.target.value)"
      @keydown.esc="onEsc"
    />
  </div>
</template>

<script setup>
/**
 * The name filter the Models shelf and the Workflows screen share: one field in
 * the Filters menu and one in the toolbar, both bound to the same store value,
 * so typing in either narrows the list as you type.
 *
 * Escape clears the text first and only a second press reaches the menu or the
 * view behind it, so clearing a filter never also closes the menu around it.
 */
import { ref } from "vue";
import { VIcon } from "vuetify/components";

defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Filter by name…" },
  label: { type: String, default: "Filter by name" },
});
const emit = defineEmits(["update:modelValue"]);

const fieldRef = ref(null);

function onEsc(event) {
  if (!event.target.value) return;
  event.preventDefault();
  event.stopPropagation();
  emit("update:modelValue", "");
}

/**
 * Focus the field, retrying while it cannot take focus yet: a menu that has
 * just been opened shows its content a frame or two after it renders it.
 */
function focus(frames = 10) {
  const field = fieldRef.value;
  if (!field) return;
  field.focus();
  if (document.activeElement !== field && frames > 0) {
    requestAnimationFrame(() => focus(frames - 1));
  }
}

defineExpose({
  focus,
  // Whether the field is laid out at all: the toolbar's copy is hidden by a
  // container query when the bar runs out of room.
  isShown: () => Boolean(fieldRef.value?.offsetParent),
});
</script>
