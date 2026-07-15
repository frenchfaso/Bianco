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

const testProviders = () => [
  { id: 'openai', label: 'OpenAI', configured: false, available: false, active: false, model: '', baseUrl: 'https://api.openai.com/v1', hasApiKey: false, requiresApiKey: true, source: 'environment' },
  { id: 'ollama', label: 'Ollama', configured: false, available: false, active: false, model: '', baseUrl: '', hasApiKey: false, requiresApiKey: false, source: 'environment' },
  { id: 'openai-compatible', label: 'Altro / OpenAI-compatible', configured: false, available: false, active: false, model: '', baseUrl: '', hasApiKey: false, requiresApiKey: false, source: 'environment' }
]

function newBiancoContext(browser, options = {}) {
  return browser.newContext({ ...contextDefaults, ...options })
}

async function expectPersistedSetting(page, key, value) {
  await expect.poll(() => page.locator('.app-shell').evaluate(
    (element, settingKey) => window.Alpine.$data(element).settings[settingKey],
    key
  )).toBe(value)
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
  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: tinyPng
  })
  await expect(page.getByAltText('Anteprima dello scontrino')).toBeVisible()
  await page.getByRole('button', { name: 'Salva', exact: true }).click()
  const archive = page.getByRole('region', { name: 'Archivio' })
  await expect(archive).toBeVisible()
  await archive.getByText('Scontrino senza esercente').last().click()
  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await expect(detail.getByAltText('Fotografia dello scontrino')).toBeVisible()
  await detail.getByLabel('Esercente').fill(merchant)
  await detail.getByLabel('Totale (EUR)').fill(total)
  await detail.getByLabel('Categoria').selectOption('food_grocery')
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()
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
  await expect(detail.getByAltText('Fotografia dello scontrino')).toBeVisible()
  await detail.getByLabel('Chiudi', { exact: true }).click()
  await reopened.getByRole('button', { name: 'Panoramica' }).click()
  const dashboard = reopened.getByRole('region', { name: 'Panoramica' })
  await expect(dashboard.getByText(/12,50/).first()).toBeVisible()
  await expect(dashboard.getByText('Spesa alimentare')).toBeVisible()
})

test('two browser contexts synchronize through pull/push and SSE', async ({ browser }) => {
  const merchant = `Mercato Sync ${Date.now()}`
  const first = await newBiancoContext(browser)
  const second = await newBiancoContext(browser)
  const pageA = await first.newPage()
  const pageB = await second.newPage()
  await Promise.all([pageA.goto('/'), pageB.goto('/')])
  await createManual(pageA, merchant, '23.40')
  await pageB.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant)).toBeVisible({ timeout: 20_000 })
  await pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant).click()
  await second.setOffline(true)
  const editedMerchant = `${merchant} modificato`
  const detail = pageB.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detail.getByLabel('Esercente').fill(editedMerchant)
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()
  await second.setOffline(false)
  await pageA.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageA.getByRole('region', { name: 'Archivio' }).getByText(editedMerchant)).toBeVisible({ timeout: 20_000 })
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
      data: { checkpoint: { sequence: 0 }, batchSize: 500 }
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
  await expect(detail.getByAltText('Fotografia dello scontrino')).toBeVisible({ timeout: 20_000 })
  await detail.getByRole('button', { name: /Apri immagine completa/ }).click()
  await expect(detail.getByText('Immagine completa conservata localmente')).toBeVisible()
  await detail.getByLabel('Chiudi', { exact: true }).click()
  await second.setOffline(true)
  await remoteReceipt.click()
  detail = pageB.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detail.getByRole('button', { name: /Apri immagine completa/ }).click()
  await expect(detail.getByText('Immagine completa conservata localmente')).toBeVisible()
  await Promise.all([first.close(), second.close()])
})

test('Ollama validates the endpoint, lists models and activates the selection automatically', async ({ page }) => {
  const writes = []
  await page.route('**/api/ai/providers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      await route.fulfill({ json: { providers: testProviders() } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama/models' && request.method() === 'GET') {
      await route.fulfill({ json: { models: ['qwen3-vl:8b', 'gemma3:12b'] } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama' && request.method() === 'PUT') {
      const payload = request.postDataJSON()
      writes.push(payload)
      await route.fulfill({ json: {
        id: 'ollama', label: 'Ollama', configured: Boolean(payload.model), available: Boolean(payload.model), active: false,
        model: payload.model, baseUrl: payload.baseUrl, hasApiKey: false, requiresApiKey: false, source: 'database'
      } })
      return
    }
    if (url.pathname === '/api/ai/providers/ollama/active' && request.method() === 'PUT') {
      await route.fulfill({ json: {
        id: 'ollama', label: 'Ollama', configured: true, available: true, active: true,
        model: 'qwen3-vl:8b', baseUrl: 'http://host.containers.internal:11434',
        hasApiKey: false, requiresApiKey: false, source: 'database'
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
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('heading', { name: 'Sincronizzazione' })).toHaveCount(0)
  await settings.getByLabel('Provider AI').selectOption('ollama')
  await settings.getByLabel('Indirizzo del provider').fill('http://host.containers.internal:11434')
  await expect(settings.getByLabel('Modello')).toBeEnabled({ timeout: 5_000 })
  await expect(settings.getByLabel('Modello').locator('option')).toHaveCount(3)
  await settings.getByLabel('Modello').selectOption('qwen3-vl:8b')
  await expect(settings.getByText('Ollama · qwen3-vl:8b è ora il modello di Bianco.')).toBeVisible()
  await expect(settings.getByText('In uso:').locator('..')).toContainText('Ollama · qwen3-vl:8b')
  expect(writes).toEqual([
    { baseUrl: 'http://host.containers.internal:11434', model: '', clearApiKey: false },
    { baseUrl: 'http://host.containers.internal:11434', model: 'qwen3-vl:8b', clearApiKey: false }
  ])
})

test('the only configured model becomes active on a new device and populates a captured receipt', async ({ page }) => {
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
    model: 'qwen3-vl:8b',
    baseUrl: 'http://host.containers.internal:11434',
    source: 'database'
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
    if (url.pathname === '/api/ai/providers/ollama/models' && request.method() === 'GET') {
      await route.fulfill({ json: { models: ['qwen3-vl:8b'] } })
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
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByText('In uso:').locator('..')).toContainText('Ollama · qwen3-vl:8b')
  await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click()

  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: tinyPng
  })
  await page.getByRole('button', { name: 'Salva', exact: true }).click()

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
      data: { checkpoint: { sequence: 0 }, batchSize: 500 }
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
  const trigger = page.getByRole('button', { name: 'Impostazioni' })
  await trigger.click()

  const settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings).toBeVisible()
  await expect(settings.getByRole('heading', { name: 'Impostazioni' })).toBeFocused()
  await expect(page.locator('html')).toHaveClass(/modal-is-open/)

  const deleteAllButton = settings.getByRole('button', { name: 'Elimina tutti i dati locali' })
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

  await page.getByRole('button', { name: 'Impostazioni' }).click()
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
  await updateToast.getByRole('button', { name: 'Aggiorna' }).click()
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
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  let settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await settings.getByLabel('Tema').selectOption('dark')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101816')
  await expectPersistedSetting(page, 'themePreference', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Impostazioni' }).click()
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
    await page.getByRole('button', { name: 'Impostazioni' }).click()
    await expect(page.getByRole('dialog', { name: 'Impostazioni' }).getByLabel('Tema')).toHaveValue('auto')
  } finally {
    await context.close()
  }
})

test('a forced French language survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Impostazioni' }).click()
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

test('an API key is cleared from form memory when settings closes', async ({ page }) => {
  await page.route('**/api/ai/providers**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
      await route.fulfill({ json: { providers: testProviders() } })
      return
    }
    if (url.pathname === '/api/ai/providers/openai' && request.method() === 'PUT') {
      const payload = request.postDataJSON()
      await route.fulfill({ json: {
        id: 'openai', label: 'OpenAI', configured: Boolean(payload.model), available: false, active: false,
        model: payload.model, baseUrl: payload.baseUrl, hasApiKey: true, requiresApiKey: true, source: 'database'
      } })
      return
    }
    if (url.pathname === '/api/ai/providers/openai/models' && request.method() === 'GET') {
      await route.fulfill({ json: { models: [] } })
      return
    }
    await route.continue()
  })

  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Impostazioni' })
  await trigger.click()
  let settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await settings.getByLabel('Provider AI').selectOption('openai')
  const apiKey = settings.getByLabel('API key', { exact: true })
  await apiKey.fill('sk-placeholder-never-sent-to-a-real-provider')
  await settings.getByRole('button', { name: 'Chiudi impostazioni' }).click()
  await expect(settings).not.toBeVisible()

  await trigger.click()
  settings = page.getByRole('dialog', { name: 'Impostazioni' })
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('')
})
