// Every name a workflow card's tile can print fits it (#1951).
//
// Each name in `KNOWN_BASE_MODELS` and `KNOWN_FINE_TUNES` is rendered here,
// in the tile's face in Chromium, where jsdom cannot measure text at all.
// CI's `system-ui` is DejaVu Sans, the widest face measured, which is the
// point. Four budgets, all read off the card's `--wf-mark` and laid out in
// 32nds of it as `ModelMark.vue` does:
//
// - A LoRA's or fine-tune's line fills the tile's line (the tile less 2px a
//   side), shrinking for a long one, but never below 8.25px (`.mmark-name`).
// - A release's name sits on a band in one size (`.mmark-band`, 7/32): none
//   is wider than "Chroma", and Chroma fits the band with its padding.
// - A release's version sits right of the glyph in 11/32 of the tile at
//   7.5/32, or at 5.5/32 in 15.5/32 beside the smaller glyph where it is
//   wider (`namedTile`'s `small`).
// - A tab's role word is held to the tile: the tab hangs as far past the
//   tile's right edge as its padding takes, so a word wider than the tile
//   pushes the tab past its left edge.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures/test.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
// The card's mark size, read off the card so this follows it.
const TILE = readFileSync(
  resolve(REPO_ROOT, 'frontend/src/components/widgets/WorkflowCard.vue'),
  'utf8',
).match(/--wf-mark: (\d+)px;/)
if (!TILE) throw new Error('WorkflowCard.vue no longer sets --wf-mark in whole px')
const TILE_PX = Number(TILE[1])
const LINE_PX = TILE_PX - 2 * 2
const at = (n) => (TILE_PX * n) / 32

// A `file_version` release's version comes from its file; 2511 stands in.
const READ_NAMES = `
import json
from pixlstash.utils.known_base_models import KNOWN_BASE_MODELS, KNOWN_FINE_TUNES, ROLE_WORDS, release_lines
tiles = [*KNOWN_BASE_MODELS.values(), *KNOWN_FINE_TUNES.values()]
releases = [release_lines(t, "2511" if t.get("file_version") else None) for t in KNOWN_BASE_MODELS.values() if t.get("mark")]
print(json.dumps({
    "lines": sorted({line for t in tiles for line in t.get("mark", [])}),
    "names": sorted({r[0] for r in releases}),
    "versions": sorted({v for r in releases for v in r[1:]}),
    "roles": sorted({t["role"] for t in tiles if t.get("role")} | set(ROLE_WORDS.values())),
}))
`

function knownNames() {
  const python = process.env.PIXLSTASH_PYTHON || 'python'
  const stdout = execFileSync(python, ['-c', READ_NAMES], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  })
  return JSON.parse(stdout)
}

test('every known name fits the tile at the smallest size it may take', async ({ page }) => {
  const known = knownNames()
  expect(known.lines.length).toBeGreaterThan(30)
  expect(known.names).toContain('Chroma')

  await page.goto('/')
  const widths = await page.evaluate(
    ({ lines, names, versions, roles, band, version, small }) => {
      const measure = (text, style) => {
        const span = document.createElement('span')
        Object.assign(span.style, {
          position: 'absolute',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-ui)',
          letterSpacing: '-0.02em',
          ...style,
        })
        span.textContent = text
        document.body.appendChild(span)
        const width = span.getBoundingClientRect().width
        span.remove()
        return [text, width]
      }
      return {
        // `.mmark-name`: semibold, at the floor.
        lines: lines.map((line) => measure(line, { fontSize: '8.25px', fontWeight: '600' })),
        // `.mmark-band`: regular.
        names: names.map((name) => measure(name, { fontSize: `${band}px`, fontWeight: '400' })),
        // `.mmark-release-version`: semibold, then its small size.
        versions: versions.map((v) => [
          ...measure(v, { fontSize: `${version}px`, fontWeight: '600' }),
          measure(v, { fontSize: `${small}px`, fontWeight: '600' })[1],
        ]),
        // `.mmark-tab`: the type ramp's 3xs, bold, with no letter-spacing.
        roles: roles.map((role) =>
          measure(role, { fontSize: 'var(--text-3xs)', fontWeight: '700', letterSpacing: '0' }),
        ),
      }
    },
    { ...known, band: at(7), version: at(7.5), small: at(5.5) },
  )

  const tooWide = (measured, budget) =>
    measured.filter(([, width]) => width > budget).map(([text, width]) => `${text} ${width}px`)
  expect(tooWide(widths.lines, LINE_PX), `names wider than the ${LINE_PX}px line at 8.25px`).toEqual(
    [],
  )
  const chroma = widths.names.find(([name]) => name === 'Chroma')[1]
  expect(chroma, 'Chroma wider than the band less its padding').toBeLessThanOrEqual(TILE_PX - 2 * 2)
  expect(tooWide(widths.names, chroma), 'release names wider than "Chroma"').toEqual([])
  // Too wide for the room at its size, a version takes the small one, where
  // it must fit beside the smaller glyph.
  const unfit = widths.versions
    .filter(([, width, smallWidth]) => width > at(11) && smallWidth > at(15.5))
    .map(([text, , smallWidth]) => `${text} ${smallWidth}px`)
  expect(unfit, 'versions wider than the room beside the glyph at either size').toEqual([])
  expect(tooWide(widths.roles, TILE_PX), `tab words wider than the ${TILE_PX}px tile`).toEqual([])
})
