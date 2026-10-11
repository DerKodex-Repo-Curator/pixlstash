import { describe, expect, it } from "vitest";

import { runTaskLabel } from "./runTaskLabel";

describe("runTaskLabel", () => {
  it("names a clone ahead of the recipe and the workflow", () => {
    expect(
      runTaskLabel({ clone: true, recipe: "Soft light", workflow: "Flux" }),
    ).toBe("Clone picture");
  });

  it("names the saved recipe ahead of the workflow", () => {
    expect(runTaskLabel({ recipe: "Soft light", workflow: "Flux" })).toBe(
      "Soft light",
    );
  });

  it("names the workflow when nothing else applies", () => {
    expect(runTaskLabel({ recipe: "  ", workflow: "Flux" })).toBe("Flux");
  });

  it("falls back to ComfyUI when the run has no name", () => {
    expect(runTaskLabel()).toBe("ComfyUI");
  });
});
