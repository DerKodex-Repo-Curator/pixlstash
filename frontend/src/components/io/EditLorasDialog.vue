<template>
  <AppDialog
    :open="open"
    title="Edit LoRAs"
    :subtitle="cardName"
    :size="branched ? 'xl' : 'md'"
    :fullscreen="lanes.length > 2"
    @close="close"
    @accept="primary"
  >
    <p v-if="loading" class="eld-note eld-quiet">Reading the chain…</p>
    <p v-else-if="loadError" class="eld-note eld-bad" role="alert">
      {{ loadError }}
    </p>

    <template v-else>
      <!-- The planner's own sentence, shown rather than hit: an edit that
           cannot be saved is not arranged first and refused after. -->
      <div v-if="!editable" class="eld-refusal" role="status">
        <v-icon size="16" class="eld-refusal-glyph">mdi-lock-outline</v-icon>
        <p class="eld-note">
          {{ refusal || "This chain cannot be changed just now." }}
          Deleting, dragging and adding are off; the list is shown as read.
        </p>
      </div>

      <p v-if="dropMissed" class="eld-note eld-quiet" role="status">
        This workflow has no loader for {{ dropMissed }}, so nothing was
        deleted for it.
      </p>

      <!-- The chain drawn as a graph: the model source, each loader and what
           reads the result, one node each, with an arrow from every node to
           the next. The two ends are not rows: nothing drags onto or past
           them. -->
      <div ref="listEl">
      <div v-if="!branched" class="eld-chain">
        <div class="eld-node" data-testid="eld-source">
          <template v-if="chain?.source">
            <span class="eld-node-title">{{ chain.source.class_type }}</span>
            <span class="eld-node-body eld-quiet"
              >#{{ chain.source.node_id }} · hands out
              {{ (chain.source.outputs || []).join(", ") }}</span
            >
          </template>
          <span v-else class="eld-node-body eld-quiet">No model source found</span>
        </div>

        <ol class="eld-list" aria-label="LoRAs, in the order the chain applies them">
          <EditLorasRow
            v-for="row in segmentRows(null)"
            :key="row.id"
            v-bind="rowProps(row)"
            v-on="rowHandlers(row)"
          />
        </ol>

        <!-- Add appends the last loader, so it sits on the last wire, the
             one into the node that reads the chain. -->
        <span class="eld-wire eld-wire--plain" aria-hidden="true"></span>
        <div class="eld-add">
          <AppButton
            size="sm"
            icon-left="plus"
            :disabled="!canAdd"
            :aria-label="spliceLabel"
            @click="add(null)"
          >
            {{ spliceIn ? "Insert LoRA between these nodes" : "Add a LoRA" }}
          </AppButton>
          <span v-if="editable && !shelf.length && shelfRead" class="eld-note eld-quiet">
            Your model shelf has no LoRA to add.
          </span>
        </div>

        <span class="eld-wire" aria-hidden="true"></span>

        <div class="eld-node" data-testid="eld-sink">
          <span v-if="chain?.sink?.summary" class="eld-node-title">{{
            chain.sink.summary
          }}</span>
          <span v-else class="eld-node-body eld-quiet"
            >Nothing found reading the chain</span
          >
        </div>
      </div>

      <!-- The model forks: the loaders every pass reads once, at the top, then
           a drawn fork into one lane per sampler, side by side. Every loader
           appears exactly once, where the model actually passes through it. -->
      <div v-else class="eld-graph" data-testid="eld-graph">
        <div v-if="chain.source" class="eld-trunk">
          <div class="eld-node" data-testid="eld-source">
            <span class="eld-node-title"
              >{{ chain.source.class_type }} #{{ chain.source.node_id }}</span
            >
            <span class="eld-node-body eld-quiet"
              >hands out {{ (chain.source.outputs || []).join(", ") }}</span
            >
          </div>
          <span class="eld-wire" aria-hidden="true"></span>
          <section class="eld-group" :aria-label="everyLabel" data-testid="eld-trunk">
            <div class="eld-group-head">
              <span class="section-label">{{ everyLabel }}</span>
              <span class="eld-note eld-quiet">before the fork</span>
            </div>
            <ol class="eld-list" :aria-label="`LoRAs ${everyWord} get, in apply order`">
              <EditLorasRow
                v-for="row in segmentRows(null)"
                :key="row.id"
                v-bind="rowProps(row)"
                v-on="rowHandlers(row)"
              />
            </ol>
            <div
              v-if="dropTarget(null)"
              class="eld-drop"
              @dragover.prevent
              @drop.prevent="dropInto(null)"
            >
              {{ dropTarget(null) }}
            </div>
            <span class="eld-wire eld-wire--plain eld-wire--short" aria-hidden="true"></span>
            <div class="eld-add">
              <AppButton size="sm" icon-left="plus" :disabled="!canAdd" @click="add(null)">
                Add for {{ everyWord }}
              </AppButton>
            </div>
          </section>
        </div>

        <!-- The fork: a stem off the trunk, a bar, and a leg into each lane. -->
        <div v-if="chain.source" class="eld-fork" aria-hidden="true">
          <span class="eld-fork-stem"></span>
          <span
            class="eld-fork-bar"
            :style="{ left: legAt(0), right: `calc(100% - ${legAt(lanes.length - 1)})` }"
          ></span>
          <span
            v-for="(lane, index) in lanes"
            :key="index"
            class="eld-fork-leg"
            :style="{ left: legAt(index) }"
          ></span>
        </div>

        <div class="eld-lanes" :style="{ '--eld-lanes': lanes.length }">
          <section
            v-for="(lane, index) in lanes"
            :key="index"
            class="eld-lane"
            :class="`eld-lane--${index % 2 ? 'b' : 'a'}`"
            :aria-label="laneName(lane)"
            data-testid="eld-lane"
          >
            <header class="eld-lane-head">
              <b>{{ laneName(lane) }}</b>{{ " " }}<small>{{ laneMeta(lane, index) }}</small>
            </header>
            <template v-if="lane.source">
              <div class="eld-node">
                <span class="eld-node-title"
                  >{{ lane.source.class_type }} #{{ lane.source.node_id }}</span
                >
                <span class="eld-node-body eld-quiet">hands out MODEL</span>
              </div>
            </template>
            <ol class="eld-list" :aria-label="`LoRAs only ${laneName(lane)} gets, in apply order`">
              <EditLorasRow
                v-for="row in segmentRows(index)"
                :key="row.id"
                v-bind="rowProps(row)"
                v-on="rowHandlers(row)"
              />
            </ol>
            <div
              v-if="dropTarget(index)"
              class="eld-drop"
              @dragover.prevent
              @drop.prevent="dropInto(index)"
            >
              {{ dropTarget(index) }}
            </div>
            <span class="eld-wire eld-wire--plain eld-wire--short" aria-hidden="true"></span>
            <div class="eld-add">
              <AppButton
                size="sm"
                icon-left="plus"
                :disabled="!canAdd"
                :aria-label="`Add a LoRA for ${laneName(lane)} only`"
                @click="add(index)"
              >
                Add
              </AppButton>
            </div>
            <!-- The shorter lane's sampler sits level with the other's, so
                 both chains end on the same line. -->
            <span class="eld-spacer"></span>
            <span class="eld-wire" aria-hidden="true"></span>
            <div class="eld-node">
              <span v-if="lane.sink?.summary" class="eld-node-title">{{
                lane.sink.summary
              }}</span>
              <span v-else class="eld-node-body eld-quiet"
                >Nothing found reading this pass</span
              >
            </div>
          </section>
        </div>
        <span v-if="editable && !shelf.length && shelfRead" class="eld-note eld-quiet">
          Your model shelf has no LoRA to add.
        </span>
      </div>
      </div>

      <!-- Why the list is shorter than the workflow: a node that is not a
           loader, or a further branch, and the loaders past it are left as
           they are. -->
      <p v-if="chain?.branch_note" class="eld-note eld-quiet" data-testid="eld-branch">
        {{ chain.branch_note }}
      </p>

      <!-- The empty chain says which loader class goes in, rather than
           surprising the owner with a node they did not choose. -->
      <p v-if="firstLoaderNote" class="eld-note eld-quiet">
        {{ firstLoaderNote }}
      </p>

      <!-- The dry run's own lines, the rewires included: the part of an
           edit no owner can see in the list above. -->
      <div v-if="previewing || previewError || changes.length">
        <span class="section-label">What changes</span>
        <p v-if="previewError" class="eld-note eld-bad" role="alert">
          {{ previewError }}
        </p>
        <ul v-else-if="changes.length" class="eld-changes" data-testid="eld-changes">
          <li v-for="(change, index) in changes" :key="`${index}:${change.kind}`">
            {{ change.text }}
          </li>
        </ul>
        <p v-else class="eld-note eld-quiet">Working out what changes…</p>
      </div>

      <p v-if="saveError" class="eld-note eld-bad" role="alert">
        {{ saveError }}
      </p>
    </template>

    <!-- One live region for the gestures a reader who is not watching the
         list cannot see: a move, a removal, a row put back. -->
    <p class="visually-hidden" role="status" aria-live="polite">
      {{ liveMessage }}
    </p>
    <!-- And one for the primary button changing its word. Its own region:
         the dry run answers a moment after the gesture, and one region would
         have it replace "… moved to 3 of 4" before that was read. -->
    <p
      class="visually-hidden"
      role="status"
      aria-live="polite"
      data-testid="eld-button-said"
    >
      {{ buttonMessage }}
    </p>

    <template #footer>
      <!-- What the one button does with this edit. It names the button, so
           it is the button's description too, and it is pinned in the footer
           with it: in the body it scrolled out from under a long chain, and
           the sentence saying a Save writes at once was the part cut off. -->
      <p
        v-if="editable"
        :id="noteId"
        class="eld-note eld-quiet eld-foot-note"
        data-testid="eld-note"
      >
        {{ note }}
      </p>
      <span v-if="editable" class="eld-count" data-testid="eld-count">
        {{ changeLabel }}
      </span>
      <AppButton @click="close">{{ editable ? "Cancel" : "Close" }}</AppButton>
      <!-- One button, whose word is what it does with this edit. The same
           element either way, so a change of word leaves focus where it is. -->
      <AppButton
        v-if="editable"
        variant="primary"
        :loading="saving"
        :disabled="!ready"
        :aria-describedby="noteId"
        data-testid="eld-primary"
        @click="primary"
      >
        {{ waits ? "Apply" : "Save" }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
/**
 * Edit LoRAs (#1478, direction B; #1850): a workflow's LoRA chain as one
 * list between two fixed ends, ending in one button.
 *
 * The model source above, the sink below, and between them the loaders in
 * the order the chain applies them — so dragging row 3 above row 2 genuinely
 * makes a different picture. Three gestures and no others: delete a row, drag
 * a row (Alt+↑/↓ on the focused handle does the same), add one to the end.
 *
 * **The route's dry run says what an edit is, and the button follows it.**
 * Every gesture asks `PUT …/lora-chain` for a dry run and lists the changes it
 * answers with, the rewires included, which are the part no owner can see.
 * The kinds on that list, and nothing worked out here, decide the button:
 *
 * - **Apply**, when every change is a loader deleted or a shelf LoRA's
 *   strength. Nothing is written: `apply` hands the Workflow tab a fragment of
 *   the workflow's unsaved changes (`skip_loras` and `loras`, the server's
 *   `WorkflowChanges` words) and the tab's own bar saves it. The `rewired`
 *   line a delete brings with it changes nothing here: removing a loader from
 *   the unsaved changes rewires round it the same way.
 * - **Save**, when a loader is added or moved, or the strength is of a LoRA
 *   the shelf cannot name: the unsaved changes have no words for those, so
 *   the edit is written at once (`overwrite` on the PUT) as the workflow's
 *   next version, which the tab's version menu takes back. It emits
 *   `overwritten`, because the card selected does not change and the rail
 *   must read it again.
 *
 * **Where the model forks** (`lanes` in the read), the chain is drawn as the
 * graph it is: the loaders every pass reads once at the top, then one lane per
 * sampler side by side. Every loader appears once; a drag (or the row's menu)
 * moves one within a lane, into the trunk, or across into another pass. A
 * workflow loading a model per pass has no trunk, only lanes.
 *
 * **Read-only when the planner refuses** (`editable: false`): ComfyUI down,
 * loaders that start from different places… The refusal is the server's
 * sentence and is shown instead of letting an edit be arranged that cannot be
 * saved.
 */
import { computed, ref, useId, watch } from "vue";
import { VIcon } from "vuetify/components";

import { listAdapters } from "../../api/modelShelf";
import { getLoraChain, saveLoraChain } from "../../api/workflows";
import { useNoticeStore } from "../../stores/useNoticeStore";
import { useWorkflowsStore } from "../../stores/useWorkflowsStore";
import { errorMessage } from "../../utils/apiError";
import { focusLater } from "../../utils/dom";
import { pictureCount as countPictures } from "../../utils/workflowSets";
import {
  chainEntries,
  countChanges,
  formatStrength,
  loraBase,
  loraStem,
} from "../../utils/loraChain";
import AppButton from "../widgets/AppButton.vue";
import AppDialog from "../widgets/AppDialog.vue";
import EditLorasRow from "./EditLorasRow.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The workflow whose chain is edited. Only Save writes to it. */
  workflowId: { type: String, default: "" },
  /** What the owner calls the workflow: the subtitle, and the Save note. */
  cardName: { type: String, default: "" },
  /** How many pictures the workflow made, for "keeps its N pictures". */
  pictureCount: { type: Number, default: 0 },
  /**
   * A LoRA filename to open with its loader already struck through.
   *
   * Save-as-recipe's "The workflow" answer: the owner already said which
   * entry they meant, so the dialog opens with it removed and Put back beside
   * it rather than asking them to find it again.
   */
  dropLora: { type: String, default: "" },
});

/**
 * `apply` carries `{skip_loras: [{node_id, field}], loras: [{node_id, field,
 * sha256, strength_model, strength_clip}]}` and writes nothing; `overwritten`
 * carries the workflow id, after a Save. `close` follows either.
 */
const emit = defineEmits(["close", "apply", "overwritten"]);

const notices = useNoticeStore();
const workflows = useWorkflowsStore();

/** `GET …/lora-chain`, as read. */
const chain = ref(null);
const loading = ref(false);
const loadError = ref("");
/** The rows on screen, in list order. See `rowOf`. */
const rows = ref([]);
/** The shelf's digested LoRAs, for Add. */
const shelf = ref([]);
const shelfRead = ref(false);

/** The dry run's answer for the edit on screen: `[{kind, node_id, text}]`. */
const changes = ref([]);
const previewing = ref(false);
const previewError = ref("");
const saving = ref(false);
const saveError = ref("");
/** A `dropLora` the chain has no loader for, said rather than ignored. */
const dropMissed = ref("");

const draggingId = ref(null);
const overId = ref(null);
const liveMessage = ref("");
const buttonMessage = ref("");
const listEl = ref(null);
/** The note under the list is the primary button's description. */
const noteId = useId();

let newRows = 0;
/** The primary button's word as last said aloud; it opens reading Apply. */
let saidWord = "Apply";
/** Bumped per open, so a slow read for a closed dialog writes nothing. */
let loadToken = 0;

const editable = computed(() => Boolean(chain.value?.editable));
const refusal = computed(() => chain.value?.refusal || "");

const picturesLabel = computed(() => countPictures(props.pictureCount));

/** The card's name in a sentence, or words for one whose name has not landed. */
const shownName = computed(() => props.cardName || "this workflow");

/** One lane per pass when the model forks; empty for a straight chain. */
const lanes = computed(() => chain.value?.lanes || []);
const branched = computed(() => lanes.value.length > 0);

/** "both passes" at a two-way fork, "every pass" past that. */
const everyWord = computed(() =>
  lanes.value.length === 2 ? "both passes" : "every pass",
);
const everyLabel = computed(
  () => everyWord.value.charAt(0).toUpperCase() + everyWord.value.slice(1),
);

/** The rows of one segment, in list order: `null` is the trunk, a number a lane. */
function segmentRows(lane) {
  return rows.value.filter((row) => row.lane === lane);
}

/**
 * Each standing row's 1-based place on its sampler's path; a deleted row has
 * none. A lane counts on from the trunk, since the trunk runs first.
 */
const positions = computed(() => {
  const out = {};
  const trunk = segmentRows(null).filter((row) => !row.deleted);
  trunk.forEach((row, index) => {
    out[row.id] = index + 1;
  });
  lanes.value.forEach((_lane, lane) => {
    segmentRows(lane)
      .filter((row) => !row.deleted)
      .forEach((row, index) => {
        out[row.id] = trunk.length + index + 1;
      });
  });
  return out;
});

/** The rows with their strength as a number, the shape the helpers read. */
const effectiveRows = computed(() =>
  rows.value.map((row) => ({
    ...row,
    strength: !row.hasStrength
      ? null
      : row.strengthText === formatStrength(row.readStrength)
        ? row.readStrength
        : Number(row.strengthText),
  })),
);

/** Every loader as read, each marked with the segment it was read in. */
const readLoaders = computed(() => [
  ...(chain.value?.loaders || []).map((loader) => ({ ...loader, lane: null })),
  ...lanes.value.flatMap((lane, index) =>
    (lane.loaders || []).map((loader) => ({ ...loader, lane: index })),
  ),
]);

const changeCount = computed(() =>
  countChanges(readLoaders.value, effectiveRows.value),
);

/**
 * The footer's summary, in the words of what was done: "1 loader removed",
 * "2 loaders moved, 1 strength changed". Counted off the rows the owner sees,
 * never off the dry run: it has to read right while that is still out, and a
 * rewire is a consequence the list under *What changes* already spells out.
 * What is neither removed, added nor re-weighted was moved.
 */
const changeLabel = computed(() => {
  const count = changeCount.value;
  if (!count) return "No changes";
  const rowsNow = effectiveRows.value;
  const removed = rowsNow.filter((row) => !row.isNew && row.deleted).length;
  const added = rowsNow.filter((row) => row.isNew && row.sha256).length;
  const strengths = rowsNow.filter(
    (row) =>
      !row.isNew &&
      !row.deleted &&
      row.hasStrength &&
      row.strength !== row.readStrength,
  ).length;
  const moved = Math.max(0, count - removed - added - strengths);
  const loaders = (n, did) => `${n} ${n === 1 ? "loader" : "loaders"} ${did}`;
  return [
    removed && loaders(removed, "removed"),
    added && loaders(added, "added"),
    moved && loaders(moved, "moved"),
    strengths &&
      `${strengths} ${strengths === 1 ? "strength" : "strengths"} changed`,
  ]
    .filter(Boolean)
    .join(", ");
});

function adapterLabel(adapter) {
  return adapter.display_name || loraStem(adapter.filename) || adapter.sha256;
}

const pickerOptions = computed(() => [
  { value: "", label: "Pick a LoRA from your shelf…" },
  ...shelf.value.map((adapter) => ({
    value: String(adapter.sha256),
    label: adapterLabel(adapter),
  })),
]);

/**
 * No row at all, both ends read, and the chain editable: the button sits on
 * the wire between the two nodes and says so. A deleted row still stands on
 * screen with Put back, so it keeps the list between the nodes and the button
 * an Add; a read-only chain offers no insert to name.
 */
const spliceIn = computed(
  () =>
    editable.value &&
    !branched.value &&
    !rows.value.length &&
    Boolean(chain.value?.source && chain.value?.sink?.summary),
);

/**
 * The splice button's name, with the two nodes in it.
 *
 * The sink comes after the button in reading order, so "these nodes" alone
 * points a screen reader at something it has not reached. The visible words
 * lead, so a speech-input user can say what they see (WCAG 2.5.3).
 */
const spliceLabel = computed(() => {
  if (!spliceIn.value) return undefined;
  const { source, sink } = chain.value;
  const reader = (sink.consumers || []).find(
    (consumer) => String(consumer.type || "").toUpperCase() === "MODEL",
  );
  const readerName = reader
    ? `${reader.class_type} #${reader.node_id}`
    : sink.summary;
  return `Insert LoRA between these nodes: ${source.class_type} #${source.node_id} and ${readerName}`;
});

/** A new row with nothing picked yet: Add waits for it, and so does Save. */
const unpicked = computed(() =>
  rows.value.some((row) => row.isNew && !row.sha256),
);

const canAdd = computed(
  () =>
    editable.value &&
    !saving.value &&
    !unpicked.value &&
    shelf.value.length > 0,
);

/**
 * The edit as the dry run is asked about it, or "" for one there is nothing
 * to ask about: no change, a row with no LoRA picked, a strength that is not
 * a number. The route answers an unchanged chain with a refusal, so it is
 * not asked.
 */
const previewKey = computed(() =>
  editable.value &&
  changeCount.value > 0 &&
  !unpicked.value &&
  !rows.value.some(strengthInvalid)
    ? JSON.stringify(requestBody({ dry_run: true }))
    : "",
);

/**
 * The edit as a fragment of the workflow's unsaved changes, or `null` for
 * one they cannot hold, which Save writes instead.
 *
 * Read off the dry run's kinds. A delete is the loader's slot in
 * `skip_loras`; a strength is its slot in `loras` with the LoRA it already
 * loads, which needs the shelf's digest for it. Anything else on the list
 * (`added`, `moved`, a strength with no digest) has no words there. `rewired`
 * is what a delete does to the nodes reading the chain, and the unsaved
 * changes rewire round a removed loader by themselves, so beside a delete it
 * is carried; with no delete to explain it, it is not.
 */
const fragment = computed(() => {
  const read = readLoaders.value;
  const set = effectiveRows.value;
  const out = { skip_loras: [], loras: [] };
  let rewired = false;
  for (const change of changes.value) {
    const id = String(change.node_id);
    const loader = read.find((entry) => String(entry.node_id) === id);
    const row = set.find((entry) => entry.nodeId === id);
    if (change.kind === "deleted" && loader) {
      out.skip_loras.push({ node_id: id, field: loader.field });
    } else if (change.kind === "strength" && loader?.sha256 && row) {
      // One field sets the model strength. The CLIP strength follows it only
      // where the two were one number, which is what the route's own write
      // does (`_strength_update`); a loader weighted apart keeps its CLIP.
      const together =
        loader.strength_clip !== null &&
        loader.strength_clip !== undefined &&
        Number(loader.strength_clip) === Number(loader.strength);
      out.loras.push({
        node_id: id,
        field: loader.field,
        sha256: loader.sha256,
        strength_model: row.strength,
        strength_clip: together ? row.strength : (loader.strength_clip ?? null),
      });
    } else if (change.kind === "rewired") {
      rewired = true;
    } else {
      return null;
    }
  }
  return rewired && !out.skip_loras.length ? null : out;
});

/** Whether the edit can wait as an unsaved change: Apply, else Save. */
const waits = computed(() => fragment.value !== null);

// The button's word is what it does with the edit, and an edit can change
// it under a reader who is not looking at it: a removal reads Apply, and
// moving a loader on top of it turns the same button into Save, which writes
// at once. So the change is said when it happens, with the note that
// explains it. Only a change of word: the first Apply is the button as it
// opened, and a second removal changes nothing about what the button does.
watch(
  () => (changes.value.length ? (waits.value ? "Apply" : "Save") : ""),
  (word) => {
    if (!word) {
      // No edit: the button reads Apply again, and does nothing. The line
      // is cleared with it, or the same edit made again would put the same
      // words in the region and a screen reader would say nothing.
      if (!previewing.value) {
        saidWord = "Apply";
        buttonMessage.value = "";
      }
      return;
    }
    if (word === saidWord) return;
    saidWord = word;
    buttonMessage.value = `The button now reads ${word}. ${note.value}`;
  },
);

/** The primary acts only on an edit the dry run has answered for. */
const ready = computed(
  () => !saving.value && !previewing.value && changes.value.length > 0,
);

const note = computed(() => {
  if (waits.value) {
    return "Apply puts this in the Workflow tab as an unsaved change. Nothing is written until you save there.";
  }
  const kinds = new Set(changes.value.map((change) => change.kind));
  const why =
    kinds.has("added") || kinds.has("moved")
      ? "Moving or adding a loader"
      : kinds.has("strength")
        ? "A strength for a LoRA missing from your model shelf"
        : "This edit";
  return `${why} cannot wait as an unsaved change. Save writes it straight away: ${shownName.value} keeps its name and its ${picturesLabel.value}, and this chain becomes its next version. The version menu in the Workflow tab takes it back.`;
});

/**
 * Where the first loader goes, said before it is saved.
 *
 * Only for a chain with no loader of its own: there the class that goes in
 * is decided in code (LoraLoader with a CLIP source, LoraLoaderModelOnly
 * without), and the owner is told which rather than finding a node they did
 * not choose.
 */
const firstLoaderNote = computed(() => {
  const read = chain.value;
  if (!read || !editable.value || branched.value || (read.loaders || []).length) {
    return "";
  }
  if (!rows.value.some((row) => row.isNew)) return "";
  const cls = read.added_loader_class;
  const source = read.source;
  const readers = (read.sink?.consumers || []).filter(
    (consumer) => String(consumer.type || "").toUpperCase() === "MODEL",
  ).length;
  const parts = [];
  if (source) {
    parts.push(
      `The loader goes in after #${source.node_id} ${source.class_type}, and the ${readers} ${readers === 1 ? "input" : "inputs"} reading its MODEL ${readers === 1 ? "is" : "are"} rewired to it.`,
    );
  }
  if (cls === "LoraLoaderModelOnly") {
    parts.push("This graph has no CLIP source, so LoraLoaderModelOnly is used.");
  } else if (cls) {
    parts.push(`This graph has a CLIP source, so ${cls} is used.`);
  }
  return parts.join(" ");
});

/**
 * A loader node's title bar, spelled like the source's: its class and id. A
 * new row has no node yet, so it names the class a save puts in.
 */
function loaderTitle(row) {
  if (row.isNew) {
    const owner = row.lane === null ? chain.value : lanes.value[row.lane];
    return owner?.added_loader_class || "LoRA loader";
  }
  return `${row.classType || "LoRA loader"} #${row.nodeId}`;
}

/** A pass as the owner reads it: its sampler's title, else `KSampler #15`. */
function laneName(lane) {
  const sampler = lane?.sampler || {};
  return sampler.title || `${sampler.class_type || "Node"} #${sampler.node_id}`;
}

/** Where a segment's rows go, in words: a lane's name, or "both passes". */
function segmentLabel(lane) {
  return lane === null ? everyWord.value : laneName(lanes.value[lane]);
}

/**
 * The lane header's small line: the sampler's class and id when a title
 * stands above it, and how many LoRAs that sampler gets in all, trunk
 * included, so nobody has to add it up.
 */
function laneMeta(lane, index) {
  const count = [...segmentRows(null), ...segmentRows(index)].filter(
    (row) => !row.deleted && (!row.isNew || row.sha256),
  ).length;
  const all = `${count} ${count === 1 ? "LoRA" : "LoRAs"} in all`;
  const sampler = lane?.sampler || {};
  return sampler.title ? `${sampler.class_type} #${sampler.node_id} · ${all}` : all;
}

/** Where the fork's leg into lane *index* lands, across the lanes' width. */
function legAt(index) {
  return `${((index + 0.5) / lanes.value.length) * 100}%`;
}

/** The segments a row's menu can send it to: every one but its own. */
function moveTargets(row) {
  if (!branched.value || row.deleted) return [];
  const targets = [];
  if (chain.value?.source && row.lane !== null) {
    targets.push({ lane: null, label: everyWord.value });
  }
  lanes.value.forEach((_lane, index) => {
    if (row.lane !== index) targets.push({ lane: index, label: segmentLabel(index) });
  });
  return targets;
}

function rowProps(row) {
  return {
    row,
    position: positions.value[row.id] ?? null,
    title: loaderTitle(row),
    editable: editable.value,
    saving: saving.value,
    canReorder: canReorder(row),
    invalid: strengthInvalid(row),
    dragging: draggingId.value === row.id,
    over: overId.value === row.id,
    compact: branched.value,
    pickerOptions: pickerOptions.value,
    moveTargets: moveTargets(row),
  };
}

function rowHandlers(row) {
  return {
    dragstart: (event) => onDragStart(row, event),
    dragend: onDragEnd,
    dragover: () => onDragOver(row),
    dragleave: () => onDragLeave(row),
    drop: () => onDrop(row),
    move: (delta) => move(row, delta),
    "move-to": (lane) => moveTo(row, lane),
    pick: (value) => pick(row, value),
    strength: (value) => {
      row.strengthText = value;
    },
    remove: () => remove(row),
    restore: () => restore(row),
  };
}

function strengthInvalid(row) {
  if (row.deleted || !row.hasStrength) return false;
  const text = String(row.strengthText ?? "").trim();
  const value = Number(text);
  return !text || !Number.isFinite(value) || value < -10 || value > 10;
}

/** One row of the list, from one loader of the chain as read in *lane*. */
function rowOf(loader, lane = null) {
  const hasStrength = loader.strength !== null && loader.strength !== undefined;
  return {
    id: `n:${loader.node_id}`,
    nodeId: String(loader.node_id),
    classType: loader.class_type || "",
    name: loader.name || loraStem(loader.filename),
    fileBase: String(loader.filename || "").split(/[\\/]/).pop() || loader.name,
    filename: loader.filename || "",
    sha256: loader.sha256 || "",
    onShelf: Boolean(loader.on_shelf),
    hasStrength,
    strengthText: hasStrength ? formatStrength(loader.strength) : "",
    // The value as read, so a field left alone saves 0.855 and not the 0.86
    // it displays: re-weighting a loader nobody touched is a change the
    // owner did not make.
    readStrength: hasStrength ? Number(loader.strength) : null,
    deleted: false,
    isNew: false,
    lane,
  };
}

function say(message) {
  liveMessage.value = message;
}

/** Focus one control of one row once the list has re-rendered. */
function focusRow(rowId, which) {
  return focusLater(`[data-row="${rowId}"] [data-focus="${which}"]`, listEl);
}

async function load() {
  const token = (loadToken += 1);
  const mine = () => token === loadToken;
  chain.value = null;
  rows.value = [];
  loadError.value = "";
  saveError.value = "";
  dropMissed.value = "";
  changes.value = [];
  previewError.value = "";
  saidWord = "Apply";
  buttonMessage.value = "";
  say("");
  if (!props.workflowId) return;
  loading.value = true;
  try {
    const read = await getLoraChain(props.workflowId);
    if (!mine()) return;
    chain.value = read;
    rows.value = [
      ...(read?.loaders || []).map((loader) => rowOf(loader, null)),
      ...(read?.lanes || []).flatMap((lane, index) =>
        (lane.loaders || []).map((loader) => rowOf(loader, index)),
      ),
    ];
    applyDrop();
  } catch (err) {
    if (!mine()) return;
    console.warn(
      `[workflows] could not read the LoRA chain of ${props.workflowId}`,
      err,
    );
    loadError.value = errorMessage(err, "Could not read this workflow's LoRAs.");
  } finally {
    if (mine()) loading.value = false;
  }
  void loadShelf();
}

/**
 * Strike through the loader Save-as-recipe named, if the chain has it.
 *
 * Matched on the case-folded base name, which is how the shelf matches a
 * file, so a recipe naming `Hairstyle-V3.safetensors` finds the loader that
 * reads `loras/hairstyle-v3.safetensors`. A read-only chain strikes nothing:
 * a delete there is exactly what cannot be saved.
 */
function applyDrop() {
  const wanted = loraBase(props.dropLora);
  if (!wanted || !editable.value) return;
  const row = rows.value.find(
    (entry) =>
      !entry.deleted &&
      (loraBase(entry.filename) === wanted ||
        loraBase(entry.fileBase) === wanted),
  );
  if (!row) {
    dropMissed.value = props.dropLora;
    return;
  }
  row.deleted = true;
  say(`${row.name} is removed. Put back is on its row.`);
}

async function loadShelf() {
  if (shelfRead.value) return;
  try {
    const adapters = await listAdapters();
    // The Add picker's list and nothing else (the chain's own rows are named
    // by the server), so a LoRA this library hides is left out here.
    shelf.value = (adapters || []).filter(
      (adapter) => adapter?.sha256 && !adapter.hidden,
    );
  } catch (err) {
    // Add is the only thing this costs, and it says so by staying disabled.
    console.warn("[workflows] could not read the model shelf's LoRAs", err);
    shelf.value = [];
  } finally {
    shelfRead.value = true;
  }
}

// ── The three gestures ─────────────────────────────────────────────────────

function canReorder(row) {
  return editable.value && !row.deleted && !saving.value;
}

async function remove(row) {
  if (!editable.value) return;
  if (row.isNew) {
    // A loader that was never in the graph has nothing to restore: it goes.
    rows.value = rows.value.filter((entry) => entry.id !== row.id);
    say(`The new ${row.sha256 ? row.name : "LoRA"} row is taken out.`);
    return;
  }
  row.deleted = true;
  say(`${row.name} removed. Put back is on the same row.`);
  await focusRow(row.id, "restore");
}

async function restore(row) {
  row.deleted = false;
  say(`${row.name} restored, at ${positions.value[row.id]}.`);
  await focusRow(row.id, "delete");
}

/** Append one row with a shelf picker in it to *lane*, above its sampler. */
async function add(lane = null) {
  if (!canAdd.value) return;
  newRows += 1;
  const row = {
    id: `new:${newRows}`,
    nodeId: null,
    classType: "",
    name: "",
    fileBase: "",
    filename: "",
    sha256: "",
    onShelf: true,
    hasStrength: true,
    strengthText: formatStrength(1),
    deleted: false,
    isNew: true,
    lane,
  };
  rows.value = [...rows.value, row];
  say(`A new row is at ${positions.value[row.id]}. Pick a LoRA for it.`);
  await focusLater(`[data-row="${row.id}"] select`, listEl);
}

function pick(row, sha256) {
  const found = shelf.value.find((adapter) => String(adapter.sha256) === sha256);
  row.sha256 = sha256 || "";
  row.name = found
    ? found.display_name || loraStem(found.filename)
    : "";
  row.filename = found?.filename || "";
  row.fileBase = String(found?.filename || "").split(/[\\/]/).pop();
}

function onDragStart(row, event) {
  if (!canReorder(row)) return;
  draggingId.value = row.id;
  // Firefox starts no drag without a payload; `move` makes the cursor say so.
  event.dataTransfer?.setData("text/plain", row.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragOver(row) {
  if (draggingId.value) overId.value = row.id;
}

function onDragLeave(row) {
  if (overId.value === row.id) overId.value = null;
}

function onDragEnd() {
  draggingId.value = null;
  overId.value = null;
}

/**
 * A drop on a row lands in that row's place, and in its segment: dropping a
 * hires loader on a trunk row puts it before the fork.
 */
function onDrop(target) {
  const from = rows.value.findIndex((row) => row.id === draggingId.value);
  const to = rows.value.findIndex((row) => row.id === target.id);
  onDragEnd();
  if (from < 0 || to < 0 || from === to) return;
  const row = rows.value[from];
  const crossed = row.lane !== target.lane;
  row.lane = target.lane;
  place(from, to, { focus: false });
  // Across the fork the pass is the news, not the place in it.
  if (crossed) {
    say(
      `${row.name || "The new LoRA"} moved to ${segmentLabel(row.lane)}, at ${positions.value[row.id]}.`,
    );
  }
}

/** The drop slot's words while a row from another segment is lifted. */
function dropTarget(lane) {
  const row = rows.value.find((entry) => entry.id === draggingId.value);
  if (!row || row.lane === lane) return "";
  return `Drop to move ${row.name || "the new LoRA"} to ${segmentLabel(lane)}`;
}

function dropInto(lane) {
  const row = rows.value.find((entry) => entry.id === draggingId.value);
  onDragEnd();
  if (row) moveTo(row, lane);
}

/** Send *row* to the end of another segment: the drag's keyboard twin. */
async function moveTo(row, lane) {
  if (!canReorder(row) || row.lane === lane) return;
  row.lane = lane;
  rows.value = [...rows.value.filter((entry) => entry.id !== row.id), row];
  say(
    `${row.name || "The new LoRA"} moved to ${segmentLabel(lane)}, at ${positions.value[row.id]}.`,
  );
  await focusRow(row.id, "handle");
}

function move(row, delta) {
  const index = rows.value.indexOf(row);
  if (index < 0 || !canReorder(row)) return;
  // Past any deleted row, and within the row's own segment: it stays in the
  // list struck through, and swapping with it moves nothing the save would
  // write while announcing a move. Crossing the fork is the menu's job.
  let to = index + delta;
  while (
    to >= 0 &&
    to < rows.value.length &&
    (rows.value[to].deleted || rows.value[to].lane !== row.lane)
  ) {
    to += delta;
  }
  if (to < 0 || to >= rows.value.length) return;
  place(index, to, { focus: true });
}

/**
 * Move one row and say where it landed.
 *
 * Nothing is written: a move is one more gesture for the save. Focus follows
 * the handle that moved, so Alt+↓ held down walks one row down the list.
 */
function place(from, to, { focus }) {
  const next = rows.value.slice();
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  rows.value = next;
  const standing = next.filter(
    (entry) => !entry.deleted && entry.lane === row.lane,
  );
  say(
    `${row.name || "The new LoRA"} moved to ${standing.indexOf(row) + 1} of ${standing.length}.`,
  );
  if (focus) void focusRow(row.id, "handle");
}

// ── The dry run after every gesture, then Apply or Save ──────────────────

/** `PUT …/lora-chain`'s body for the chain on screen. It names nothing. */
function requestBody(how) {
  const effective = effectiveRows.value;
  const body = {
    entries: chainEntries(effective.filter((row) => row.lane === null)),
    name: null,
    ...how,
  };
  if (branched.value) {
    body.lanes = lanes.value.map((_lane, index) =>
      chainEntries(effective.filter((row) => row.lane === index)),
    );
  }
  return body;
}

/** A dry run is on its way: the next one waits for it. */
let asking = false;

/**
 * Ask the route what the edit on screen changes.
 *
 * One request at a time, and the last edit wins: a gesture made while one is
 * out marks the answer stale (`previewing` stays up, so the button waits) and
 * the answer, on landing, asks again for what is on screen by then. A held
 * strength arrow is then as many requests as the route can answer, not one
 * per step.
 */
async function preview() {
  const key = props.open ? previewKey.value : "";
  if (!key) {
    changes.value = [];
    previewError.value = "";
    previewing.value = false;
    return;
  }
  previewing.value = true;
  if (asking) return;
  asking = true;
  const token = loadToken;
  let answer = null;
  let failed = "";
  try {
    answer = await saveLoraChain(props.workflowId, JSON.parse(key));
  } catch (err) {
    console.warn(
      `[workflows] the LoRA chain dry run of ${props.workflowId} was refused`,
      err,
    );
    failed = errorMessage(
      err,
      "PixlStash could not work out what this edit changes.",
    );
  }
  asking = false;
  if (token !== loadToken || key !== previewKey.value) {
    void preview();
    return;
  }
  changes.value = Array.isArray(answer?.changes) ? answer.changes : [];
  previewError.value = failed;
  previewing.value = false;
}

async function save() {
  saving.value = true;
  saveError.value = "";
  try {
    await saveLoraChain(
      props.workflowId,
      requestBody({ dry_run: false, overwrite: true }),
    );
  } catch (err) {
    console.warn(
      `[workflows] the LoRA chain save of ${props.workflowId} was refused`,
      err,
    );
    saveError.value = errorMessage(err, "Could not save these LoRAs.");
    saving.value = false;
    return;
  }
  // The write landed. Nothing below may read as a failed save: the dialog
  // would stay open, and a second press would write the edit again.
  try {
    notices.push({
      level: "success",
      text: `Saved over “${shownName.value}”.`,
    });
    // The same card, so nothing is selected: the grid is re-read (a manual
    // workflow's models and version come off its new document) and the rail
    // is told below to read its chain again.
    await workflows.refetch();
  } catch (err) {
    console.warn(
      `[workflows] the LoRA chain of ${props.workflowId} was saved, but the grid could not be shown again`,
      err,
    );
  } finally {
    saving.value = false;
    emit("overwritten", props.workflowId);
    emit("close");
  }
}

/** The one button, and plain Enter: Apply hands the edit on, Save writes it. */
function primary() {
  if (!ready.value) return;
  if (!waits.value) {
    void save();
    return;
  }
  emit("apply", fragment.value);
  emit("close");
}

function close() {
  if (saving.value) return;
  emit("close");
}

watch(previewKey, () => void preview());

watch(
  () => [props.open, props.workflowId],
  ([isOpen]) => {
    if (isOpen) void load();
    else loadToken += 1;
  },
  { immediate: true },
);
</script>

<!-- Not scoped: the rows are EditLorasRow's markup, drawn by these rules, and
     every class here carries the dialog's own `eld-` prefix. -->
<style>
.eld-note {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.eld-quiet {
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

.eld-bad {
  color: rgb(var(--v-theme-surface-error));
}

/* The notice surface's shape: a rail down the left edge in the status hue,
   the glyph in the same hue, and the sentence left as ordinary text
   (docs/design/notice-surface.md). Warning, not error: nothing failed, the
   chain is only not editable here. */
.eld-refusal {
  display: grid;
  grid-template-columns: var(--gutter-glyph) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid rgb(var(--v-theme-border));
  border-left: var(--rail-w) solid rgb(var(--v-theme-surface-warning));
  border-radius: var(--radius-md);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.eld-refusal-glyph {
  color: rgb(var(--v-theme-surface-warning));
}

.eld-chain {
  display: flex;
  flex-direction: column;
}

/* Every step of the chain is one of these: the model source, each loader and
   what reads the result. A title bar over a body, the same width and look for
   all three, so the list reads as a graph and not as a list between two
   labels. */
.eld-node {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  font-size: var(--text-xs);
}

.eld-node-title {
  padding: var(--space-2) var(--space-3);
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  overflow-wrap: anywhere;
}

.eld-node-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  overflow-wrap: anywhere;
}

/* The wire from one node to the next: a line ending in an arrowhead on the
   node below, drawn rather than an icon because a glyph's own shaft reads as
   the line and leaves a head too small to see. The plain one is the stretch
   above the Add button, which sits on the last wire. */
.eld-wire {
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: var(--space-6);
  --eld-wire-color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

.eld-wire::before {
  content: "";
  flex: 1;
  width: var(--rail-w);
  background: var(--eld-wire-color);
}

.eld-wire::after {
  content: "";
  border-top: var(--space-3) solid var(--eld-wire-color);
  border-right: var(--space-3) solid transparent;
  border-left: var(--space-3) solid transparent;
}

.eld-wire--plain {
  height: var(--space-4);
}

.eld-wire--short {
  height: var(--space-4);
}

.eld-wire--plain::after {
  content: none;
}

.eld-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.eld-row {
  display: flex;
  flex-direction: column;
}

.eld-row--dragging {
  opacity: var(--opacity-disabled);
}

/* Where a drop would land: the selection's bar, because the target is the
   thing chosen, not an action. */
.eld-row--over > .eld-node {
  box-shadow: inset 0 var(--rail-w) 0 var(--active-bar);
}

.eld-line {
  display: grid;
  grid-template-columns: var(--gutter-glyph) var(--space-5) minmax(0, 1fr) var(--space-9) auto;
  align-items: center;
  gap: var(--space-3);
}

.eld-handle {
  display: inline-flex;
  align-items: center;
  border: 0;
  background: none;
  padding: 0;
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  cursor: grab;
}

.eld-handle:disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}

.eld-pos {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  text-align: right;
}

.eld-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-sm);
}

.eld-name > .app-select {
  flex: 1;
  min-width: 0;
}

.eld-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A deleted row stays legible as a row that was taken out. */
.eld-row--deleted .eld-name-text {
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  text-decoration: line-through;
}

.eld-tag {
  padding: 0 var(--space-2);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--radius-pill);
  font-size: var(--text-2xs);
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

.eld-flag-glyph {
  flex-shrink: 0;
  color: rgb(var(--v-theme-surface-warning));
}

.eld-flag {
  padding-left: calc(var(--gutter-glyph) + var(--space-5) + var(--space-3) * 2);
}

.eld-strength {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
}

.eld-actions {
  display: inline-flex;
  align-items: center;
}

.eld-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.eld-changes {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-5);
  font-size: var(--text-sm);
  line-height: var(--leading-body);
}

/* The note takes a line of its own above the footer's row. */
.app-dialog__footer:has(> .eld-foot-note) {
  flex-wrap: wrap;
}

.eld-foot-note {
  flex-basis: 100%;
}

.eld-count {
  margin-right: auto;
  font-size: var(--text-sm);
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

/* ── The fork drawn side by side ─────────────────────────────────────────── */

.eld-graph {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* The trunk: one narrow column in the middle, every pass's loaders once. */
.eld-trunk {
  display: flex;
  flex-direction: column;
  align-self: center;
  width: min(100%, var(--dialog-w-sm));
}

.eld-group,
.eld-lane {
  display: flex;
  flex-direction: column;
  padding: var(--space-3);
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--radius-md);
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.eld-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

/* A stem off the trunk, a bar across, and a leg with an arrowhead into each
   lane, drawn in the wire's colour so the fork reads as more wire. */
.eld-fork {
  position: relative;
  height: var(--space-6);
  --eld-wire-color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
}

.eld-fork-stem,
.eld-fork-bar,
.eld-fork-leg {
  position: absolute;
  background: var(--eld-wire-color);
}

.eld-fork-stem {
  left: 50%;
  top: 0;
  width: var(--rail-w);
  height: var(--space-3);
  transform: translateX(-50%);
}

.eld-fork-bar {
  top: var(--space-3);
  height: var(--rail-w);
}

.eld-fork-leg {
  top: var(--space-3);
  bottom: var(--space-3);
  width: var(--rail-w);
  transform: translateX(-50%);
}

.eld-fork-leg::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top: var(--space-3) solid var(--eld-wire-color);
  border-right: var(--space-3) solid transparent;
  border-left: var(--space-3) solid transparent;
}

/* One lane per sampler. Two fit the xl dialog; from three the dialog goes
   fullscreen, and past what fits the lanes scroll sideways at a floor of
   half the default dialog's width. */
.eld-lanes {
  display: grid;
  grid-template-columns: repeat(
    var(--eld-lanes),
    minmax(calc(var(--dialog-w-md) / 2), 1fr)
  );
  gap: var(--space-5);
  overflow-x: auto;
}

.eld-lane-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding: 0 var(--space-1) var(--space-3);
  border-bottom: 1px solid rgb(var(--v-theme-divider));
  font-size: var(--text-sm);
}

.eld-lane-head small {
  margin-left: auto;
  font-size: var(--text-2xs);
  color: rgba(var(--v-theme-on-surface), var(--opacity-text-secondary));
  white-space: nowrap;
}

/* A rail down each lane's left edge in an identity hue, so a lane stays
   identifiable when its header has scrolled away. Never the only cue: the
   header names the sampler. */
.eld-lane--a {
  box-shadow: inset var(--rail-w) 0 0 rgb(var(--v-theme-tertiary));
}

.eld-lane--b {
  box-shadow: inset var(--rail-w) 0 0 rgb(var(--v-theme-quaternary));
}

.eld-spacer {
  flex: 1;
}

/* Where a lifted row from another segment would land: the selection's olive
   bar, the same one a drop onto a row shows. */
.eld-drop {
  display: grid;
  place-items: center;
  min-height: var(--space-7);
  margin-top: var(--space-3);
  padding: 0 var(--space-3);
  border: 1px dashed var(--active-bar);
  border-radius: var(--radius-md);
  color: var(--active-bar);
  font-size: var(--text-xs);
  text-align: center;
}
</style>
