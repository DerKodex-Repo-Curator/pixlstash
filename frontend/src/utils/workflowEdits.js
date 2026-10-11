// The Workflow tab's unsaved changes, built one row at a time (#1850).
//
// A set of changes is the server's `WorkflowChanges`: `{models: [{address,
// filename}], loras: [{node_id, field, sha256, strength_model,
// strength_clip}], skip_loras: [{node_id, field}], stages: {name: bool},
// values: [...]}`. The tab stores the whole set on the server after every
// edit, so each function here takes a set and answers the next one, never
// changing the one it was given.
//
// **A row put back to its saved value leaves the set.** The bar counts the
// entries, so a no-op kept in the set would be "1 unsaved change" beside rows
// that all read as saved.

import { loraBase } from "./loraChain";

/**
 * A set with every list present, from what a read answered (`waiting`, null
 * when nothing waits). Parameters (`values`) are never edited here and are
 * carried through as they came.
 *
 * @param {?Object} waiting
 * @returns {{models: Array, loras: Array, skip_loras: Array, stages: Object, values: Array}}
 */
export function changesOf(waiting) {
  return {
    models: [...(waiting?.models ?? [])],
    loras: [...(waiting?.loras ?? [])],
    skip_loras: [...(waiting?.skip_loras ?? [])],
    stages: { ...(waiting?.stages ?? {}) },
    values: [...(waiting?.values ?? [])],
  };
}

/** How many rows differ: the number the bar says before the server answers. */
export function countChanges(changes) {
  const set = changesOf(changes);
  return (
    set.models.length +
    set.loras.length +
    set.skip_loras.length +
    Object.keys(set.stages).length +
    set.values.length
  );
}

const sameSlot = (a, b) =>
  String(a.node_id) === String(b.node_id) && a.field === b.field;

/** A LoRA slot as the server addresses it: a node and a field, as strings. */
const slotOf = (slot) => ({
  node_id: String(slot.node_id),
  field: slot.field || "lora_name",
});

/** The file picked for a loader address, or null when the row is as saved. */
export function modelPick(changes, address) {
  return (
    (changes?.models ?? []).find((model) => model.address === address)
      ?.filename ?? null
  );
}

/**
 * Pick `filename` for the loader at `address`; the file it already loads
 * (`saved`, whatever its folders) or nothing puts the row back.
 */
export function withModel(changes, address, filename, saved) {
  const set = changesOf(changes);
  set.models = set.models.filter((model) => model.address !== address);
  if (filename && loraBase(filename) !== loraBase(saved ?? "")) {
    set.models.push({ address, filename });
  }
  return set;
}

/** Whether a stage runs: the waiting answer, else the saved one. */
export function stageOn(changes, name, saved) {
  const waiting = changes?.stages?.[name];
  return typeof waiting === "boolean" ? waiting : Boolean(saved);
}

/** Switch a stage; back to `saved` leaves the set. */
export function withStage(changes, name, on, saved) {
  const set = changesOf(changes);
  delete set.stages[name];
  if (Boolean(on) !== Boolean(saved)) set.stages[name] = Boolean(on);
  return set;
}

/** Whether a loader waits to be removed. */
export function loraRemoved(changes, slot) {
  return (changes?.skip_loras ?? []).some((entry) => sameSlot(entry, slot));
}

/** The strength waiting on a loader, or null when it is as saved. */
export function loraStrength(changes, slot) {
  const entry = (changes?.loras ?? []).find((item) => sameSlot(item, slot));
  return entry ? (entry.strength_model ?? null) : null;
}

/**
 * Remove a loader, or put it back. A removed loader's waiting strength goes
 * with it: the server takes a slot as set or removed, never both.
 */
export function withLoraRemoved(changes, slot, removed) {
  const set = changesOf(changes);
  set.skip_loras = set.skip_loras.filter((entry) => !sameSlot(entry, slot));
  if (removed) {
    set.loras = set.loras.filter((entry) => !sameSlot(entry, slot));
    set.skip_loras.push(slotOf(slot));
  }
  return set;
}

/**
 * Set a loader's default strength; the saved strength leaves the set.
 *
 * `saved` is `{strength, strength_clip}` as the row reads them. The clip
 * strength follows the model strength where the two were one number (or the
 * loader has no clip strength of its own), and is left alone where the graph
 * set them apart.
 *
 * @param {Object} changes
 * @param {{node_id: string, field: string, sha256: string}} slot - the
 *   loader and the shelf LoRA it loads: an entry names both.
 * @param {number} strength
 * @param {{strength: ?number, strength_clip: ?number}} saved
 */
export function withLoraStrength(changes, slot, strength, saved = {}) {
  const set = changesOf(changes);
  set.loras = set.loras.filter((entry) => !sameSlot(entry, slot));
  if (!slot.sha256 || !Number.isFinite(strength)) return set;
  if (strength === saved.strength) return set;
  const tied =
    saved.strength_clip == null || saved.strength_clip === saved.strength;
  set.loras.push({
    ...slotOf(slot),
    sha256: slot.sha256,
    strength_model: strength,
    strength_clip: tied ? strength : saved.strength_clip,
  });
  return set;
}

/**
 * `fragment` laid over `changes`, thing by thing, as the server lays one set
 * over another (`WorkflowChanges.over`): a slot the fragment removes is no
 * longer set, and one it sets is no longer removed.
 */
export function withFragment(changes, fragment) {
  let set = changesOf(changes);
  for (const model of fragment?.models ?? []) {
    set.models = set.models.filter((entry) => entry.address !== model.address);
    set.models.push({ address: model.address, filename: model.filename });
  }
  for (const entry of fragment?.loras ?? []) {
    set.skip_loras = set.skip_loras.filter((item) => !sameSlot(item, entry));
    set.loras = set.loras.filter((item) => !sameSlot(item, entry));
    set.loras.push({ ...entry, ...slotOf(entry) });
  }
  for (const entry of fragment?.skip_loras ?? []) {
    set = withLoraRemoved(set, entry, true);
  }
  Object.assign(set.stages, fragment?.stages ?? {});
  return set;
}

/**
 * `changes` less every LoRA entry whose loader is not among `slots`: what is
 * left of a waiting set once a chain edit has taken loaders out of the graph.
 */
export function withoutGoneLoaders(changes, slots) {
  const set = changesOf(changes);
  const live = (entry) => slots.some((slot) => sameSlot(slot, entry));
  set.loras = set.loras.filter(live);
  set.skip_loras = set.skip_loras.filter(live);
  return set;
}
