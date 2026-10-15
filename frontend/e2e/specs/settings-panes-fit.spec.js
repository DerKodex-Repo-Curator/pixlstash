import { test, expect } from '../fixtures/test.js'

async function expectNoScroll(page) {
  const content = page.locator('.settings-content')
  const { scroll, client } = await content.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
  }))
  expect(scroll, 'Settings pane scrolls').toBeLessThanOrEqual(client)
}

// The panes are a fixed 524px (.settings-content). With the PixlStash Tagger
// active its settings section is inline at the bottom of Tagging, and the
// pane must still fit without a vertical scrollbar.
test('Tagging pane fits without scrolling while the PixlStash Tagger is active', async ({
  apiContext,
  page,
  settings,
}) => {
  const res = await apiContext.patch('/api/v1/users/me/config', {
    data: { tagger_settings: { active_tag_plugin: 'pixlstash_tagger' } },
  })
  expect(res.ok()).toBe(true)

  await page.goto('/')
  await settings.open()
  await settings.openTab('Tagging')
  await expect(page.getByText('PixlStash Tagger Settings')).toBeVisible()
  await expectNoScroll(page)
})

// Only the folder list scrolls on Models; the pane itself never does.
test('Models pane fits without scrolling', async ({ page, settings }) => {
  await page.goto('/')
  await settings.open()
  await settings.openTab('Models')
  await expect(page.getByText('Default folder')).toBeVisible()
  await expectNoScroll(page)
})
