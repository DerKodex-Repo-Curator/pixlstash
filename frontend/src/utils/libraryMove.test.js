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
});
