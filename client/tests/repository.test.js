import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRxPlugin, createRxDatabase } from 'rxdb'
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { collections } from '../src/db/schemas.js'
import { getImageBlob } from '../src/images/repository.js'
import { createCapturedReceipt, createManualReceipt, replaceReceiptItems, updateReceipt } from '../src/stores/receipts.js'

addRxPlugin(RxDBAttachmentsPlugin)
addRxPlugin(RxDBMigrationSchemaPlugin)

const memory = new Map()
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key)
}

describe('RxDB repositories', () => {
  let db

  beforeEach(async () => {
    db = await createRxDatabase({ name: `test${Date.now()}${Math.random().toString(16).slice(2)}`, storage: getRxStorageMemory() })
    await db.addCollections({
      receipts: collections.receipts,
      receipt_items: collections.receipt_items,
      images: collections.images,
      jobs: collections.jobs
    })
  })

  afterEach(async () => {
    await db.remove()
  })

  it('persists manual receipts and edited item rows locally', async () => {
    const id = await createManualReceipt(db)
    await updateReceipt(db, id, { merchantNormalized: 'Mercato', totalMinor: 1290 })
    await replaceReceiptItems(db, id, [{ normalizedName: 'Pane', totalPriceMinor: 1290 }], true)
    const saved = await db.receipts.findOne(id).exec()
    const items = await db.receipt_items.find({ selector: { receiptId: id } }).exec()
    expect(saved.merchantNormalized).toBe('Mercato')
    expect(saved.totalMinor).toBe(1290)
    expect(items).toHaveLength(1)
    expect(items[0].userEdited).toBe(true)
  })

  it('persists full and thumbnail image attachments locally', async () => {
    const full = new Blob(['full-image'], { type: 'image/jpeg' })
    const thumbnail = new Blob(['thumbnail'], { type: 'image/jpeg' })
    const hash = 'a'.repeat(64)
    const id = await createCapturedReceipt(db, {
      full,
      thumbnail,
      width: 1200,
      height: 1800,
      hash,
      mimeType: 'image/jpeg'
    })

    const receipt = await db.receipts.findOne(id).exec()
    const storedFull = await getImageBlob(db, hash, 'full')
    const storedThumbnail = await getImageBlob(db, hash, 'thumbnail')
    expect(receipt.imageHash).toBe(hash)
    expect(receipt.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(await storedFull.text()).toBe('full-image')
    expect(await storedThumbnail.text()).toBe('thumbnail')
  })
})
