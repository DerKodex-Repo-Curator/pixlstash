// Copy for the outcome of "Move to library".
//
// A picture leaves this library only when the move copied it into the other
// one. The server reports every other outcome separately, and each has its own
// sentence here because each has its own lever: unlock the set, look at the
// copy that is already there, restore it there, or check the file. Pure, so the
// counts and plurals are tested.

function pictures(count) {
  return `${count} ${count === 1 ? "picture" : "pictures"}`;
}

/**
 * Describe what a move to another library did.
 *
 * @param {Object} outcome
 * @param {string} outcome.libraryName - the library the selection went to.
 * @param {number} outcome.movedCount - pictures that left this library, as the
 *   server counted them.
 * @param {number} outcome.lockedCount - kept: a locked set freezes them.
 * @param {number} outcome.copiedButLockedCount - copied there, but a new lock
 *   prevented moving the source to the Scrapheap.
 * @param {number} outcome.copiedButNotMovedCount - copied there, but source
 *   Scrapheap processing failed and the source remains live.
 * @param {number} outcome.alreadyThereCount - kept: the other library already
 *   holds the same file.
 * @param {number} outcome.inOtherScrapheapCount - kept: the other library has
 *   the same file in its Scrapheap.
 * @param {number} outcome.notCopiedCount - kept: the file could not be copied.
 * @returns {{level: "success"|"warning", body: string}|null} `null` when
 *   nothing moved and nothing was kept, so there is nothing to say.
 */
export function buildLibraryMoveMessage({
  libraryName = "the other library",
  movedCount = 0,
  lockedCount = 0,
  copiedButLockedCount = 0,
  copiedButNotMovedCount = 0,
  alreadyThereCount = 0,
  inOtherScrapheapCount = 0,
  notCopiedCount = 0,
} = {}) {
  const itThem = (count) => (count === 1 ? "it" : "them");
  const kept = [];
  if (alreadyThereCount > 0) {
    kept.push(
      `${pictures(alreadyThereCount)} stayed here because ${libraryName} ` +
        `already has ${itThem(alreadyThereCount)}.`,
    );
  }
  if (inOtherScrapheapCount > 0) {
    kept.push(
      `${pictures(inOtherScrapheapCount)} stayed here because ${libraryName} has ` +
        `${itThem(inOtherScrapheapCount)} in its Scrapheap.`,
    );
  }
  if (lockedCount > 0) {
    kept.push(
      `${pictures(lockedCount)} stayed here because a locked set holds ` +
        `${itThem(lockedCount)}; unlock the set to move ${itThem(lockedCount)}.`,
    );
  }
  if (notCopiedCount > 0) {
    kept.push(`${pictures(notCopiedCount)} could not be copied and stayed here.`);
  }
  if (copiedButLockedCount > 0) {
    kept.push(
      `${pictures(copiedButLockedCount)} ${copiedButLockedCount === 1 ? "was" : "were"} copied to ${libraryName} ` +
        `but stayed here because a set became locked during the move. ` +
        `Undo will not remove ${itThem(copiedButLockedCount)} from ${libraryName}.`,
    );
  }
  if (copiedButNotMovedCount > 0) {
    kept.push(
      `${pictures(copiedButNotMovedCount)} ${copiedButNotMovedCount === 1 ? "was" : "were"} copied to ${libraryName} ` +
        `but stayed here because moving the source to the Scrapheap failed. ` +
        `Undo will not remove ${itThem(copiedButNotMovedCount)} from ${libraryName}.`,
    );
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
