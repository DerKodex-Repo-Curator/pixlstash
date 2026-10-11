import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test, expect } from '../fixtures/test.js'

// Move to library: right-click a picture, pick another library, and it leaves
// this one for that library's folder. Here it is a move to the Scrapheap, so
// one Undo brings it back.
//
// The fixture backend has ONE library, where the entry is absent by design, so
// this spec adds a second for its own lifetime and detaches it again: a second
// library left attached would put the entry in front of every later spec.

test.describe('move to library', () => {
  let archive = null
  let folder = null

  test.beforeAll(async ({ apiContext }) => {
    folder = mkdtempSync(join(tmpdir(), 'pixlstash-e2e-archive-'))
    // Named for its own folder: a retry makes a new folder, and the detached
    // row from the first attempt still holds the name it was given.
    const created = await apiContext.post('/api/v1/libraries', {
      data: { path: folder, name: `Archive ${folder.slice(-6)}` },
    })
    expect(created.status(), await created.text()).toBe(201)
    archive = await created.json()
  })

  test.afterAll(async ({ apiContext }) => {
    if (!archive) return
    const detached = await apiContext.delete(`/api/v1/libraries/${archive.uuid}`)
    expect(detached.ok(), await detached.text()).toBe(true)
    // The folder this spec made, and nothing else: mkdtemp's own.
    rmSync(folder, { recursive: true, force: true })
  })

  const scrapheapIds = async (apiContext) => {
    const listed = await apiContext.get('/api/v1/pictures', {
      params: { only_deleted: 'true', fields: 'grid' },
    })
    expect(listed.ok(), await listed.text()).toBe(true)
    return (await listed.json()).map((picture) => picture.id)
  }
  let scrapheapBefore = null

  // Whatever the test got to, what it sent to the Scrapheap goes back: every
  // later spec counts on the fixture. Only what THIS test put there, since an
  // earlier spec may have left pictures of its own.
  test.afterEach(async ({ apiContext }) => {
    if (!scrapheapBefore) return
    const mine = (await scrapheapIds(apiContext)).filter(
      (id) => !scrapheapBefore.includes(id),
    )
    scrapheapBefore = null
    if (!mine.length) return
    const restored = await apiContext.post('/api/v1/pictures/scrapheap/restore', {
      data: { picture_ids: mine },
    })
    expect(restored.ok(), await restored.text()).toBe(true)
  })

  test('a right-clicked picture moves to the library picked, and Undo brings it back', async ({
    page,
    grid,
    apiContext,
  }) => {
    scrapheapBefore = await scrapheapIds(apiContext)
    await grid.goto()
    const src = await grid.thumbnails.first().locator('img').getAttribute('src')
    const matched = src?.match(/\/thumbnails\/(\d+)\./)
    expect(matched, `thumbnail src was not a thumbnail URL: ${src}`).toBeTruthy()
    const pictureId = Number(matched[1])
    const card = grid.card(pictureId)

    await grid.openContextMenu(card)
    await grid.contextMenuItem('Move to library').hover()
    const target = grid.contextMenu.locator('.ctx-submenu .ctx-item', {
      hasText: archive.name,
    })
    await expect(target).toBeVisible()

    const answered = page.waitForResponse(
      (response) =>
        response.url().endsWith('/pictures/move-to-library') &&
        response.request().method() === 'POST',
    )
    await target.click()
    const body = await (await answered).json()

    // At least one: the first card may lead a collapsed stack, which moves whole.
    expect(body).toMatchObject({
      library_name: archive.name,
      skipped_locked: [],
      skipped_already_there: [],
      skipped_scrapheaped: [],
      failed: [],
    })
    expect(body.moved_count).toBeGreaterThanOrEqual(1)
    expect(body.moved).toContain(pictureId)
    await expect(
      page.locator('.notice-message', {
        hasText: new RegExp(`Moved ${body.moved_count} pictures? to ${archive.name}\\.`),
      }),
    ).toBeVisible()

    // In this library it is in the Scrapheap, exactly as a delete leaves it.
    expect(await scrapheapIds(apiContext)).toContain(pictureId)

    // One undo restores it here.
    const undone = await apiContext.post('/api/v1/operations/undo')
    expect(undone.ok(), await undone.text()).toBe(true)
    expect(await scrapheapIds(apiContext)).not.toContain(pictureId)
  })
})
