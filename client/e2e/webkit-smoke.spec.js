import { expect, test } from '@playwright/test'

test('WebKit renders the dashboard chart and accessible dialogs', async ({ page }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost').origin
  const id = `webkit-${Date.now()}`
  const timestamp = new Date().toISOString()
  const receipt = {
    id,
    status: 'confirmed',
    capturedAt: timestamp,
    transactionDate: timestamp.slice(0, 10),
    merchantRaw: 'WebKit fixture',
    merchantNormalized: 'WebKit fixture',
    currency: 'EUR',
    subtotalMinor: 1234,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 1234,
    categoryId: 'food_grocery',
    imageHash: null,
    overallConfidence: 1,
    warnings: [],
    userConfirmed: true,
    ai: { providerId: null, modelId: null, promptVersion: null, schemaVersion: null },
    updatedAt: timestamp,
    updatedByDevice: 'webkit-e2e',
    _deleted: false
  }
  const item = {
    id: `${id}-item`,
    receiptId: id,
    rawName: 'Fixture',
    normalizedName: 'Fixture',
    quantity: 1,
    unitPriceMinor: 1234,
    totalPriceMinor: 1234,
    categoryId: 'food_grocery',
    confidence: 1,
    position: 0,
    userEdited: true,
    updatedAt: timestamp,
    updatedByDevice: 'webkit-e2e',
    _deleted: false
  }

  for (const [collection, document] of [['receipts', receipt], ['receipt_items', item]]) {
    const response = await page.request.post(`/api/sync/${collection}/push`, {
      headers: { Origin: origin },
      data: { rows: [{ assumedMasterState: null, newDocumentState: document }] }
    })
    expect(response.ok(), `push ${collection} failed: ${response.status()} ${await response.text()}`).toBeTruthy()
  }

  await page.goto('/')
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => canvas.evaluate((node) => ({
    width: node.width,
    height: node.height
  }))).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
  const dimensions = await canvas.evaluate((node) => ({ width: node.width, height: node.height }))
  expect(dimensions.width).toBeGreaterThan(0)
  expect(dimensions.height).toBeGreaterThan(0)
  await expect.poll(async () => canvas.evaluate((node) => {
    const context = node.getContext('2d')
    const pixels = context.getImageData(0, 0, node.width, node.height).data
    let painted = 0
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) painted += 1
    }
    return painted
  })).toBeGreaterThan(100)

  await page.locator('button.header-settings').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
