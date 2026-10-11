import { describe, it, expect } from "vitest";
import { buildLibraryMoveMessage } from "./libraryMove.js";

describe("buildLibraryMoveMessage", () => {
  it("names the library and counts what left", () => {
    expect(
      buildLibraryMoveMessage({ libraryName: "Archive", movedCount: 3 }),
    ).toEqual({ level: "success", body: "Moved 3 pictures to Archive." });
    expect(
      buildLibraryMoveMessage({ libraryName: "Archive", movedCount: 1 }).body,
    ).toBe("Moved 1 picture to Archive.");
  });

  it("warns, and says why, when some stayed", () => {
    expect(
      buildLibraryMoveMessage({
        libraryName: "Archive",
        movedCount: 2,
        inOtherScrapheapCount: 1,
        notCopiedCount: 2,
      }),
    ).toEqual({
      level: "warning",
      body:
        "Moved 2 pictures to Archive. 1 picture stayed here because Archive " +
        "has it in its Scrapheap. 2 pictures could not be copied and stayed here.",
    });
  });

  it("does not claim a move that did not happen", () => {
    expect(
      buildLibraryMoveMessage({ libraryName: "Archive", notCopiedCount: 1 }),
    ).toEqual({
      level: "warning",
      body:
        "Nothing was moved to Archive. 1 picture could not be copied and stayed here.",
    });
  });

  it("says what the other library already had, and what a lock kept", () => {
    expect(
      buildLibraryMoveMessage({
        libraryName: "Archive",
        alreadyThereCount: 2,
        lockedCount: 1,
      }),
    ).toEqual({
      level: "warning",
      body:
        "Nothing was moved to Archive. 2 pictures stayed here because Archive " +
        "already has them. 1 picture stayed here because a locked set holds " +
        "it; unlock the set to move it.",
    });
  });

  it("has nothing to say when nothing moved and nothing was kept", () => {
    expect(buildLibraryMoveMessage({ libraryName: "Archive" })).toBeNull();
  });

  it("warns that a picture locked during the move now exists in both libraries", () => {
    expect(
      buildLibraryMoveMessage({ libraryName: "Archive", copiedButLockedCount: 1 }),
    ).toEqual({
      level: "warning",
      body:
        "Nothing was moved to Archive. 1 picture was copied to Archive " +
        "but stayed here because a set became locked during the move. " +
        "Undo will not remove it from Archive.",
    });
  });

  it("reports a committed copy separately when source Scrapheap processing failed", () => {
    expect(
      buildLibraryMoveMessage({ libraryName: "Archive", copiedButNotMovedCount: 2 }),
    ).toEqual({
      level: "warning",
      body:
        "Nothing was moved to Archive. 2 pictures were copied to Archive " +
        "but stayed here because moving the source to the Scrapheap failed. " +
        "Undo will not remove them from Archive.",
    });
  });

  it.each([
    [1, "1 picture was", "it"],
    [2, "2 pictures were", "them"],
  ])(
    "warns when %i copied source outcomes could not be verified",
    (count, copies, pronoun) => {
      expect(
        buildLibraryMoveMessage({
          libraryName: "Archive",
          copiedSourceUnknownCount: count,
        }),
      ).toEqual({
        level: "warning",
        body:
          `The move to Archive could not be fully verified. ${copies} copied to Archive, ` +
          `but whether ${pronoun} left this library could not be verified. ` +
          `Refresh the source library to check. Undo will not remove ${pronoun} from Archive.`,
      });
    },
  );

  it("keeps confirmed moves distinct from unverified copied source outcomes", () => {
    expect(
      buildLibraryMoveMessage({
        libraryName: "Archive",
        movedCount: 3,
        copiedSourceUnknownCount: 1,
      }),
    ).toEqual({
      level: "warning",
      body:
        "Moved 3 pictures to Archive. 1 picture was copied to Archive, " +
        "but whether it left this library could not be verified. " +
        "Refresh the source library to check. Undo will not remove it from Archive.",
    });
  });
});
