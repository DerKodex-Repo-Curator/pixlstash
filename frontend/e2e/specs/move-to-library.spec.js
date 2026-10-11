import { mkdtempSync } from 'node:fs'
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
    const created = await apiContext.post('/api/v1/libraries', {
      data: { path: folder, name: 'Archive' },
    })
    expect(created.status(), await created.text()).toBe(201)
    archive = await created.json()
  })

  test.afterAll(async ({ apiContext }) => {
    if (!archive) return
    const detached = await apiContext.delete(`/api/v1/libraries/${archive.uuid}`)
    expect(detached.ok(), await detached.text()).toBe(true)
  })

  test('a right-clicked picture moves to the library picked, and Undo brings it back', async ({
    page,
    grid,
    apiContext,
  }) => {
    await grid.goto()
    const src = await grid.thumbnails.first().locator('img').getAttribute('src')
    const pictureId = Number(src.match(/\/thumbnails\/(\d+)\./)[1])
    const card = grid.card(pictureId)

    await grid.openContextMenu(card)
    await grid.contextMenuItem('Move to library').hover()
    const target = grid.contextMenu.locator('.ctx-submenu .ctx-item', {
      hasText: 'Archive',
    })
    await expect(target).toBeVisible()

    const answered = page.waitForResponse(
      (response) =>
        response.url().endsWith('/pictures/move-to-library') &&
        response.request().method() === 'POST',
    )
    await target.click()
    const body = await (await answered).json()

    expect(body).toMatchObject({
      library_name: 'Archive',
      moved_count: 1,
      skipped_locked: [],
      skipped_scrapheaped: [],
      failed: [],
    })
    await expect(
      page.locator('.notice-message', { hasText: 'Moved 1 picture to Archive.' }),
    ).toBeVisible()

    // In this library it is in the Scrapheap, exactly as a delete leaves it.
    const scrapheap = await apiContext.get('/api/v1/pictures', {
      params: { only_deleted: 'true', fields: 'grid' },
    })
    expect(scrapheap.ok()).toBe(true)
    const scrapheaped = (await scrapheap.json()).map((picture) => picture.id)
    expect(scrapheaped).toContain(pictureId)

    // One undo restores it here, which is what keeps later specs' fixture whole.
    const undone = await apiContext.post('/api/v1/operations/undo')
    expect(undone.ok(), await undone.text()).toBe(true)
    const after = await apiContext.get('/api/v1/pictures', {
      params: { only_deleted: 'true', fields: 'grid' },
    })
    expect((await after.json()).map((picture) => picture.id)).not.toContain(
      pictureId,
    )
  })
})
