// Every name, version and role a workflow card's tile can print fits it (#1951).
//
// Each name in `KNOWN_BASE_MODELS` and `KNOWN_FINE_TUNES` is rendered here,
// in the tile's face in Chromium, where jsdom cannot measure text at all.
// CI's `system-ui` is DejaVu Sans, the widest face measured, which is the
// point. Three budgets, all read off the card's `--wf-mark`:
//
// - A re-branded fine-tune's line fills the tile's line (the tile less 2px a
//   side), shrinking for a long one, but never below 8.25px (`.mmark-name`).
// - A release's version pill (`.mmark-release-version`) and a tab's role
//   word (`.mmark-tab`) are held to the tile: each pill hangs past the tile's
//   right edge (7px and 6px) and carries 2px of padding a side, so a word
//   wider than the tile plus that overhang less the padding pushes its pill
//   past the tile's left edge.

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

// A `file_version` release's version comes from its file; 2511 stands in.
// Every model of a known base model wears its base's tile; the tab tells a
// fine-tune (its initials) and a LoRA (LORA) from the release.
const READ_NAMES = `
import json
from pixlstash.utils.known_base_models import KNOWN_BASE_MODELS, KNOWN_FINE_TUNES, LORA_TAB, ROLE_WORDS, release_lines
tiles = [*KNOWN_BASE_MODELS.values(), *KNOWN_FINE_TUNES.values()]
releases = [release_lines(t, "2511" if t.get("file_version") else None) for t in KNOWN_BASE_MODELS.values() if t.get("mark")]
print(json.dumps({
    "lines": sorted({line for t in tiles for line in t.get("mark", [])}),
    "versions": sorted({v for r in releases for v in r[1:]}),
    # A fine-tune's tab is its initials and version, two letters and two
    # digits at most: WW88 stands for the widest.
    "roles": sorted({t["role"] for t in tiles if t.get("role")} | set(ROLE_WORDS.values()) | {LORA_TAB, "WW88"}),
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
  expect(known.versions).toContain('2511')

  await page.goto('/')
  const widths = await page.evaluate(
    ({ lines, versions, roles }) => {
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
        // `.mmark-release-version`: the type ramp's xs, bold.
        versions: versions.map((v) => measure(v, { fontSize: 'var(--text-xs)', fontWeight: '700' })),
        // `.mmark-tab`: the type ramp's 3xs, bold, with no letter-spacing.
        roles: roles.map((role) =>
          measure(role, { fontSize: 'var(--text-3xs)', fontWeight: '700', letterSpacing: '0' }),
        ),
      }
    },
    known,
  )

  const tooWide = (measured, budget) =>
    measured.filter(([, width]) => width > budget).map(([text, width]) => `${text} ${width}px`)
  expect(tooWide(widths.lines, LINE_PX), `names wider than the ${LINE_PX}px line at 8.25px`).toEqual(
    [],
  )
  // Each pill carries 2px of padding a side (`--space-1`).
  const fits = (hang) => TILE_PX + hang - 2 * 2
  expect(tooWide(widths.versions, fits(7)), 'versions whose pill passes the tile').toEqual([])
  expect(tooWide(widths.roles, fits(6)), 'tab words whose pill passes the tile').toEqual([])
})
