import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import { nameScale, namedTile } from "./modelTile";

describe("namedTile", () => {
  it("is null for a row the server named nothing for", () => {
    expect(namedTile({ mark: null }, "hsl(1 2% 3%)")).toBeNull();
    expect(namedTile({}, "hsl(1 2% 3%)")).toBeNull();
  });

  it("takes the hashed hue for a family with no maker colour", () => {
    const tile = namedTile({ mark: ["Noob"] }, "hsl(10 55% 30%)");
    expect(tile.background).toBe("hsl(10 55% 30%)");
    expect(tile.edge).toBe("hsl(10 55% 30%)");
  });

  it("puts the tab in the gradient's last stop", () => {
    const tile = namedTile(
      { mark: ["SD", "1.5"], mark_colors: ["#9d39ff", "#e80000"] },
      "x",
    );
    expect(tile.edge).toBe("#e80000");
    expect(tile.tab).toBeNull();
  });

  it("lays a release out as its name, its maker's glyph and its version", () => {
    const { release, lines } = namedTile(
      { mark: ["Klein", "2"], mark_icon: "flux", mark_band: true },
      "x",
    );
    expect(lines).toBeUndefined();
    expect(release).toMatchObject({ name: "Klein", version: "2", small: false });
    expect(release.glyph.kind).toBe("glyph");
    // Inlined by Vite as a data URI: the glyph's own <title> names it.
    expect(release.glyph.url).toContain("title%3eFlux");
    expect(release.letters).toBeNull();
  });

  it("draws the owner's horse in the glyph's place and Chroma's eye over all", () => {
    const glyph = (icon) =>
      namedTile({ mark: ["X"], mark_icon: icon, mark_band: true }, "x").release
        .glyph;
    expect(glyph("pony")).toMatchObject({ kind: "picture" });
    expect(glyph("illustrious")).toMatchObject({ kind: "picture" });
    expect(glyph("chroma")).toMatchObject({ kind: "full" });
  });

  it("wears the server's letters where the maker has no glyph", () => {
    const { release } = namedTile(
      { mark: ["ZIT"], mark_icon: null, mark_letters: "Z", mark_band: true },
      "x",
    );
    expect(release.glyph).toBeNull();
    expect(release.letters).toBe("Z");
    // A glyph name it does not ship draws neither.
    expect(
      namedTile({ mark: ["X"], mark_icon: "nope", mark_band: true }, "x").release
        .glyph,
    ).toBeNull();
  });

  it("sets a version too wide for the room beside a smaller glyph", () => {
    const small = (version) =>
      namedTile({ mark: ["Qwen", version], mark_icon: "qwen", mark_band: true }, "x")
        .release.small;
    // jsdom measures 0.62em a character: four do not fit 11/32 at 7.5/32.
    expect(small("2511")).toBe(true);
    expect(small("2")).toBe(false);
  });
});

describe("nameScale", () => {
  it("caps one line higher than two", () => {
    expect(nameScale(["Z"])).toBeGreaterThan(nameScale(["Z", "1"]));
  });

  it("shrinks a long name to fit its line", () => {
    // The 8.25px floor is the CSS's, so the share itself is not clamped.
    expect(nameScale(["WWWWWWWWWW"])).toBeCloseTo(1 / (10 * 0.62), 5);
    expect(nameScale(["WWW"])).toBeLessThan(nameScale(["W"]));
  });
});

describe("the name's floor", () => {
  it("is a fixed 8.25px in the tile's CSS, whatever the tile's size", () => {
    // From the frontend root, as the suite runs: this file's own URL is not a
    // `file:` one under this module's environment.
    const css = readFileSync(
      `${process.cwd()}/src/components/widgets/ModelMark.vue`,
      "utf8",
    );
    const rule = css.match(/\.mmark-name \{[^}]*\}/)[0];
    expect(rule.replace(/\s+/g, " ")).toContain("font-size: max( 8.25px, calc(");
    // A release's band is one size, regular, which the e2e spec measures
    // Chroma at.
    const band = css.match(/\.mmark-band \{[^}]*\}/)[0];
    expect(band).toContain("font-size: calc(var(--entity-thumb) * 7 / 32)");
    expect(band).toContain("font-weight: var(--weight-regular)");
  });
});
