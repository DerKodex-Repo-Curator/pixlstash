// triggerWords.js - a LoRA's trigger word, and where a prompt names it.
//
// The Run popup suggests the trigger word of the person's LoRA while the
// prompt lacks it, and `AppTextarea` marks it once it is typed.

/**
 * The trigger word a shelf row asks for, or "" when it needs none.
 *
 * The FIRST word, as the shelf's chip shows it (`triggerChip`): a file trained
 * on tagged captions records its whole tag table, most frequent first, and
 * the rest of that table is not something a prompt has to carry.
 *
 * @param {Object} row - a model row from the API.
 */
export function triggerWord(row) {
  const words = Array.isArray(row?.trigger_words) ? row.trigger_words : [];
  return String(words[0] ?? "").trim();
}

/**
 * *text* cut where it names one of *words*: `[{text, hit}]`, in order.
 *
 * Whole words only, any case and any spacing inside a phrase, so "mira" is
 * found in "Mira, smiling" and not in "admiral".
 *
 * @param {string} text
 * @param {string[]} words
 */
export function markWords(text, words) {
  const source = String(text ?? "");
  const wanted = (words || []).map((word) => String(word).trim()).filter(Boolean);
  if (!wanted.length) return [{ text: source, hit: false }];
  const escaped = wanted
    // Longest first, so a phrase wins over a word it starts with.
    .sort((a, b) => b.length - a.length)
    .map((word) =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        // A phrase is found however its words are spaced or wrapped.
        .replace(/\s+/g, "\\s+"),
    );
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${escaped.join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) {
      parts.push({ text: source.slice(last, match.index), hit: false });
    }
    parts.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < source.length || !parts.length) {
    parts.push({ text: source.slice(last), hit: false });
  }
  return parts;
}

/** Whether *text* names *word*, by the rule {@link markWords} marks with. */
export function namesWord(text, word) {
  return markWords(text, [word]).some((part) => part.hit);
}

/**
 * *text* with *words* put where the caret was, `{text, caret}`: the selection
 * `start`..`end` is replaced, and `caret` lands just after the words.
 *
 * At the start of the prompt (or with no caret, `start` 0) the words go first
 * as a comma list, where a trigger word goes. Anywhere else they join the
 * sentence with a space on each side the text does not already give them; a
 * bare caret inside a word moves to that word's end rather than split it.
 *
 * @param {string} text
 * @param {string[]} words
 * @param {number} [start]
 * @param {number} [end]
 */
export function insertWords(text, words, start = 0, end = start) {
  const source = String(text ?? "");
  const insert = words.join(", ");
  if (start === end) {
    const word = /[\p{L}\p{N}_]/u;
    while (start > 0 && start < source.length && word.test(source[start - 1]) && word.test(source[start])) {
      start += 1;
    }
    end = start;
  }
  const before = source.slice(0, start);
  const after = source.slice(end);
  if (!before.trim()) {
    const rest = after.trim();
    return { text: rest ? `${insert}, ${rest}` : insert, caret: insert.length };
  }
  const lead = /\s$/.test(before) ? "" : " ";
  const trail = !after || /^[\s,.;:!?)]/.test(after) ? "" : " ";
  const head = before + lead + insert;
  return { text: head + trail + after, caret: head.length };
}
