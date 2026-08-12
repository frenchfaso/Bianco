import { expect, test } from '@playwright/test'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAwCAIAAAD/zu84AAAATElEQVR4nO3ToQ0AMAhE0dJ0aEZgaxA19UDSkH8KDM8c4u6rM7v1OgBASc67qGrVXTO7g/Bo8wFaBJAPLQIAmADwyQD50CIAAIAfgACqDCFTD90OXwAAAABJRU5ErkJggg==',
  'base64'
)

const contextDefaults = {
  baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
  locale: 'it-IT',
  storageState: '/tmp/bianco-e2e-auth.json',
  ignoreHTTPSErrors: true
}

const testInsightConfigurationFingerprint = 'a'.repeat(64)

const testProviders = () => [
  { id: 'openai', label: 'OpenAI · ChatGPT subscription', configured: false, available: false, active: false, baseUrl: '', hasApiKey: false, requiresApiKey: false, source: 'environment', chatgptConnected: false, planType: null, subscriptionOnly: true, insightConfigurationFingerprint: null },
  { id: 'ollama', label: 'Ollama', configured: false, available: false, active: false, baseUrl: '', hasApiKey: false, requiresApiKey: false, source: 'environment', insightConfigurationFingerprint: null },
  { id: 'openai-compatible', label: 'Altro / OpenAI-compatible', configured: false, available: false, active: false, baseUrl: '', hasApiKey: false, requiresApiKey: false, source: 'environment', insightConfigurationFingerprint: null }
]

function newBiancoContext(browser, options = {}) {
  return browser.newContext({ ...contextDefaults, ...options })
}

function settingsButton(page) {
  return page.locator('button.header-settings')
}

async function expectPersistedSetting(page, key, value) {
  await expect.poll(() => page.locator('.app-shell').evaluate(
    (element, settingKey) => window.Alpine.$data(element).settings[settingKey],
    key
  )).toBe(value)
}

async function canvasHasRenderedPixels(locator) {
  return locator.evaluate((canvas) => {
    if (!canvas.width || !canvas.height) return false
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) return true
    }
    return false
  })
}

async function createManual(page, merchant, total) {
  await page.getByRole('button', { name: 'Archivio' }).click()
  await page.getByRole('button', { name: '+ Manuale' }).click()
  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detail.getByLabel('Esercente').fill(merchant)
  await detail.getByLabel('Totale (EUR)').fill(total)
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()
}

async function captureReceipt(page, merchant, total) {
  await expect.poll(() => page.locator('.app-shell').evaluate(
    (element) => window.Alpine.$data(element).receiptsReady
  )).toBe(true)
  const existingReceiptIds = await page.locator('.app-shell').evaluate((element) =>
    window.Alpine.$data(element).receipts.map((receipt) => receipt.id)
  )
  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: tinyPng
  })
  await expect(page.getByRole('img', { name: 'Correzione del ritaglio dello scontrino' })).toBeVisible()
  const cropPreview = await page.locator('.app-shell').evaluate((element) => {
    const capture = window.Alpine.$data(element).capture
    return {
      originalUrl: capture.originalUrl,
      quad: capture.quad,
      processed: capture.processed
    }
  })
  expect(cropPreview.originalUrl).toMatch(/^blob:/)
  expect(cropPreview.quad).toHaveLength(4)
  expect(cropPreview.processed).toBeNull()
  await page.getByRole('button', { name: 'Conferma', exact: true }).click()
  const archive = page.getByRole('region', { name: 'Archivio' })
  await expect(archive).toBeVisible()
  const findNewReceiptId = () => page.locator('.app-shell').evaluate(
    (element, previousIds) => window.Alpine.$data(element).receipts.find(
      (receipt) => !previousIds.includes(receipt.id) && receipt.imageHash
    )?.id || null,
    existingReceiptIds
  )
  await expect.poll(findNewReceiptId).not.toBeNull()
  const receiptId = await findNewReceiptId()
  await page.locator('.app-shell').evaluate(
    (element, id) => window.Alpine.$data(element).openReceipt(id),
    receiptId
  )
  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detail.locator('.magnifier-surface img')).toBeVisible()
  await detail.getByLabel('Esercente').fill(merchant)
  await detail.getByLabel('Totale (EUR)').fill(total)
  await detail.getByRole('button', { name: '+ Prodotto' }).click()
  await detail.getByLabel('Nome prodotto 1').fill('Spesa')
  await detail.getByLabel('Totale prodotto 1').fill(total)
  await detail.getByLabel('Categoria prodotto 1').selectOption('food_grocery')
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()
  return receiptId
}

async function ensureOfflineControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

test('an unauthenticated browser signs in through the server login page', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: contextDefaults.baseURL,
    locale: 'it-IT',
    storageState: { cookies: [], origins: [] },
    ignoreHTTPSErrors: true
  })
  try {
    const serviceWorker = await context.request.get('/sw.js', { maxRedirects: 0 })
    expect(serviceWorker.status()).toBe(200)
    expect(serviceWorker.headers()['content-type']).toContain('javascript')

    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/auth\/login\?next=/)
    await page.getByLabel('Username').fill(process.env.BIANCO_TEST_AUTH_USER || 'test-user')
    await page.getByLabel('Password').fill(process.env.BIANCO_TEST_AUTH_PASSWORD || 'test-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText('Panoramica', { exact: true }).first()).toBeVisible()
  } finally {
    await context.close()
  }
})

test('capture exposes an adjustable crop and stores WebP after save', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').evaluate(async (input) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1600
    const context = canvas.getContext('2d')
    context.fillStyle = '#26302f'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.beginPath()
    context.moveTo(220, 90)
    context.lineTo(1010, 180)
    context.lineTo(930, 1500)
    context.lineTo(150, 1400)
    context.closePath()
    context.fillStyle = '#f7f5ef'
    context.fill()
    context.strokeStyle = '#202020'
    context.lineWidth = 12
    for (let y = 330; y < 1320; y += 140) {
      context.beginPath()
      context.moveTo(280 - y * 0.06, y)
      context.lineTo(880 - y * 0.04, y + 60)
      context.stroke()
    }
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('fixture encoding failed')),
        'image/png'
      )
    })
    const transfer = new window.DataTransfer()
    transfer.items.add(new File([blob], 'receipt.png', { type: 'image/png' }))
    input.files = transfer.files
    input.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  const cropEditor = page.getByRole('img', { name: 'Correzione del ritaglio dello scontrino' })
  await expect(cropEditor).toBeVisible({ timeout: 30_000 })
  await expect(cropEditor).toHaveAttribute('viewBox', '0 0 1200 1600')
  const editorBounds = await cropEditor.boundingBox()
  expect(editorBounds.height).toBeGreaterThan(420)
  const capture = await page.locator('.app-shell').evaluate((element) => {
    const state = window.Alpine.$data(element).capture
    return {
      originalUrl: state.originalUrl,
      processing: state.processing,
      quad: state.quad,
      detected: state.detected
    }
  })
  expect(capture).toMatchObject({
    detected: true,
    processing: false
  })
  expect(capture.originalUrl).toMatch(/^blob:/)
  expect(capture.quad).toHaveLength(4)

  const firstCorner = page.getByLabel('Angolo del ritaglio 1')
  const bounds = await firstCorner.boundingBox()
  expect(bounds.width).toBeGreaterThanOrEqual(40)
  expect(bounds.height).toBeGreaterThanOrEqual(40)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 16, bounds.y + 18)
  const cropMagnifier = page.locator('.crop-magnifier')
  await expect(cropMagnifier).toBeVisible()
  const magnifierBounds = await cropMagnifier.boundingBox()
  expect(magnifierBounds.x).toBeGreaterThanOrEqual(0)
  expect(magnifierBounds.y).toBeGreaterThanOrEqual(0)
  expect(magnifierBounds.x + magnifierBounds.width).toBeLessThanOrEqual(390)
  expect(magnifierBounds.y + magnifierBounds.height).toBeLessThanOrEqual(844)
  await page.mouse.up()
  await expect(cropMagnifier).not.toBeVisible()

  await page.getByRole('button', { name: 'Conferma', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Archivio' })).toBeVisible()
  const imageHash = await page.locator('.app-shell').evaluate((element) =>
    window.Alpine.$data(element).receipts.find((receipt) => receipt.imageHash)?.imageHash
  )
  await expect.poll(async () => (await page.request.get(`/api/files/${imageHash}`)).status()).toBe(200)
  const image = await page.request.get(`/api/files/${imageHash}`)
  expect(image.headers()['content-type']).toContain('image/webp')
})

test('production PWA keeps a receipt available while offline', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Panoramica', { exact: true }).first()).toBeVisible()
  await ensureOfflineControl(page)
  await context.setOffline(true)
  await captureReceipt(page, 'Forno Offline', '12.50')
  await page.close()

  const reopened = await context.newPage()
  await reopened.goto('/')
  await reopened.getByRole('button', { name: 'Archivio' }).click()
  const archive = reopened.getByRole('region', { name: 'Archivio' })
  await expect(archive.getByText('Forno Offline')).toBeVisible()
  await expect(archive.getByText(/12,50/)).toBeVisible()
  await archive.getByText('Forno Offline').click()
  const detail = reopened.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detail.locator('.magnifier-surface img')).toBeVisible()
  await detail.getByLabel('Chiudi', { exact: true }).click()
  await reopened.getByRole('button', { name: 'Panoramica' }).click()
  const dashboard = reopened.getByRole('region', { name: 'Panoramica' })
  await expect(dashboard).toBeVisible()
  await expect(dashboard.locator('.hero-total strong')).toBeVisible()
  await expect(dashboard.getByText('Spesa alimentare')).toBeVisible()
  const categoryChart = dashboard.getByRole('img', { name: 'Spesa per categoria' })
  await expect(categoryChart).toBeVisible()
  await expect.poll(() => canvasHasRenderedPixels(categoryChart)).toBe(true)

  const spendingChart = dashboard.getByRole('img', { name: 'Uscite nel tempo' })
  await expect(spendingChart).toBeVisible()
  await expect.poll(() => canvasHasRenderedPixels(spendingChart)).toBe(true)
  await dashboard.getByRole('button', { name: 'Settimane' }).click()
  await expect(dashboard.getByRole('button', { name: 'Settimane' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => canvasHasRenderedPixels(spendingChart)).toBe(true)
})

test('an aggregate revision conflict keeps the receipt draft open', async ({ page }) => {
  let update = null
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  const today = new Date(now.getTime() - offset).toISOString().slice(0, 10)
  await page.route('**/api/sync/receipt-aggregates/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          revision: 7,
          receipt: {
            id: 'mock-receipt',
            merchantNormalized: null,
            transactionDate: today,
            currency: 'EUR',
            subtotalMinor: null,
            taxMinor: null,
            discountMinor: null,
            totalMinor: null,
            categoryId: 'other'
          },
          items: []
        }
      })
      return
    }
    update = route.request().postDataJSON()
    await route.fulfill({
      status: 409,
      json: {
        detail: {
          code: 'revision_conflict',
          aggregate: { revision: 8, receipt: { id: 'mock-receipt' }, items: [] }
        }
      }
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Archivio' }).click()
  await page.getByRole('button', { name: '+ Manuale' }).click()
  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect.poll(() => page.locator('.app-shell').evaluate(
    (element) => window.Alpine.$data(element).detail.baseRevision
  )).toBe(7)
  await detail.getByLabel('Esercente').fill('Modifica concorrente')
  await detail.getByLabel('Totale (EUR)').fill('12.50')
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()

  await expect(detail).toBeVisible()
  await expect(detail.getByLabel('Esercente')).toHaveValue('Modifica concorrente')
  await expect(page.locator('.toast:visible').filter({
    hasText: 'modificato su un altro dispositivo'
  })).toBeVisible()
  expect(update).toMatchObject({
    baseRevision: 7,
    receipt: { merchantNormalized: 'Modifica concorrente', totalMinor: 1250 }
  })
})

test('two browser contexts synchronize through pull/push and SSE', async ({ browser }) => {
  const merchant = `Mercato Sync ${Date.now()}`
  const first = await newBiancoContext(browser)
  const second = await newBiancoContext(browser)
  const pageA = await first.newPage()
  const pageB = await second.newPage()
  await Promise.all([pageA.goto('/'), pageB.goto('/')])
  await createManual(pageA, merchant, '23.40')
  await pageA.getByRole('region', { name: 'Archivio' }).getByText(merchant).click()
  let detailA = pageA.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detailA.getByRole('button', { name: '+ Prodotto' }).click()
  await detailA.getByLabel('Nome prodotto 1').fill('Pane')
  await detailA.getByLabel('Quantità 1').fill('1')
  await detailA.getByLabel('Prezzo unitario 1').fill('2.50')
  await detailA.getByLabel('Totale prodotto 1').fill('2.50')
  await detailA.getByLabel('Categoria prodotto 1').selectOption('food_grocery')
  await detailA.getByRole('button', { name: 'Salva', exact: true }).click()
  await pageB.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant)).toBeVisible({ timeout: 20_000 })
  await pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant).click()
  const detailB = pageB.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detailB.getByLabel('Nome prodotto 1')).toHaveValue('Pane', { timeout: 20_000 })
  await expect(detailB.getByLabel('Quantità 1')).toHaveValue('1')
  await expect(detailB.getByLabel('Prezzo unitario 1')).toHaveValue('2.50')
  await expect(detailB.getByLabel('Totale prodotto 1')).toHaveValue('2.50')
  await expect(detailB.getByLabel('Categoria prodotto 1')).toHaveValue('food_grocery')
  await second.setOffline(true)
  const editedMerchant = `${merchant} modificato`
  await detailB.getByLabel('Esercente').fill(editedMerchant)
  await detailB.getByLabel('Nome prodotto 1').fill('Pane biologico')
  await detailB.getByLabel('Quantità 1').fill('2')
  await detailB.getByLabel('Prezzo unitario 1').fill('2.25')
  await detailB.getByLabel('Totale prodotto 1').fill('4.50')
  await detailB.getByLabel('Categoria prodotto 1').selectOption('home')
  await detailB.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detailB).not.toBeVisible()
  await second.setOffline(false)
  await pageA.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageA.getByRole('region', { name: 'Archivio' }).getByText(editedMerchant)).toBeVisible({ timeout: 20_000 })
  await pageA.getByRole('region', { name: 'Archivio' }).getByText(editedMerchant).click()
  detailA = pageA.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detailA.getByLabel('Nome prodotto 1')).toHaveValue('Pane biologico', { timeout: 20_000 })
  await expect(detailA.getByLabel('Quantità 1')).toHaveValue('2')
  await expect(detailA.getByLabel('Prezzo unitario 1')).toHaveValue('2.25')
  await expect(detailA.getByLabel('Totale prodotto 1')).toHaveValue('4.50')
  await expect(detailA.getByLabel('Categoria prodotto 1')).toHaveValue('home')
  await Promise.all([first.close(), second.close()])
})

test('receipt images upload by hash and download lazily on another device', async ({ browser }) => {
  const merchant = `Foto Sync ${Date.now()}`
  const first = await newBiancoContext(browser)
  const second = await newBiancoContext(browser)
  const pageA = await first.newPage()
  const pageB = await second.newPage()
  await Promise.all([pageA.goto('/'), pageB.goto('/')])
  await captureReceipt(pageA, merchant, '7.80')

  const origin = new URL(pageA.url()).origin
  await expect.poll(async () => {
    const pull = await pageA.request.post(`${origin}/api/sync/receipts/pull`, {
      headers: { Origin: origin },
      data: { checkpoint: { sequence: 0 }, batchSize: 100 }
    })
    const documents = (await pull.json()).documents
    const receipt = documents.find((entry) => entry.merchantNormalized === merchant)
    if (!receipt?.imageHash) return false
    const image = await pageA.request.get(`${origin}/api/files/${receipt.imageHash}?variant=thumbnail`)
    return image.ok()
  }, { timeout: 20_000 }).toBe(true)

  await pageB.getByRole('button', { name: 'Archivio' }).click()
  const remoteReceipt = pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant)
  await expect(remoteReceipt).toBeVisible({ timeout: 20_000 })
  await remoteReceipt.click()
  let detail = pageB.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detail.locator('.magnifier-surface img')).toBeVisible({ timeout: 20_000 })
  const magnifierSurface = detail.locator('.magnifier-surface')
  const magnifierBounds = await magnifierSurface.boundingBox()
  await pageB.mouse.move(
    magnifierBounds.x + magnifierBounds.width / 2,
    magnifierBounds.y + magnifierBounds.height / 2
  )
  await expect(detail.locator('.magnifier-lens')).toBeVisible()
  await pageB.mouse.move(2, 2)
  await expect(detail.locator('.magnifier-lens')).not.toBeVisible()

  const openFullButton = detail.getByRole('button', { name: 'Apri immagine completa' })
  const reanalyzeButton = detail.getByRole('button', { name: 'Rivaluta con AI' })
  const [openFullBounds, reanalyzeBounds] = await Promise.all([
    openFullButton.boundingBox(),
    reanalyzeButton.boundingBox()
  ])
  expect(Math.abs(openFullBounds.y - reanalyzeBounds.y)).toBeLessThan(1)
  expect(Math.abs(openFullBounds.height - reanalyzeBounds.height)).toBeLessThan(1)

  await openFullButton.click()
  let imageViewer = pageB.getByRole('dialog', { name: 'Immagine completa dello scontrino' })
  await expect(imageViewer).toBeVisible()
  await expect(imageViewer.getByAltText('Fotografia dello scontrino')).toBeVisible()
  await imageViewer.getByRole('button', { name: 'Chiudi immagine completa' }).click()
  await expect(imageViewer).not.toBeVisible()
  await expect(detail).toBeVisible()
  await detail.getByLabel('Chiudi', { exact: true }).click()
  await second.setOffline(true)
  await remoteReceipt.click()
  detail = pageB.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detail.getByRole('button', { name: 'Apri immagine completa' }).click()
  imageViewer = pageB.getByRole('dialog', { name: 'Immagine completa dello scontrino' })
  await expect(imageViewer).toBeVisible()
  await pageB.keyboard.press('Escape')
  await expect(imageViewer).not.toBeVisible()
  await expect(detail).toBeVisible()

  const mobile = await newBiancoContext(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  })
  const mobilePage = await mobile.newPage()
  await mobilePage.goto('/')
  await mobilePage.getByRole('button', { name: 'Archivio' }).click()
  const mobileReceipt = mobilePage.getByRole('region', { name: 'Archivio' }).getByText(merchant)
  await expect(mobileReceipt).toBeVisible({ timeout: 20_000 })
  await mobileReceipt.click()
  const mobileDetail = mobilePage.getByRole('dialog', { name: 'Controlla lo scontrino' })
  const mobileSurface = mobileDetail.locator('.magnifier-surface')
  const mobileLens = mobileDetail.locator('.magnifier-lens')
  const mobileOpenButton = mobileDetail.getByRole('button', { name: 'Apri immagine completa' })
  await expect(mobileOpenButton).toBeEnabled({ timeout: 20_000 })
  const surfaceBounds = await mobileSurface.boundingBox()
  const buttonBoundsBefore = await mobileOpenButton.boundingBox()
  const touch = await mobile.newCDPSession(mobilePage)
  const start = {
    x: surfaceBounds.x + surfaceBounds.width / 2,
    y: surfaceBounds.y + Math.min(surfaceBounds.height * 0.7, 300),
    radiusX: 2,
    radiusY: 2,
    force: 1,
    id: 1
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
  await expect(mobileLens).toBeVisible()
  const transformBefore = await mobileLens.evaluate((element) => element.style.transform)
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...start, x: start.x + 42, y: start.y + 36 }]
  })
  await expect.poll(() => mobileLens.evaluate((element) => element.style.transform)).not.toBe(transformBefore)
  await expect(mobileOpenButton).toBeVisible()
  const buttonBoundsDuring = await mobileOpenButton.boundingBox()
  expect(Math.abs(buttonBoundsDuring.y - buttonBoundsBefore.y)).toBeLessThan(1)
  expect(Math.abs(buttonBoundsDuring.height - buttonBoundsBefore.height)).toBeLessThan(1)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(mobileLens).not.toBeVisible()

  await Promise.all([first.close(), second.close(), mobile.close()])
})

test('Ollama validates the endpoint and activates the backend pipeline automatically', async ({ page }) => {
  const writes = []
  let activations = 0
  await page.route('**/api/ai/providers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      await route.fulfill({ json: { providers: testProviders() } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama' && request.method() === 'PUT') {
      const payload = request.postDataJSON()
      writes.push(payload)
      await route.fulfill({ json: {
        id: 'ollama', label: 'Ollama', configured: true, available: true, active: false,
        baseUrl: payload.baseUrl, hasApiKey: false, requiresApiKey: false, source: 'database',
        insightConfigurationFingerprint: testInsightConfigurationFingerprint
      } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama/active' && request.method() === 'PUT') {
      activations += 1
      await route.fulfill({ json: {
        id: 'ollama', label: 'Ollama', configured: true, available: true, active: true,
        baseUrl: 'http://host.containers.internal:11434',
        hasApiKey: false, requiresApiKey: false, source: 'database',
        insightConfigurationFingerprint: testInsightConfigurationFingerprint
      } })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(navigation.getByRole('button')).toHaveText(['◫Panoramica', '＋Acquisisci', '≡Archivio'])
  const navTypography = await navigation.getByRole('button', { name: 'Panoramica' }).locator('span').evaluateAll(
    (elements) => elements.map((element) => Number.parseFloat(window.getComputedStyle(element).fontSize))
  )
  expect(navTypography[0]).toBeGreaterThan(navTypography[1])
  await expect(navigation.getByRole('button', { name: 'Acquisisci' }).locator('.bottom-nav-icon'))
    .toHaveCSS('background-color', 'rgb(15, 118, 110)')
  await expect(navigation.getByRole('button', { name: 'Impostazioni' })).toHaveCount(0)
  await settingsButton(page).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('heading', { name: 'Sincronizzazione' })).toHaveCount(0)
  await settings.getByLabel('Provider AI').selectOption('ollama')
  await settings.getByLabel('Indirizzo del provider').fill('http://host.containers.internal:11434')
  await expect(settings.getByText('Ollama è collegato e attivo.')).toBeVisible({ timeout: 5_000 })
  await expect(settings.getByText('In uso:').locator('..')).toContainText('Ollama')
  await expect(settings.getByLabel('Modello')).toHaveCount(0)
  expect(writes.at(-1)).toEqual({
    baseUrl: 'http://host.containers.internal:11434',
    clearApiKey: false
  })
  expect(writes.every((payload) => !Object.hasOwn(payload, 'model'))).toBe(true)
  expect(activations).toBe(1)
})

test('the configured backend pipeline is active on a new device and populates a captured receipt', async ({ page }) => {
  const extractedMerchant = `Panificio Roma ${Date.now()}`
  let directExtractionRequests = 0
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  const configuredProviders = testProviders().map((provider) => provider.id === 'ollama' ? {
    ...provider,
    configured: true,
    available: true,
    active: true,
    baseUrl: 'http://host.containers.internal:11434',
    source: 'database',
    insightConfigurationFingerprint: testInsightConfigurationFingerprint
  } : provider)
  await page.route('**/api/ai/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      await route.fulfill({ json: { providers: configuredProviders } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama' && request.method() === 'PUT') {
      await route.fulfill({ json: configuredProviders.find((provider) => provider.id === 'ollama') })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama/active' && request.method() === 'PUT') {
      await route.fulfill({ json: configuredProviders.find((provider) => provider.id === 'ollama') })
      return
    }
    if (url.pathname === '/api/ai/receipts/extract') {
      directExtractionRequests += 1
      await route.fulfill({ status: 404, json: { detail: 'Not found' } })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  await settingsButton(page).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByText('In uso:').locator('..')).toContainText('Ollama')
  await expect(settings.getByLabel('Modello')).toHaveCount(0)
  await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click()

  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: tinyPng
  })
  await page.getByRole('button', { name: 'Conferma', exact: true }).click()

  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detail).not.toBeVisible()
  const archive = page.getByRole('region', { name: 'Archivio' })
  await expect(archive).toBeVisible()
  const receiptId = await page.locator('.app-shell').evaluate((element) => {
    const data = window.Alpine.$data(element)
    return data.receipts.find((receipt) => (
      receipt.imageHash
      && !receipt.merchantNormalized
      && ['captured', 'queued', 'processing'].includes(receipt.status)
    ))?.id
  })
  expect(receiptId).toBeTruthy()
  const origin = new URL(page.url()).origin
  let masterReceipt
  await expect.poll(async () => {
    const response = await page.request.post(`${origin}/api/sync/receipts/pull`, {
      headers: { Origin: origin },
      data: { checkpoint: { sequence: 0 }, batchSize: 100 }
    })
    masterReceipt = (await response.json()).documents.find((entry) => entry.id === receiptId)
    return Boolean(masterReceipt)
  }, { timeout: 20_000 }).toBe(true)
  const updatedAt = new Date(Date.now() + 1000).toISOString()
  const extractedReceipt = {
    ...masterReceipt,
    status: 'needs_review',
    merchantRaw: extractedMerchant.toUpperCase(),
    merchantNormalized: extractedMerchant,
    transactionDate: '2026-07-14',
    subtotalMinor: 250,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 250,
    categoryId: 'food_grocery',
    overallConfidence: 0.96,
    ai: { providerId: 'ollama', modelId: 'qwen3-vl:8b', promptVersion: 'receipt-v1', schemaVersion: 1 },
    updatedAt,
    updatedByDevice: 'bianco-ai-worker'
  }
  const receiptPush = await page.request.post(`${origin}/api/sync/receipts/push`, {
    headers: { Origin: origin },
    data: { rows: [{ assumedMasterState: masterReceipt, newDocumentState: extractedReceipt }] }
  })
  expect((await receiptPush.json()).conflicts).toEqual([])
  const itemPush = await page.request.post(`${origin}/api/sync/receipt_items/push`, {
    headers: { Origin: origin },
    data: { rows: [{ assumedMasterState: null, newDocumentState: {
      id: `ai-item-${Date.now()}`,
      receiptId,
      rawName: 'PANE',
      normalizedName: 'Pane',
      quantity: 1,
      unitPriceMinor: 250,
      totalPriceMinor: 250,
      categoryId: 'food_grocery',
      confidence: 0.97,
      position: 0,
      userEdited: false,
      updatedAt,
      updatedByDevice: 'bianco-ai-worker',
      _deleted: false
    } }] }
  })
  expect((await itemPush.json()).conflicts).toEqual([])
  await expect(archive.getByText(extractedMerchant)).toBeVisible({ timeout: 10_000 })
  await archive.getByText(extractedMerchant).click()
  await expect(detail.getByLabel('Esercente')).toHaveValue(extractedMerchant, { timeout: 10_000 })
  await expect(detail.getByLabel('Totale (EUR)')).toHaveValue('2.50')
  await expect(detail.getByLabel('Nome prodotto 1')).toHaveValue('Pane')
  await expect(detail.getByRole('button', { name: 'Salva', exact: true })).toHaveCount(1)
  await expect(detail.getByRole('button', { name: 'Conferma', exact: true })).toHaveCount(0)

  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()
  await expect(archive).toBeVisible()
  await expect(archive.getByText(extractedMerchant)).toBeVisible()
  expect(directExtractionRequests).toBe(0)
  expect(consoleErrors.filter((message) => message.includes('Canvas is already in use'))).toEqual([])
})

test('settings is a modal and Escape restores focus to its trigger', async ({ page }) => {
  await page.goto('/')
  const trigger = settingsButton(page)
  await trigger.click()

  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('heading', { name: 'Impostazioni' })).toBeFocused()
  await expect(page.locator('html')).toHaveClass(/modal-is-open/)

  const deleteAllButton = settings.getByRole('button', { name: 'Reimposta questo dispositivo' })
  await deleteAllButton.click()
  const confirmation = page.getByRole('dialog', { name: 'Cancella dati locali' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Annulla' }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(settings).toBeVisible()
  await expect(deleteAllButton).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(settings).not.toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/modal-is-open/)
  await expect(trigger).toBeFocused()
})

test('PWA installation is suggested outside settings and respects not now', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Panoramica', level: 1 })).toBeVisible()

  await settingsButton(page).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByRole('heading', { name: 'Installazione' })).toHaveCount(0)
  await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click()

  const dispatchInstallPrompt = () => page.evaluate(() => {
    const event = new globalThis.Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(event, {
      prompt: { value: async () => {} },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) }
    })
    window.dispatchEvent(event)
  })

  await dispatchInstallPrompt()
  const suggestion = page.getByRole('region', { name: 'Installa Bianco' })
  await expect(suggestion).toBeVisible()
  await suggestion.getByRole('button', { name: 'Non ora' }).click()
  await expect(suggestion).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('bianco-install-dismissed-at')))).toBe(true)

  await dispatchInstallPrompt()
  await expect(suggestion).not.toBeVisible()
})

test('an available PWA update is shown as a toast and can be applied immediately', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => {
    const shell = document.querySelector('.app-shell')
    return shell && window.Alpine?.$data(shell).loading === false
  })
  await page.evaluate(() => {
    window.biancoUpdateTestCalls = 0
    window.biancoApplyUpdate = () => { window.biancoUpdateTestCalls += 1 }
    window.dispatchEvent(new CustomEvent('bianco-update'))
  })

  const updateToast = page.getByRole('status').filter({ hasText: 'È disponibile una nuova versione.' })
  await expect(updateToast).toBeVisible()
  const updateButton = updateToast.getByRole('button', { name: 'Aggiorna' })
  await expect(updateButton).toHaveCSS('background-color', 'rgb(15, 118, 110)')
  await updateButton.click()
  await expect.poll(() => page.evaluate(() => window.biancoUpdateTestCalls)).toBe(1)
})

test('destructive actions use an accessible modal instead of native confirm', async ({ page }) => {
  const merchant = `Conferma modale ${Date.now()}`
  await page.goto('/')
  await createManual(page, merchant, '4.20')
  await page.getByRole('region', { name: 'Archivio' }).getByText(merchant).click()
  const receiptDetail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  const deleteButton = receiptDetail.getByRole('button', { name: 'Elimina', exact: true })

  await page.evaluate(() => {
    window.__nativeConfirmCalled = false
    window.confirm = () => {
      window.__nativeConfirmCalled = true
      return false
    }
  })
  await deleteButton.click()

  const confirmation = page.getByRole('dialog', { name: 'Elimina scontrino' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('heading', { name: 'Elimina scontrino' })).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.__nativeConfirmCalled)).toBe(false)
  await confirmation.getByRole('button', { name: 'Annulla' }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(receiptDetail).toBeVisible()
  await expect(deleteButton).toBeFocused()
})

test('a forced dark theme survives a reload', async ({ page }) => {
  await page.goto('/')
  await settingsButton(page).click()
  let settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await settings.getByLabel('Tema').selectOption('dark')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101816')
  await expectPersistedSetting(page, 'themePreference', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await settingsButton(page).click()
  settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByLabel('Tema')).toHaveValue('dark')
})

test('automatic theme follows a dark system preference', async ({ browser }) => {
  const context = await newBiancoContext(browser, { colorScheme: 'dark' })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101816')
    await expect.poll(() => page.locator('html').evaluate(
      (element) => window.getComputedStyle(element).colorScheme
    )).toBe('dark')
    await settingsButton(page).click()
    await expect(page.getByRole('dialog', { name: 'Impostazioni' }).getByLabel('Tema')).toHaveValue('auto')
  } finally {
    await context.close()
  }
})

test('a forced French language survives a reload', async ({ page }) => {
  await page.goto('/')
  await settingsButton(page).click()
  const italianSettings = page.getByRole('dialog', { name: 'Impostazioni' })
  await italianSettings.getByLabel('Lingua dell’app').selectOption('fr')

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', level: 1 })).toBeVisible()
  await expectPersistedSetting(page, 'languagePreference', 'fr')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Paramètres' }).click()
  const frenchSettings = page.getByRole('dialog', { name: 'Paramètres' })
  await expect(frenchSettings.getByLabel('Langue de l’application')).toHaveValue('fr')
})

test('an unsupported browser locale falls back to English', async ({ browser }) => {
  const context = await newBiancoContext(browser, { locale: 'pt-BR' })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await expect(settings.getByLabel('App language')).toHaveValue('auto')
  } finally {
    await context.close()
  }
})

test('automatic language follows a supported German browser locale', async ({ browser }) => {
  const context = await newBiancoContext(browser, { locale: 'de-DE' })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    await expect(page.getByRole('heading', { name: 'Übersicht', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Einstellungen' }).click()
    const settings = page.getByRole('dialog', { name: 'Einstellungen' })
    await expect(settings.getByLabel('App-Sprache')).toHaveValue('auto')
  } finally {
    await context.close()
  }
})

test('ChatGPT device login activates the backend-managed AI configuration', async ({ page }) => {
  let connected = false
  let modelRequests = 0
  await page.route('**/api/ai/providers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      const providers = testProviders()
      providers[0] = {
        ...providers[0],
        configured: connected,
        available: connected,
        active: connected,
        chatgptConnected: connected,
        planType: connected ? 'plus' : null,
        insightConfigurationFingerprint: connected
          ? testInsightConfigurationFingerprint
          : null
      }
      await route.fulfill({ json: { providers } })
      return
    }
    if (url.pathname === '/api/ai/providers/openai/chatgpt/device' && request.method() === 'POST') {
      await route.fulfill({ json: {
        loginId: 'login-e2e',
        verificationUrl: 'https://auth.openai.com/codex/device',
        userCode: 'TEST-CODE'
      } })
      return
    }
    if (url.pathname === '/api/ai/providers/openai/chatgpt/status' && request.method() === 'GET') {
      connected = true
      await route.fulfill({ json: { connected: true, planType: 'plus', status: 'connected' } })
      return
    }
    if (url.pathname.includes('/api/ai/providers/openai/model')) {
      modelRequests += 1
      await route.fulfill({ status: 500, json: { detail: 'The PWA must not select models' } })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  const trigger = settingsButton(page)
  await trigger.click()
  let settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await settings.getByLabel('Provider AI').selectOption('openai')
  await settings.getByRole('button', { name: 'Collega ChatGPT' }).click()
  await expect(settings.getByText('TEST-CODE')).toBeVisible()
  await expect(settings.getByText('OpenAI è collegato e attivo.')).toBeVisible({ timeout: 5000 })
  await expect(settings.getByLabel('Modello Codex')).toHaveCount(0)
  expect(modelRequests).toBe(0)

  await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click()
  await trigger.click()
  settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByText('Piano collegato:')).toBeVisible()
  await expect(settings.getByLabel('Modello Codex')).toHaveCount(0)
})

test('selecting a connected provider activates it without exposing model controls', async ({ page }) => {
  let activeProvider = 'ollama'
  let openAiActivations = 0
  await page.route('**/api/ai/providers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const providers = testProviders().map((provider) => {
      if (provider.id === 'openai') return {
        ...provider,
        configured: true,
        available: true,
        active: activeProvider === 'openai',
        chatgptConnected: true,
        planType: 'plus',
        insightConfigurationFingerprint: testInsightConfigurationFingerprint
      }
      if (provider.id === 'ollama') return {
        ...provider,
        configured: true,
        available: true,
        active: activeProvider === 'ollama',
        baseUrl: 'http://host.containers.internal:11434',
        insightConfigurationFingerprint: testInsightConfigurationFingerprint
      }
      return provider
    })
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      await route.fulfill({ json: { providers } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama' && request.method() === 'PUT') {
      await route.fulfill({ json: providers.find((provider) => provider.id === 'ollama') })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama/active' && request.method() === 'PUT') {
      await route.fulfill({ json: providers.find((provider) => provider.id === 'ollama') })
      return
    }
    if (url.pathname === '/api/ai/providers/openai/active' && request.method() === 'PUT') {
      openAiActivations += 1
      activeProvider = 'openai'
      await route.fulfill({ json: {
        ...providers.find((provider) => provider.id === 'openai'),
        active: true
      } })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  await settingsButton(page).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByLabel('Provider AI')).toHaveValue('ollama')
  await settings.getByLabel('Provider AI').selectOption('openai')

  await expect(settings.getByText('OpenAI è collegato e attivo.')).toBeVisible()
  await expect(settings.getByText('In uso:').locator('..')).toContainText('OpenAI')
  await expect(settings.getByLabel('Modello Codex')).toHaveCount(0)
  expect(openAiActivations).toBe(1)
})
