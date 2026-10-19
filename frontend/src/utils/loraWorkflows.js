// loraWorkflows.js - which workflows can make pictures with a given LoRA.
//
// "Create with LoRA…" (a person's or a picture set's menu) opens the Run popup
// with the workflow picker narrowed to what this answers. It is worked out in
// the client from reads the app already makes: the workflow cards, the LoRA's
// shelf row and the hand-made workflow sets. See frontend_architecture.md,
// `RunDialog.vue`, "Create with LoRA".
//
// The same rule read the other way (`fitPeople`) says which people a workflow
// run by itself can be of: the Run popup's person picker.

import { checkpointModel } from "./workflowCard";

/**
 * The card types Create with LoRA offers: a picture or a video made from a
 * prompt. Anything else (img2img, inpaint, upscale…) needs a picture put in,
 * which a run started from a person or a set has none of; a card with no type
 * is one nobody has read, and is offered. `video` covers a start-frame graph
 * too (the type cannot tell them apart): its picture input then runs on the
 * frame the graph names, shown "As the workflow has it" in the Pictures
 * section where the owner can change it, or is refused as unfilled when that
 * file is gone (#1695).
 */
const OFFERED_TYPES = new Set(["txt2img", "video"]);

/**
 * A model name as three sources spell it, folded to one comparable key:
 * no folders, no extension, lowercase. A card's `recipe_values` name and a
 * shelf row's `filename` then compare equal for one file.
 */
export function nameKey(value) {
  if (!value) return "";
  const base = String(value).split(/[\\/]/).pop();
  return base
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "")
    .toLowerCase();
}

/**
 * The digests of every checkpoint a hand-made workflow set puts beside one of
 * *sha256s*.
 *
 * @param {Array<Object>} handMade - `fetchWorkflowSets().hand_made`.
 * @param {Array<string>} sha256s - the LoRAs' digests.
 * @returns {Set<string>}
 */
export function pairedCheckpoints(handMade, sha256s) {
  const paired = new Set();
  const wanted = new Set((sha256s || []).filter(Boolean));
  if (!wanted.size) return paired;
  for (const set of handMade || []) {
    const members = set.members || [];
    if (!members.some((m) => m.slot === "lora" && wanted.has(m.sha256)))
      continue;
    for (const member of members) {
      if (member.slot === "checkpoint" && member.sha256)
        paired.add(member.sha256);
    }
  }
  return paired;
}

/**
 * How one workflow card fits the LoRAs a person or a set has attached.
 *
 * `fit` is one of:
 *   - `match`         - the checkpoint's base-model family is one LoRA's.
 *   - `unknown`       - no LoRA matches and, for one of them, a side has no
 *                       known family, so nothing says either way; offered
 *                       after the matches, never hidden.
 *   - `clash`         - every family is known and none is the checkpoint's.
 *   - `needs_picture` - the workflow makes a picture FROM a picture.
 *
 * Every LoRA counts, not only the first: a person with a Z-Image LoRA and a
 * Krea 2 LoRA is offered both base models' workflows, and `loras` names the
 * ones that match, for the run to load the right one.
 *
 * Both sides read `base_model_family`, the shelf's identified base model with
 * filename guesses included: a LoRA the shelf shows as Krea 2 narrows to Krea 2
 * workflows even when nothing in the file stated it. Whether the graph has a
 * LoRA loader does not matter: the run adds the LoRA in a loader of its own
 * (`add_loras`).
 *
 * `paired` is a hand-made workflow set naming one of the LoRAs and this
 * checkpoint; `usedBefore` is one of them among the ones this workflow's kept
 * pictures used.
 *
 * @param {Object} card - a `GET /workflows` card.
 * @param {Array<Object>} loras - shelf rows (`listAdapters`).
 * @param {Set<string>} paired - `pairedCheckpoints(...)` for these LoRAs.
 */
export function workflowFit(card, loras, paired = new Set()) {
  const checkpoint = checkpointModel(card);
  const usedKeys = new Set(
    (card.recipe_values?.loras || []).map((value) => nameKey(value.name)),
  );
  const fits = loras.map((lora) => familyFit(checkpoint, lora));
  const base = {
    card,
    checkpoint,
    loras: loras.filter((_, index) => fits[index] === "match"),
    paired: Boolean(checkpoint?.sha256 && paired.has(checkpoint.sha256)),
    usedBefore: loras.some(
      (lora) => lora?.filename && usedKeys.has(nameKey(lora.filename)),
    ),
  };
  if (card.type && !OFFERED_TYPES.has(card.type)) {
    return { ...base, fit: "needs_picture" };
  }
  // No LoRA at all says nothing either way, as one with no family does.
  const fit = fits.includes("match")
    ? "match"
    : fits.includes("clash") && !fits.includes("unknown")
      ? "clash"
      : "unknown";
  return { ...base, fit };
}

/** `match`, `unknown` or `clash`: one checkpoint and one LoRA, by base-model family. */
function familyFit(checkpoint, lora) {
  const loraFamily = lora?.base_model_family || null;
  const cardFamily = checkpoint?.base_model_family || null;
  if (!loraFamily || !cardFamily) return "unknown";
  return loraFamily === cardFamily ? "match" : "clash";
}

/**
 * The people a run of *card* can be of: each person with a LoRA attached that
 * is for the base model of the card's checkpoint.
 *
 * The other way round from {@link fitWorkflows}, and stricter: only a `match`
 * is offered. A person is shown because their LoRA works with this
 * checkpoint, so one nothing vouches for (the LoRA's base model, or the
 * workflow's, was never identified) is counted in `unknown` and one whose
 * every LoRA is for another base model in `clash`. A workflow that starts
 * from a picture still takes a person, so the card's type is not asked.
 *
 * @param {Object|null} card - a `GET /workflows` card.
 * @param {Array<Object>} loras - shelf rows (`listAdapters`), with `attachments`.
 * @param {Array<Object>} characters - `[{id, name}]`.
 * @returns {{people: Array<{id: number, name: string, loras: Array<Object>}>,
 *   clash: number, unknown: number, family: string|null,
 *   baseModel: string|null}} each person's matching LoRAs, in the shelf's
 *   order, and the checkpoint's own family and base-model label.
 */
export function fitPeople(card, loras, characters) {
  const checkpoint = card ? checkpointModel(card) : null;
  const attached = new Map();
  for (const lora of loras || []) {
    for (const attachment of lora?.attachments || []) {
      if (attachment.entity_type !== "character" || !lora.sha256) continue;
      const id = Number(attachment.entity_id);
      attached.set(id, [...(attached.get(id) || []), lora]);
    }
  }
  const people = [];
  let clash = 0;
  let unknown = 0;
  for (const person of characters || []) {
    const own = attached.get(Number(person.id));
    if (!own) continue;
    const fits = own.map((lora) => familyFit(checkpoint, lora));
    const matching = own.filter((_, index) => fits[index] === "match");
    if (matching.length) {
      people.push({ id: Number(person.id), name: person.name, loras: matching });
    } else if (fits.includes("unknown")) {
      unknown += 1;
    } else {
      clash += 1;
    }
  }
  return {
    people,
    clash,
    unknown,
    family: checkpoint?.base_model_family || null,
    baseModel: checkpoint?.base_model_folded || checkpoint?.base_model || null,
  };
}

/**
 * Every card, fitted against *loras* (see {@link workflowFit}): the matches
 * and the unknowns each ranked by a hand-made pairing first, then prior use,
 * then the server's order.
 *
 * @param {Array<Object>} cards - `GET /workflows` cards.
 * @param {Array<Object>} loras - shelf rows; empty narrows nothing.
 * @param {Array<Object>} handMade - `fetchWorkflowSets().hand_made`.
 * @returns {{match: Array<Object>, unknown: Array<Object>, clash: Array<Object>,
 *   needsPicture: Array<Object>}}
 */
export function fitWorkflows(cards, loras, handMade) {
  const own = (loras || []).filter(Boolean);
  const paired = pairedCheckpoints(
    handMade,
    own.map((lora) => lora.sha256),
  );
  const fits = (cards || []).map((card) => workflowFit(card, own, paired));
  const score = (entry) => (entry.paired ? 2 : 0) + (entry.usedBefore ? 1 : 0);
  // `sort` is stable, so ties keep the server's order.
  const ranked = (fit) =>
    fits
      .filter((entry) => entry.fit === fit)
      .sort((a, b) => score(b) - score(a));
  return {
    match: ranked("match"),
    unknown: ranked("unknown"),
    clash: fits.filter((entry) => entry.fit === "clash"),
    needsPicture: fits.filter((entry) => entry.fit === "needs_picture"),
  };
}
