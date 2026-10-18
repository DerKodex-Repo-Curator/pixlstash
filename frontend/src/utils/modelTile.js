// The named tile a workflow card draws a model of a known base model with
// (#1951). The server works all of it out (`known_base_models.model_tile`)
// and sends it on the row as `mark`, `mark_tab`, `mark_colors`, `mark_icon`,
// `mark_letters` and `mark_band`; this only lays it out. A release (`mark_band`) is its name
// across a band, its maker's glyph and its version beside it (Klein, the Flux
// glyph, 2); a LoRA or fine-tune is its base's name over its own initials
// (SDXL over JU9). Either has a tab for its role or a bolt for a few-step
// model, on its maker's colour. The shelf keeps the generated initials,
// because each of its rows prints the name beside the mark.

import chromaIcon from "../assets/model-families/chroma.webp";
import illustriousGlyph from "../assets/model-families/illustrious-glyph.webp";
import ponyGlyph from "../assets/model-families/pony-glyph.webp";

// The makers' glyphs, by the name the server sends: LobeHub's mono icons,
// drawn white (`assets/lobehub/LICENSE`).
const LOBEHUB = Object.fromEntries(
  Object.entries(
    import.meta.glob("../assets/lobehub/*.svg", {
      eager: true,
      import: "default",
    }),
  ).map(([path, url]) => [path.match(/([^/]+)\.svg$/)[1], url]),
);

/**
 * A release's art, by `mark_icon`. A maker's glyph sits beside the version
 * with a hard shadow; the owner's horse and star sit in the same place as
 * pictures; Chroma's eye fills the tile.
 */
function glyphOf(icon) {
  if (icon === "chroma") return { url: chromaIcon, kind: "full" };
  if (icon === "pony") return { url: ponyGlyph, kind: "picture" };
  if (icon === "illustrious") return { url: illustriousGlyph, kind: "picture" };
  return LOBEHUB[icon] ? { url: LOBEHUB[icon], kind: "glyph" } : null;
}

/** What the server's tab sends for a few-step model; drawn as a bolt icon. */
export const FEW_STEP_TAB = "⚡";

// A LoRA's name size, as a share of the tile's line (the tile less its
// padding): it grows until its widest line fills the line, up to 0.64 of it
// for one line (today's initials) and 0.475 for two, so they stay clear of the
// tab. The shares were measured on a 24px line (15.4px, 11.4px) and scale with
// the tile. The 8.25px floor is fixed, not a share, and lives in
// `.mmark-name`'s CSS; every known name fits the card's line at it, which
// `frontend/e2e/specs/model-tile-names.spec.js` measures.
const ONE_LINE = 15.4 / 24;
const TWO_LINES = 11.4 / 24;
// A release's version and the room beside the glyph, in 32nds of the tile
// (`.mmark-release-version`): 7.5 high in 11 of width, or 5.5 high in 15.5
// beside a smaller glyph where it is wider than that (Qwen's 2511).
const VERSION = 7.5;
const VERSION_ROOM = 11;
// The tile's tracking, `letter-spacing: -0.02em`, which canvas does not apply.
const TRACKING = -0.02;
// What a character measures where nothing can be measured (jsdom), in em.
const FALLBACK_EM = 0.62;

let context;
const widths = new Map();

/**
 * The width of *text* at 1px, semibold, tracked, in `--font-ui`: the face
 * `.mmark-name` and the version set. A system font stack, so nothing loads
 * late and a width once measured stays true.
 */
function widthEm(text) {
  if (!widths.has(text)) {
    if (context === undefined) {
      context =
        typeof OffscreenCanvas === "function"
          ? new OffscreenCanvas(1, 1).getContext("2d")
          : null;
    }
    const chars = [...text].length;
    let em = FALLBACK_EM * chars;
    if (context) {
      const face = getComputedStyle(document.documentElement)
        .getPropertyValue("--font-ui")
        .trim();
      context.font = `600 100px ${face || "system-ui"}`;
      em = context.measureText(text).width / 100 + TRACKING * chars;
    }
    widths.set(text, em);
  }
  return widths.get(text);
}

/**
 * The name's font size as a share of the tile's line: the cap for its shape,
 * shrunk until its widest line fits. The CSS holds it at its 8.25px floor.
 */
export function nameScale(lines) {
  const cap = lines.length > 1 ? TWO_LINES : ONE_LINE;
  const widest = Math.max(...lines.map(widthEm));
  return Math.min(cap, 1 / widest);
}

/**
 * How a row's named tile draws, or null for a row the server named nothing
 * for (no known base model), which keeps the generated mark.
 *
 * @param {Object} row - a shelf row or a card slot as `ModelMark` reads it.
 * @param {string} fallbackColor - the generated mark's hashed hue, for a
 *   family with no maker colour.
 * @returns {{lines: string[], tab: ?{bolt: boolean, text: string},
 *   background: string, edge: string, scale: number,
 *   release: ?{name: string, version: ?string, small: boolean,
 *     glyph: ?{url: string, kind: string}, letters: ?string}} | null}
 *   `letters` stand where a maker has no glyph (Z, HI, Lu).
 *   `edge` is the colour the tab's ink takes: the gradient's last stop.
 *   `release` is set for a release's band tile, and `lines`/`scale` for the
 *   rest.
 */
export function namedTile(row, fallbackColor) {
  if (!row?.mark?.length) return null;
  const stops = row.mark_colors?.length ? row.mark_colors : [fallbackColor];
  const tab = row.mark_tab
    ? row.mark_tab.startsWith(FEW_STEP_TAB)
      ? { bolt: true, text: row.mark_tab.slice(FEW_STEP_TAB.length) }
      : { bolt: false, text: row.mark_tab }
    : null;
  const tile = {
    tab,
    background:
      stops.length > 1
        ? `linear-gradient(135deg, ${stops.join(", ")})`
        : stops[0],
    edge: stops[stops.length - 1],
  };
  if (!row.mark_band) {
    return { ...tile, lines: row.mark, scale: nameScale(row.mark) };
  }
  const [name, version = null] = row.mark;
  const glyph = glyphOf(row.mark_icon);
  return {
    ...tile,
    release: {
      name,
      version,
      small: Boolean(version) && widthEm(version) * VERSION > VERSION_ROOM,
      glyph,
      letters: glyph ? null : row.mark_letters || null,
    },
  };
}
