import { expect, test as base } from '@playwright/test'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

// Network faults happen outside the browser, so service-worker requests are
// covered too (browser route interception differs across engines).
const test = base.extend({
  faultProxy: async ({}, use) => {
    const upstream = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost')
    let mode = 'online'
    let commits = 0
    const server = createServer((incoming, outgoing) => {
      if (mode !== 'online') {
        if (mode !== 'timeout' || !incoming.url.includes('/receipt-aggregates/')) incoming.socket.destroy()
        return
      }
      const forward = (upstream.protocol === 'https:' ? httpsRequest : httpRequest)(
        new URL(incoming.url, upstream),
        { method: incoming.method, headers: incoming.headers },
        (response) => {
          if (incoming.method === 'PUT' && incoming.url.includes('/receipt-aggregates/') && response.statusCode === 200) commits++
          outgoing.writeHead(response.statusCode, response.headers)
          response.pipe(outgoing)
        }
      )
      forward.on('error', () => outgoing.destroy())
      outgoing.on('close', () => forward.destroy())
      incoming.pipe(forward)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      await use({
        url: `http://localhost:${server.address().port}`,
        get commits() { return commits },
        setMode(value) { mode = value; server.closeAllConnections() }
      })
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
})

const appState = (page, read) => page.locator('.app-shell').evaluate(
  (element, expression) => {
    const app = window.Alpine.$data(element)
    if (expression === 'id') return app.detail.id
    if (expression === 'revision') return app.detail.baseRevision
    if (expression === 'edits') return app.receiptEdits.length
    return app.receiptsReady
  }, read
)
const openReceipt = (page, id) => page.locator('.app-shell').evaluate(
  (element, receiptId) => window.Alpine.$data(element).openReceipt(receiptId), id
)

for (const mode of ['server-unreachable', 'airplane', 'timeout']) {
  test(`receipt and products survive ${mode}, reload, and converge without duplicate writes`, async ({ page, context, browser, browserName, faultProxy }) => {
    await page.goto(faultProxy.url)
    await expect.poll(() => appState(page, 'ready')).toBe(true)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    await expect.poll(() => appState(page, 'ready')).toBe(true)
    await page.getByRole('button', { name: 'Archivio', exact: true }).click()
    await page.getByRole('button', { name: '+ Manuale' }).click()
    await expect.poll(() => appState(page, 'id')).not.toBeNull()
    const id = await appState(page, 'id')
    await expect.poll(async () => (await context.request.get(`/api/sync/receipt-aggregates/${id}`)).status()).toBe(200)
    await page.locator('.app-shell').evaluate((element) => {
      const app = window.Alpine.$data(element)
      return app.loadReceiptAggregateRevision(app.detail.id)
    })
    await expect.poll(() => appState(page, 'revision')).toEqual(expect.any(Number))
    if (mode === 'airplane') await context.setOffline(true)
    else faultProxy.setMode(mode)
    expect(await page.evaluate(() => navigator.onLine)).toBe(mode !== 'airplane')
    const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
    const name = `Offline ${mode} ${id.slice(0, 8)}`
    await detail.getByLabel('Esercente', { exact: true }).fill(name)
    await detail.getByLabel('Totale (EUR)', { exact: true }).fill('3.00')
    await detail.getByRole('button', { name: '+ Prodotto' }).click()
    await detail.getByLabel('Nome prodotto 1', { exact: true }).fill('Pane')
    await detail.getByLabel('Quantità 1', { exact: true }).fill('2')
    await detail.getByLabel('Prezzo unitario 1', { exact: true }).fill('1.50')
    await detail.getByLabel('Totale prodotto 1', { exact: true }).fill('3.00')
    await detail.getByLabel('Categoria prodotto 1', { exact: true }).selectOption('food_grocery')
    await detail.getByRole('button', { name: 'Salva', exact: true }).click()
    await expect(detail).not.toBeVisible({ timeout: 12_000 })
    await expect.poll(() => appState(page, 'edits')).toBe(1)
    if (mode === 'airplane' && browserName === 'webkit') {
      // setOffline(true) + navigation fails even with a minimal cache-only SW
      // in this WebKit build. Keep the real server unreachable for reload,
      // after having asserted navigator.onLine=false during the actual save.
      test.info().annotations.push({ type: 'limitation', description: 'WebKit: airplane-mode save is tested; reload uses a disconnected proxy (Playwright service-worker emulation limitation).' })
      faultProxy.setMode('server-unreachable')
      await context.setOffline(false)
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => appState(page, 'ready')).toBe(true)
    await openReceipt(page, id)
    await expect(detail.getByLabel('Esercente', { exact: true })).toHaveValue(name)
    await expect(detail.getByLabel('Totale (EUR)', { exact: true })).toHaveValue('3.00')
    await expect(detail.getByLabel('Nome prodotto 1', { exact: true })).toHaveValue('Pane')
    await expect(detail.getByLabel('Quantità 1', { exact: true })).toHaveValue('2')
    await expect(detail.getByLabel('Prezzo unitario 1', { exact: true })).toHaveValue('1.50')
    faultProxy.setMode('online')
    await context.setOffline(false)
    await expect.poll(() => appState(page, 'edits'), { timeout: 20_000 }).toBe(0)
    expect(faultProxy.commits).toBe(1)

    const second = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
      locale: 'it-IT', storageState: '/tmp/bianco-e2e-auth.json', ignoreHTTPSErrors: true
    })
    const other = await second.newPage()
    await other.goto('/')
    await expect.poll(() => other.locator('.app-shell').evaluate(
      (element, receiptId) => window.Alpine.$data(element).receipts.some((receipt) => receipt.id === receiptId && receipt.totalMinor === 300), id
    )).toBe(true)
    await openReceipt(other, id)
    const remoteDetail = other.getByRole('dialog', { name: 'Controlla lo scontrino' })
    await expect(remoteDetail.getByLabel('Nome prodotto 1', { exact: true })).toHaveValue('Pane')
    await expect(remoteDetail.getByLabel('Quantità 1', { exact: true })).toHaveValue('2')
    await expect(remoteDetail.getByLabel('Totale prodotto 1', { exact: true })).toHaveValue('3.00')
    await expect(remoteDetail.getByLabel('Categoria prodotto 1', { exact: true })).toHaveValue('food_grocery')
    const remote = await context.request.get(`/api/sync/receipt-aggregates/${id}`)
    const aggregate = await remote.json()
    expect(aggregate.items).toHaveLength(1)
    expect(aggregate.receipt.merchantNormalized).toBe(name)
    expect(aggregate.items[0]).toMatchObject({ quantity: 2, unitPriceMinor: 150, totalPriceMinor: 300 })
    await second.close()
  })
}

test('offline edits cannot overwrite another client and remain recoverable after reload', async ({ page, context, browser, faultProxy }) => {
  await page.goto(faultProxy.url)
  await expect.poll(() => appState(page, 'ready')).toBe(true)
  await page.getByRole('button', { name: 'Archivio', exact: true }).click()
  await page.getByRole('button', { name: '+ Manuale' }).click()
  await expect.poll(() => appState(page, 'id')).not.toBeNull()
  const id = await appState(page, 'id')
  await expect.poll(async () => (await context.request.get(`/api/sync/receipt-aggregates/${id}`)).status()).toBe(200)
  await page.locator('.app-shell').evaluate((element) => {
    const app = window.Alpine.$data(element)
    return app.loadReceiptAggregateRevision(app.detail.id)
  })
  faultProxy.setMode('server-unreachable')
  const detail = page.getByRole('dialog', { name: 'Controlla lo scontrino' })
  await detail.getByLabel('Esercente', { exact: true }).fill('Local draft')
  await detail.getByLabel('Totale (EUR)', { exact: true }).fill('4.00')
  await detail.getByRole('button', { name: 'Salva', exact: true }).click()
  await expect(detail).not.toBeVisible()

  const second = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    locale: 'it-IT', storageState: '/tmp/bianco-e2e-auth.json', ignoreHTTPSErrors: true
  })
  try {
    const other = await second.newPage()
    await other.goto('/')
    await expect.poll(() => other.locator('.app-shell').evaluate(
      (element, receiptId) => window.Alpine.$data(element).receipts.some((receipt) => receipt.id === receiptId), id
    )).toBe(true)
    await openReceipt(other, id)
    const otherDetail = other.getByRole('dialog', { name: 'Controlla lo scontrino' })
    await otherDetail.getByLabel('Esercente', { exact: true }).fill('Remote change')
    await otherDetail.getByLabel('Totale (EUR)', { exact: true }).fill('8.00')
    await otherDetail.getByRole('button', { name: 'Salva', exact: true }).click()
    await expect(otherDetail).not.toBeVisible()
    await expect.poll(async () => (await (await context.request.get(`/api/sync/receipt-aggregates/${id}`)).json()).receipt.totalMinor).toBe(800)
    faultProxy.setMode('online')
    await expect.poll(() => page.locator('.app-shell').evaluate(
      (element) => window.Alpine.$data(element).receiptEdits[0]?.status
    ), { timeout: 20_000 }).toBe('conflict')
    await page.reload()
    await expect.poll(() => appState(page, 'ready')).toBe(true)
    await openReceipt(page, id)
    await expect(detail.getByLabel('Esercente', { exact: true })).toHaveValue('Local draft')
    await expect(detail.getByLabel('Totale (EUR)', { exact: true })).toHaveValue('4.00')
    expect((await (await context.request.get(`/api/sync/receipt-aggregates/${id}`)).json()).receipt.totalMinor).toBe(800)
    await detail.getByRole('button', { name: 'Carica versione sincronizzata', exact: true }).click()
    await page.getByRole('dialog', { name: 'Carica versione sincronizzata', exact: true })
      .getByRole('button', { name: 'Carica versione sincronizzata', exact: true }).click()
    await expect(detail.getByLabel('Esercente', { exact: true })).toHaveValue('Remote change')
    await expect.poll(() => appState(page, 'edits')).toBe(0)
  } finally {
    await second.close()
  }
})
