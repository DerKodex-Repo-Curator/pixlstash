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
import { over, slotKey, slotOf, whole } from "./workflowChanges";

/** How many rows differ: the number the bar says before the server answers. */
export function countChanges(changes) {
  const set = whole(changes);
  return (
    set.models.length +
    set.loras.length +
    set.skip_loras.length +
    Object.keys(set.stages).length +
    set.values.length
  );
}

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
  const set = whole(changes);
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
  const set = whole(changes);
  delete set.stages[name];
  if (Boolean(on) !== Boolean(saved)) set.stages[name] = Boolean(on);
  return set;
}

/** Whether a loader waits to be removed. */
export function loraRemoved(changes, slot) {
  return (changes?.skip_loras ?? []).some(
    (entry) => slotKey(entry) === slotKey(slot),
  );
}

/** The strength waiting on a loader, or null when it is as saved. */
export function loraStrength(changes, slot) {
  const entry = (changes?.loras ?? []).find(
    (item) => slotKey(item) === slotKey(slot),
  );
  return entry ? (entry.strength_model ?? null) : null;
}

/**
 * Remove a loader, or put it back. A removed loader's waiting strength goes
 * with it: the server takes a slot as set or removed, never both.
 */
export function withLoraRemoved(changes, slot, removed) {
  const set = whole(changes);
  set.skip_loras = set.skip_loras.filter(
    (entry) => slotKey(entry) !== slotKey(slot),
  );
  if (removed) {
    set.loras = set.loras.filter((entry) => slotKey(entry) !== slotKey(slot));
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
 * set them apart. A loader that waited to be removed is put back by a strength
 * of its own: a slot is set or removed, never both.
 *
 * @param {Object} changes
 * @param {{node_id: string, field: string, sha256: string}} slot - the
 *   loader and the shelf LoRA it loads: an entry names both.
 * @param {number} strength
 * @param {{strength: ?number, strength_clip: ?number}} saved
 */
export function withLoraStrength(changes, slot, strength, saved = {}) {
  const set = whole(changes);
  set.loras = set.loras.filter((entry) => slotKey(entry) !== slotKey(slot));
  if (!slot.sha256 || !Number.isFinite(strength)) return set;
  if (strength === saved.strength) return set;
  const tied =
    saved.strength_clip == null || saved.strength_clip === saved.strength;
  set.skip_loras = set.skip_loras.filter(
    (entry) => slotKey(entry) !== slotKey(slot),
  );
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
 * over another: the rule is `over`'s, written once (`workflowChanges.js`).
 *
 * Only the fragment's slots are respelled first, as every edit here spells
 * one (`slotOf`): the rows find their entry by a string node id and the field
 * named outright, and `over` stores an entry as it was given.
 */
export function withFragment(changes, fragment) {
  const top = whole(fragment);
  return over(changes, {
    ...top,
    loras: top.loras.map((entry) => ({ ...entry, ...slotOf(entry) })),
    skip_loras: top.skip_loras.map(slotOf),
  });
}

/**
 * `changes` less every LoRA entry whose loader is not among `slots`: what is
 * left of a waiting set once a chain edit has taken loaders out of the graph.
 */
export function withoutGoneLoaders(changes, slots) {
  const set = whole(changes);
  const live = (entry) => slots.some((slot) => slotKey(slot) === slotKey(entry));
  set.loras = set.loras.filter(live);
  set.skip_loras = set.skip_loras.filter(live);
  return set;
}
