import { describe, it, expect } from "vitest";

import { splitFolderPath } from "./folderPath";

describe("splitFolderPath", () => {
  it("says a home directory as one word and keeps the last segment whole", () => {
    expect(splitFolderPath("/home/me/.cache/huggingface/hub")).toEqual({
      home: true,
      head: "/.cache/huggingface",
      tail: "/hub",
    });
    expect(splitFolderPath("/Users/me/models")).toEqual({
      home: true,
      head: "",
      tail: "/models",
    });
    expect(splitFolderPath("C:\\Users\\me\\loras\\sdxl")).toEqual({
      home: true,
      head: "\\loras",
      tail: "\\sdxl",
    });
  });

  it("leaves a path outside any home directory alone", () => {
    expect(splitFolderPath("/mnt/archive/loras")).toEqual({
      home: false,
      head: "/mnt/archive",
      tail: "/loras",
    });
    // A sibling whose name merely starts like a home is not one.
    expect(splitFolderPath("/homes/x").home).toBe(false);
  });
});
