// Copy for the outcome of "Move to library".
//
// A move can leave a picture where it was for two reasons the server reports
// separately - the other library already has the file in its Scrapheap, or the
// file could not be copied - and a locked set is a third, which
// `lockedDelete.js` already words. Pure, so the counts and plurals are tested.

function pictures(count) {
  return `${count} ${count === 1 ? "picture" : "pictures"}`;
}

/**
 * Describe what a move to another library did.
 *
 * @param {Object} outcome
 * @param {string} outcome.libraryName - the library the selection went to.
 * @param {number} outcome.movedCount - pictures that left this library.
 * @param {number} outcome.inOtherScrapheapCount - kept: the other library has
 *   the same file in its Scrapheap.
 * @param {number} outcome.notCopiedCount - kept: the file could not be copied.
 * @returns {{level: "success"|"warning", body: string}|null} `null` when there
 *   is nothing to say (nothing moved and nothing kept for these two reasons).
 */
export function buildLibraryMoveMessage({
  libraryName = "the other library",
  movedCount = 0,
  inOtherScrapheapCount = 0,
  notCopiedCount = 0,
} = {}) {
  const kept = [];
  if (inOtherScrapheapCount > 0) {
    kept.push(
      `${pictures(inOtherScrapheapCount)} stayed here because ${libraryName} has ` +
        `${inOtherScrapheapCount === 1 ? "it" : "them"} in its Scrapheap.`,
    );
  }
  if (notCopiedCount > 0) {
    kept.push(`${pictures(notCopiedCount)} could not be copied and stayed here.`);
  }
  if (movedCount <= 0 && !kept.length) return null;

  const lead =
    movedCount > 0
      ? `Moved ${pictures(movedCount)} to ${libraryName}.`
      : `Nothing was moved to ${libraryName}.`;
  return {
    level: kept.length ? "warning" : "success",
    body: [lead, ...kept].join(" "),
  };
}
