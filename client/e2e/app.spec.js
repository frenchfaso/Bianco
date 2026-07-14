import { expect, test } from '@playwright/test'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAwCAIAAAD/zu84AAAATElEQVR4nO3ToQ0AMAhE0dJ0aEZgaxA19UDSkH8KDM8c4u6rM7v1OgBASc67qGrVXTO7g/Bo8wFaBJAPLQIAmADwyQD50CIAAIAfgACqDCFTD90OXwAAAABJRU5ErkJggg==',
  'base64'
)

async function createManual(page, merchant, total) {
  await page.getByRole('button', { name: 'Archivio' }).click()
  await page.getByRole('button', { name: '+ Manuale' }).click()
  await page.getByLabel('Esercente').fill(merchant)
  await page.getByLabel('Totale (€)').fill(total)
  await page.getByRole('button', { name: 'Conferma', exact: true }).click()
  await page.getByLabel('Chiudi').click()
}

async function captureReceipt(page, merchant, total) {
  await page.getByRole('button', { name: 'Acquisisci' }).click()
  await page.locator('#gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: tinyPng
  })
  await expect(page.getByAltText('Anteprima dello scontrino')).toBeVisible()
  await page.getByRole('button', { name: 'Salva sul dispositivo' }).click()
  await expect(page.getByAltText('Fotografia dello scontrino')).toBeVisible()
  await page.getByLabel('Esercente').fill(merchant)
  await page.getByLabel('Totale (€)').fill(total)
  await page.getByRole('dialog').getByRole('combobox').selectOption('food_grocery')
  await page.getByRole('button', { name: 'Conferma', exact: true }).click()
  await page.getByLabel('Chiudi').click()
}

async function configureSync(page) {
  await page.getByRole('button', { name: 'Impostazioni' }).click()
  await page.getByRole('switch', { name: /Abilita backend/ }).check()
  await page.getByLabel('Token segreto').fill(process.env.BIANCO_TEST_TOKEN || 'test-token')
  await page.getByRole('button', { name: 'Salva e collega' }).click()
}

async function ensureOfflineControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

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
  await expect(reopened.getByAltText('Fotografia dello scontrino')).toBeVisible()
  await reopened.getByLabel('Chiudi').click()
  await reopened.getByRole('button', { name: 'Panoramica' }).click()
  const dashboard = reopened.getByRole('region', { name: 'Panoramica' })
  await expect(dashboard.getByText(/12,50/).first()).toBeVisible()
  await expect(dashboard.getByText('Spesa alimentare')).toBeVisible()
})

test('two browser contexts synchronize through pull/push and SSE', async ({ browser }) => {
  const merchant = `Mercato Sync ${Date.now()}`
  const first = await browser.newContext()
  const second = await browser.newContext()
  const pageA = await first.newPage()
  const pageB = await second.newPage()
  await Promise.all([pageA.goto('/'), pageB.goto('/')])
  await configureSync(pageA)
  await configureSync(pageB)
  await createManual(pageA, merchant, '23.40')
  await pageA.getByRole('button', { name: 'Panoramica' }).click()
  await pageA.getByRole('button', { name: 'Sincronizza' }).click()
  await pageB.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant)).toBeVisible({ timeout: 20_000 })
  await pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant).click()
  await second.setOffline(true)
  const editedMerchant = `${merchant} modificato`
  await pageB.getByLabel('Esercente').fill(editedMerchant)
  await pageB.getByRole('button', { name: 'Conferma', exact: true }).click()
  await pageB.getByLabel('Chiudi').click()
  await second.setOffline(false)
  await pageB.getByRole('button', { name: 'Panoramica' }).click()
  await pageB.getByRole('button', { name: 'Sincronizza' }).click()
  await pageA.getByRole('button', { name: 'Archivio' }).click()
  await expect(pageA.getByRole('region', { name: 'Archivio' }).getByText(editedMerchant)).toBeVisible({ timeout: 20_000 })
  await Promise.all([first.close(), second.close()])
})

test('receipt images upload by hash and download lazily on another device', async ({ browser }) => {
  const merchant = `Foto Sync ${Date.now()}`
  const first = await browser.newContext()
  const second = await browser.newContext()
  const pageA = await first.newPage()
  const pageB = await second.newPage()
  await Promise.all([pageA.goto('/'), pageB.goto('/')])
  await configureSync(pageA)
  await configureSync(pageB)
  await captureReceipt(pageA, merchant, '7.80')
  await pageA.getByRole('button', { name: 'Panoramica' }).click()
  await pageA.getByRole('button', { name: 'Sincronizza' }).click()

  const origin = new URL(pageA.url()).origin
  const headers = { Authorization: `Bearer ${process.env.BIANCO_TEST_TOKEN || 'test-token'}` }
  await expect.poll(async () => {
    const pull = await pageA.request.post(`${origin}/api/sync/receipts/pull`, {
      headers,
      data: { checkpoint: { sequence: 0 }, batchSize: 500 }
    })
    const documents = (await pull.json()).documents
    const receipt = documents.find((entry) => entry.merchantNormalized === merchant)
    if (!receipt?.imageHash) return false
    const image = await pageA.request.get(`${origin}/api/files/${receipt.imageHash}?variant=thumbnail`, { headers })
    return image.ok()
  }, { timeout: 20_000 }).toBe(true)

  await pageB.getByRole('button', { name: 'Archivio' }).click()
  const remoteReceipt = pageB.getByRole('region', { name: 'Archivio' }).getByText(merchant)
  await expect(remoteReceipt).toBeVisible({ timeout: 20_000 })
  await remoteReceipt.click()
  await expect(pageB.getByAltText('Fotografia dello scontrino')).toBeVisible({ timeout: 20_000 })
  await pageB.getByRole('button', { name: /Apri immagine completa/ }).click()
  await expect(pageB.getByText('Immagine completa conservata localmente')).toBeVisible()
  await pageB.getByLabel('Chiudi').click()
  await second.setOffline(true)
  await remoteReceipt.click()
  await pageB.getByRole('button', { name: /Apri immagine completa/ }).click()
  await expect(pageB.getByText('Immagine completa conservata localmente')).toBeVisible()
  await Promise.all([first.close(), second.close()])
})
