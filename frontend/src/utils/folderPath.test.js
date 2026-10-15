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
    // A sibling whose name merely starts like a home is not one, and nor are
    // the shared folders that sit beside the homes.
    expect(splitFolderPath("/homes/x").home).toBe(false);
    expect(splitFolderPath("/Users/Shared/models").home).toBe(false);
    expect(splitFolderPath("C:\\Users\\Public\\models").home).toBe(false);
  });

  it("keeps a home directory itself as a path, not a bare word", () => {
    expect(splitFolderPath("/home/me")).toEqual({
      home: false,
      head: "/home",
      tail: "/me",
    });
  });

  it("reads a Windows home written with forward slashes", () => {
    expect(splitFolderPath("C:/Users/me/loras").home).toBe(true);
  });
});
