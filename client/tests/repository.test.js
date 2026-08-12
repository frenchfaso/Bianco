import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRxPlugin, createRxDatabase } from 'rxdb'
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { collections } from '../src/db/schemas.js'
import { getImageBlob } from '../src/images/repository.js'
import { applyReceiptAggregate, createCapturedReceipt, createManualReceipt, deleteReceipt, replaceReceiptItems, updateReceipt } from '../src/stores/receipts.js'

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

  it('updates an existing item without losing its replicated identity', async () => {
    const id = await createManualReceipt(db)
    await replaceReceiptItems(db, id, [{
      id: 'item-1',
      rawName: 'PANE',
      normalizedName: 'Pane',
      quantity: 1,
      unitPriceMinor: 250,
      totalPriceMinor: 250,
      categoryId: 'food_grocery'
    }])

    await replaceReceiptItems(db, id, [{
      id: 'item-1',
      rawName: 'PANE BIO',
      normalizedName: 'Pane biologico',
      quantity: 2,
      unitPriceMinor: 225,
      totalPriceMinor: 450,
      categoryId: 'food_grocery'
    }], true)

    const items = await db.receipt_items.find({ selector: { receiptId: id } }).exec()
    expect(items).toHaveLength(1)
    expect(items[0].toJSON()).toMatchObject({
      id: 'item-1',
      normalizedName: 'Pane biologico',
      quantity: 2,
      unitPriceMinor: 225,
      totalPriceMinor: 450,
      categoryId: 'food_grocery',
      userEdited: true
    })
  })

  it('applies the server aggregate without replacing its revision metadata', async () => {
    const id = await createManualReceipt(db)
    await replaceReceiptItems(db, id, [{ id: 'old-item', normalizedName: 'Old' }])
    const original = (await db.receipts.findOne(id).exec()).toJSON()
    await applyReceiptAggregate(db, {
      revision: 3,
      receipt: {
        ...original,
        status: 'confirmed',
        merchantRaw: 'MERCATO',
        merchantNormalized: 'Mercato',
        totalMinor: 500,
        userConfirmed: true,
        updatedAt: '2026-08-12T10:00:00.000Z',
        updatedByDevice: 'server-device'
      },
      items: [{
        id: 'new-item',
        receiptId: id,
        rawName: 'PANE',
        normalizedName: 'Pane',
        quantity: 1,
        unitPriceMinor: 500,
        totalPriceMinor: 500,
        categoryId: 'food_grocery',
        confidence: null,
        position: 0,
        userEdited: true,
        updatedAt: '2026-08-12T10:00:00.000Z',
        updatedByDevice: 'server-device'
      }]
    })

    const receipt = await db.receipts.findOne(id).exec()
    const items = await db.receipt_items.find({ selector: { receiptId: id } }).exec()
    expect(receipt.toJSON()).toMatchObject({
      merchantNormalized: 'Mercato',
      totalMinor: 500,
      updatedAt: '2026-08-12T10:00:00.000Z',
      updatedByDevice: 'server-device'
    })
    expect(items.map((item) => item.id)).toEqual(['new-item'])
    expect(items[0].updatedByDevice).toBe('server-device')
  })

  it('persists full and thumbnail image attachments locally', async () => {
    const full = new Blob(['full-image'], { type: 'image/webp' })
    const thumbnail = new Blob(['thumbnail'], { type: 'image/webp' })
    const hash = 'a'.repeat(64)
    const id = await createCapturedReceipt(db, {
      full,
      thumbnail,
      width: 1200,
      height: 1800,
      hash,
      mimeType: 'image/webp'
    })

    const receipt = await db.receipts.findOne(id).exec()
    const storedFull = await getImageBlob(db, hash, 'full')
    const storedThumbnail = await getImageBlob(db, hash, 'thumbnail')
    expect(receipt.imageHash).toBe(hash)
    expect(receipt.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((await db.images.findOne(hash).exec()).mimeType).toBe('image/webp')
    expect(storedFull.type).toBe('image/webp')
    expect(storedThumbnail.type).toBe('image/webp')
    expect(await storedFull.text()).toBe('full-image')
    expect(await storedThumbnail.text()).toBe('thumbnail')
  })

  it('reuses content-addressed images and removes them after the last receipt reference', async () => {
    const processed = {
      full: new Blob(['same-full'], { type: 'image/webp' }),
      thumbnail: new Blob(['same-thumbnail'], { type: 'image/webp' }),
      width: 1200,
      height: 1800,
      hash: 'b'.repeat(64),
      mimeType: 'image/webp'
    }
    const first = await createCapturedReceipt(db, processed)
    const second = await createCapturedReceipt(db, processed)

    expect(await db.images.find().exec()).toHaveLength(1)
    await deleteReceipt(db, first)
    expect(await db.images.findOne(processed.hash).exec()).not.toBeNull()
    await deleteReceipt(db, second)
    expect(await db.images.findOne(processed.hash).exec()).toBeNull()
  })
})
