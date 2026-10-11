<script setup>
// Which libraries the ComfyUI link's key works in: the one it was linked in,
// or whichever is open. Shown with more than one library, to an owner on the
// local network (`can_manage`); the same switch as "Every library" in the
// token list and "Use in every library" in Connect AI agent, and the same
// call. `link` is the `GET /comfyui/link` body, whose `token_id` names the key.
import { computed, ref } from "vue";
import { VSwitch } from "vuetify/components";
import { setTokenLibraries } from "../../api/users";
import { useLibrariesStore } from "../../stores/useLibrariesStore";
import { errorMessage } from "../../utils/apiError";

const props = defineProps({
  link: { type: Object, default: null },
});

const emit = defineEmits(["changed"]);

const librariesStore = useLibrariesStore();
const offered = computed(
  () =>
    Boolean(props.link?.linked && props.link?.token_id) &&
    librariesStore.libraries.length > 1 &&
    librariesStore.canManage,
);
const saving = ref(false);
const error = ref("");
// What the switch shows while the save is in flight, and after it.
const chosen = ref(null);
const everyLibrary = computed(() =>
  chosen.value === null ? props.link?.all_libraries === true : chosen.value,
);

async function set(value) {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  chosen.value = value;
  try {
    const body = await setTokenLibraries(props.link.token_id, value);
    chosen.value = body?.all_libraries === true;
    emit("changed", chosen.value);
  } catch (e) {
    chosen.value = null;
    error.value = errorMessage(e, "Could not change which libraries it uses.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="offered" class="cll" data-testid="comfyui-link-libraries">
    <v-switch
      :model-value="everyLibrary"
      color="primary"
      density="compact"
      hide-details
      label="Use in every library"
      :disabled="saving"
      data-testid="comfyui-link-every-library"
      @update:model-value="set"
    />
    <p class="cll__hint">
      {{
        everyLibrary
          ? "ComfyUI works on whichever library is open, and follows you when you switch."
          : "ComfyUI works in one library only. Its nodes are refused while another library is open."
      }}
    </p>
    <p v-if="error" class="cll__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.cll {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cll__hint,
.cll__error {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

.cll__hint {
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

.cll__error {
  color: rgb(var(--v-theme-surface-error));
}
</style>
