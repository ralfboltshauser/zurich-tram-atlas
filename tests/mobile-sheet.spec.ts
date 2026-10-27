import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 768, 'Phone sheet interactions')
})

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'browse')
}

// Real touch input, rather than changing React state or dispatching a synthetic click.
async function swipe(page: Page, x: number, y: number, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] })
    await page.waitForTimeout(30)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

async function dragHandle(page: Page, dy: number) {
  const handle = await page.getByTestId('sheet-grip').boundingBox()
  await swipe(page, handle!.x + handle!.width / 2, handle!.y + handle!.height / 2, 0, dy)
}

test('compact, expanded and completely hidden states give space back to the map', async ({ page }) => {
  await open(page)
  const sheet = page.getByTestId('explorer-sheet')
  const browse = await sheet.boundingBox()
  await page.getByRole('button', { name: 'Details erweitern' }).click()
  await expect(sheet).toHaveAttribute('data-sheet-state', 'expanded')
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeLessThan(85)
  await page.getByRole('button', { name: 'Panel kompakt anzeigen' }).click()
  await expect(sheet).toHaveAttribute('data-sheet-state', 'peek')
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThan(740)
  expect((await sheet.boundingBox())!.y - browse!.y).toBeGreaterThan(250)
  await page.screenshot({ path: 'qa/mobile-sheet-peek.png' })
  await page.getByRole('button', { name: 'Panel ausblenden' }).click()
  await expect(sheet).not.toBeVisible()
  const reopen = page.getByRole('button', { name: 'Linien und Suche öffnen' })
  await expect(reopen).toBeVisible()
  await expect(reopen).toBeFocused()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.screenshot({ path: 'qa/mobile-sheet-hidden.png' })
  await reopen.click()
  await expect(sheet).toHaveAttribute('data-sheet-state', 'browse')
  await expect(page.getByRole('combobox')).toBeVisible()
})

test('touch dragging snaps up and down and can dismiss the panel', async ({ page }) => {
  await open(page)
  const sheet = page.getByTestId('explorer-sheet')
  await dragHandle(page, -270)
  await expect(sheet).toHaveAttribute('data-sheet-state', 'expanded')
  await page.waitForTimeout(550)
  await dragHandle(page, 270)
  await expect(sheet).toHaveAttribute('data-sheet-state', 'browse')
  await page.waitForTimeout(550)
  await dragHandle(page, 240)
  await expect(sheet).toHaveAttribute('data-sheet-state', 'peek')
  await page.waitForTimeout(550)
  await dragHandle(page, 65)
  await expect(page.getByRole('button', { name: 'Linien und Suche öffnen' })).toBeVisible()
})

test('selected line, direction and focused stop survive hide and reopen', async ({ page }) => {
  await open(page, '/?linie=7&richtung=0')
  await page.getByRole('button', { name: 'Nächste Haltestelle' }).click()
  const selected = page.locator('.stop-selected')
  await expect(selected).toHaveAttribute('aria-label', 'Wollishoferplatz auf Karte zeigen')
  await page.getByRole('button', { name: 'Panel kompakt anzeigen' }).click()
  await page.getByRole('button', { name: 'Nächste Haltestelle' }).click()
  await expect(page.getByTestId('explorer-sheet').getByRole('heading', { name: 'Butzenstrasse' })).toBeVisible()
  const url = page.url()
  await page.getByRole('button', { name: 'Panel ausblenden' }).click()
  await page.getByRole('button', { name: 'Linien und Suche öffnen' }).click()
  await expect(page).toHaveURL(url)
  await expect(selected).toHaveAttribute('aria-label', 'Butzenstrasse auf Karte zeigen')
  await expect(page.getByTestId('explorer-sheet').getByRole('heading', { name: 'Butzenstrasse' })).toBeVisible()
})

test('the map still pans and zooms while the nonmodal sheet is open', async ({ page }) => {
  await open(page)
  const canvas = page.locator('.maplibregl-canvas')
  await page.waitForTimeout(600)
  const before = await canvas.screenshot()
  await swipe(page, 180, 230, 100, -40)
  await page.waitForTimeout(600)
  expect((await canvas.screenshot()).equals(before)).toBe(false)
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'browse')
  const panned = await canvas.screenshot()
  await page.getByRole('button', { name: 'Vergrössern', exact: true }).click()
  await page.waitForTimeout(600)
  expect((await canvas.screenshot()).equals(panned)).toBe(false)
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'browse')
})

test('search expands the panel and selecting a result releases keyboard focus', async ({ page }) => {
  await open(page)
  const search = page.getByRole('combobox')
  await search.fill('Kunsthaus')
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'expanded')
  await page.getByRole('option').first().click()
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'browse')
  await expect(page.getByRole('heading', { name: 'Kunsthaus', exact: true })).toBeVisible()
  await expect(search).not.toBeFocused()
})

test('the expanded stop list scrolls without dragging or dismissing the sheet', async ({ page }) => {
  await open(page, '/?linie=7&richtung=1')
  await page.getByRole('button', { name: 'Details erweitern' }).click()
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'expanded')
  await page.waitForTimeout(550)
  const scroll = page.locator('.panel-scroll')
  const box = await scroll.boundingBox()
  await swipe(page, box!.x + box!.width / 2, box!.y + box!.height - 50, 0, -220)
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
  await expect(page.getByTestId('explorer-sheet')).toHaveAttribute('data-sheet-state', 'expanded')
})

test('small phone widths, rotation and desktop transitions retain one usable explorer', async ({ page }) => {
  await open(page, '/?linie=7&richtung=1')
  for (const width of [320, 430, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByTestId('explorer-sheet')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Panel ausblenden' })).toBeVisible()
  }
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByTestId('explorer-sheet')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Linien und Lernwege' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Wollishoferplatz', exact: true })).toBeVisible()
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('explorer-sheet')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Wollishoferplatz', exact: true })).toBeVisible()
})
