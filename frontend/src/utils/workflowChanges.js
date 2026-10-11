// workflowChanges.js - a set of changes to a workflow, in the client (#1850).
//
// One shape everywhere, the server's `WorkflowChanges`
// (`pixlstash/routes/workflows.py`): `{models, loras, skip_loras, stages,
// values}`, the words a run body already uses. The Run popup builds one from
// its form, says it in a sentence, runs with it and offers to save it; the
// Tasks tab says the one the last run was made with in the same sentence.
// The pure parts are here so the two cannot drift.

import { errorMessage } from "./apiError";
import { STAGE_LABELS } from "./runReasons";

/** A set with nothing in it. */
export function noChanges() {
  return { models: [], loras: [], skip_loras: [], stages: {}, values: [] };
}

/**
 * *changes* with every list present and nothing else, so a reader never
 * guards a field. A copy, lists and stages both: the row edits
 * (`workflowEdits.js`) write on what this answers.
 *
 * @param {?Object} changes - a set, or what a read answered (null when
 *   nothing waits).
 * @returns {{models: Array, loras: Array, skip_loras: Array, stages: Object, values: Array}}
 */
export function whole(changes) {
  return {
    models: [...(changes?.models ?? [])],
    loras: [...(changes?.loras ?? [])],
    skip_loras: [...(changes?.skip_loras ?? [])],
    stages: { ...(changes?.stages ?? {}) },
    values: [...(changes?.values ?? [])],
  };
}

/** A LoRA slot as the server addresses it: a node and a field, as strings. */
export const slotOf = (slot) => ({
  node_id: String(slot.node_id),
  field: slot.field || "lora_name",
});

/** One string per slot: two entries name the same loader when theirs match. */
export const slotKey = (item) => `${item.node_id}\n${item.field || "lora_name"}`;
const valueKey = (item) => `${item.slot_label}\n${item.input_name}`;

/**
 * *base* with *top* on it: *top* wins thing by thing.
 *
 * The client's reading of `WorkflowChanges.over`, kept to the same rule so a
 * run sent from here and a save the server builds agree: a slot *top* removes
 * is no longer set, and one it sets is no longer removed.
 */
export function over(base, top) {
  const under = whole(base);
  const upper = whole(top);
  const models = new Map(under.models.map((model) => [model.address, model]));
  for (const model of upper.models) models.set(model.address, model);
  const values = new Map(under.values.map((value) => [valueKey(value), value]));
  for (const value of upper.values) values.set(valueKey(value), value);
  const set = new Map(under.loras.map((item) => [slotKey(item), item]));
  const gone = new Map(under.skip_loras.map((item) => [slotKey(item), item]));
  for (const item of upper.loras) {
    gone.delete(slotKey(item));
    set.set(slotKey(item), item);
  }
  for (const item of upper.skip_loras) {
    set.delete(slotKey(item));
    gone.set(slotKey(item), item);
  }
  return {
    models: [...models.values()],
    loras: [...set.values()],
    skip_loras: [...gone.values()],
    stages: { ...under.stages, ...upper.stages },
    values: [...values.values()],
  };
}

/**
 * What a form says a thing is NOW, for {@link answering}: each reader answers
 * `undefined` for a thing the form has no control for.
 *
 * @typedef {Object} FormAnswers
 * @property {(address: string) => (string|undefined)} model - the file at a loader address.
 * @property {(nodeId: string, field: string) => ({sha256: string, strength_model: ?number, strength_clip?: number}|null|undefined)} lora
 *   - the loader's LoRA; `null` when the form has the loader removed.
 * @property {(name: string) => (boolean|undefined)} stage
 * @property {(slotLabel: string, inputName: string) => *} value
 */

/**
 * *own* as a save has to send it when *waiting* is on the workflow too.
 *
 * The server saves what waits with the request's changes on top. A waiting
 * change the owner UNDID in the form is absent from *own*, so the waiting one
 * would be saved all the same. So for everything *waiting* names and *own*
 * does not, the form's present answer is stated outright: the file at that
 * loader, the loader's own LoRA and strength where it had been removed, the
 * stage's on or off, the parameter's value. A thing the form has no control
 * for is left to what waits.
 *
 * A removal is never added here: `skip_loras` is *own*'s, as sent. That is
 * enough because of what the caller guarantees: `form.lora` answers `null`
 * only for a loader *own* removes (the Run popup, the one caller, builds both
 * from the same removed rows). The removal in *own* is then what puts down a
 * LoRA that waits on that loader. A caller whose form removed a loader *own*
 * did not name would save the waiting LoRA on it.
 *
 * @param {Object} own - what the form changes, a `WorkflowChanges`.
 * @param {Object} waiting - what waits on the workflow, or null.
 * @param {FormAnswers} form
 */
export function answering(own, waiting, form) {
  const mine = whole(own);
  const theirs = whole(waiting);
  const models = [...mine.models];
  const loras = [...mine.loras];
  const values = [...mine.values];
  const stages = { ...mine.stages };
  const picked = new Set(mine.models.map((model) => model.address));
  for (const model of theirs.models) {
    const filename = form.model(model.address);
    if (picked.has(model.address) || filename === undefined) continue;
    picked.add(model.address);
    models.push({ address: model.address, filename });
  }
  const said = new Set([...mine.loras, ...mine.skip_loras].map(slotKey));
  for (const item of [...theirs.loras, ...theirs.skip_loras]) {
    const field = item.field || "lora_name";
    const now = form.lora(item.node_id, field);
    // No digest to name it by: the loader cannot be stated, so what waits
    // stands for it.
    if (said.has(slotKey(item)) || !now?.sha256) continue;
    said.add(slotKey(item));
    loras.push({ node_id: item.node_id, field, ...now });
  }
  for (const [name] of Object.entries(theirs.stages)) {
    const on = form.stage(name);
    if (name in stages || on === undefined) continue;
    stages[name] = on;
  }
  const typed = new Set(mine.values.map(valueKey));
  for (const value of theirs.values) {
    const now = form.value(value.slot_label, value.input_name);
    if (typed.has(valueKey(value)) || now === undefined) continue;
    typed.add(valueKey(value));
    values.push({
      slot_label: value.slot_label,
      input_name: value.input_name,
      value: now,
    });
  }
  return { models, loras, skip_loras: [...mine.skip_loras], stages, values };
}

/** A loader's widget, as the last part of its address. */
function widgetOf(address) {
  return String(address || "").split("/").pop();
}

/**
 * What a model loader is called from its address alone, by its widget: the
 * rule `model_fix_kind` reads a loader by (`services/workflow_identity.py`).
 *
 * @returns {{one: string, many: string}}
 */
export function modelWord(address) {
  const widget = widgetOf(address);
  if (["ckpt_name", "unet_name", "diffusion_model"].includes(widget)) {
    return { one: "Checkpoint", many: "checkpoints" };
  }
  if (widget === "vae_name") return { one: "VAE", many: "VAEs" };
  if (widget.startsWith("clip_name")) {
    return { one: "Text encoder", many: "text encoders" };
  }
  return { one: "Model", many: "models" };
}

/** The two inputs that are one Size where a node has both. */
export const SIZE_INPUTS = ["width", "height"];

/**
 * A set of changes in words: how many, and which.
 *
 * `Checkpoint, 1 LoRA removed, Steps.` In one fixed order (models, LoRAs,
 * stages, parameters: the order the issue lists what a save writes), so the
 * Run popup's band and the Tasks tab say one set the same way. What is
 * naturally plural is counted, not listed: two loaders of ONE file are one
 * model, width and height of one node are one Size.
 *
 * @param {Object} changes - a `WorkflowChanges`.
 * @param {{value?: (slotLabel: string, inputName: string) => (string|undefined)}} [labels]
 *   the form's own word for a parameter; its widget name stands in.
 * @returns {{count: number, text: string}} `text` is "" for an empty set.
 */
export function describeChanges(changes, labels = {}) {
  const set = whole(changes);
  const parts = [];
  let count = 0;
  const said = (words, n = 1) => {
    parts.push(words);
    count += n;
  };

  const models = new Map();
  for (const model of set.models) {
    const word = modelWord(model.address);
    const files = models.get(word.one) || { word, files: new Set() };
    files.files.add(String(model.filename || model.sha256 || "").toLowerCase());
    models.set(word.one, files);
  }
  for (const { word, files } of models.values()) {
    said(files.size === 1 ? word.one : `${files.size} ${word.many}`, files.size);
  }

  const plural = (n) => (n === 1 ? "1 LoRA" : `${n} LoRAs`);
  if (set.loras.length) {
    said(`${plural(set.loras.length)} changed`, set.loras.length);
  }
  if (set.skip_loras.length) {
    said(`${plural(set.skip_loras.length)} removed`, set.skip_loras.length);
  }

  for (const [name, on] of Object.entries(set.stages)) {
    said(`${STAGE_LABELS[name] || name} ${on ? "on" : "off"}`);
  }

  // Width and height of one node are the form's one Size.
  const sized = new Set();
  for (const value of set.values) {
    if (!SIZE_INPUTS.includes(value.input_name)) continue;
    const both = set.values.filter(
      (other) =>
        other.slot_label === value.slot_label &&
        SIZE_INPUTS.includes(other.input_name),
    );
    if (both.length === 2) sized.add(value.slot_label);
  }
  const sizeSaid = new Set();
  for (const value of set.values) {
    if (SIZE_INPUTS.includes(value.input_name) && sized.has(value.slot_label)) {
      if (!sizeSaid.has(value.slot_label)) said("Size");
      sizeSaid.add(value.slot_label);
      continue;
    }
    said(labels.value?.(value.slot_label, value.input_name) || value.input_name);
  }

  return { count, text: parts.length ? `${parts.join(", ")}.` : "" };
}

/** `3 changes`, `1 change`. */
export function changesWord(count) {
  return count === 1 ? "1 change" : `${count} changes`;
}

/**
 * What a new workflow saved from *name* is offered to be called: the model it
 * now loads in brackets where one was picked, else a number. Never a word
 * that says where it came from.
 *
 * @param {string} name - the workflow saved from.
 * @param {string} [model] - the picked base model, as a person reads it.
 */
export function suggestedName(name, model = "") {
  const base = String(name || "").trim() || "Workflow";
  return model ? `${base} (${model})` : `${base} 2`;
}

/**
 * The sentence for a save that was refused or did not land. A 409 is the
 * server's own reason and is printed as sent; a 503 is ComfyUI not answering
 * when a LoRA loader has to be rewired.
 */
export function saveFailure(err) {
  if (err?.response?.status === 503) {
    return "ComfyUI did not answer, so nothing was saved. Start ComfyUI and save again.";
  }
  return errorMessage(err, "Could not save the workflow.");
}
