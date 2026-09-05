import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRxPlugin, createRxDatabase } from 'rxdb'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { collections } from '../src/db/schemas.js'
import { createManualReceipt, getReceiptDetail } from '../src/stores/receipts.js'
import { queueReceiptEdit } from '../src/stores/receipt-edits.js'
import { flushReceiptEdits } from '../src/sync/receipt-edit-queue.js'
import { getReceiptAggregate, receiptAggregateEditableSnapshot, ReceiptTransportError } from '../src/sync/receipt-aggregates.js'

addRxPlugin(RxDBMigrationSchemaPlugin)

describe('durable receipt aggregate edits', () => {
  let db, receipt, base, fetchMock
  const items = [{ id: 'product-1', normalizedName: 'Pane', quantity: 2, unitPriceMinor: 150, totalPriceMinor: 300, categoryId: 'food_grocery' }]
  const response = (data, status = 200) => new globalThis.Response(JSON.stringify(data), { status })
  const edit = (overrides = {}) => queueReceiptEdit(db, {
    receiptId: receipt.id, baseRevision: 3, baseSnapshot: base,
    receipt: { ...receipt, merchantNormalized: 'Mercato offline', totalMinor: 300 }, items, ...overrides
  })
  const committed = () => ({
    revision: 5,
    receipt: { ...receipt, merchantNormalized: 'Mercato offline', totalMinor: 300,
      status: 'confirmed', userConfirmed: true, updatedAt: '2026-09-05T15:00:00.000Z' },
    items: items.map((item) => ({ ...item, receiptId: receipt.id, rawName: item.normalizedName,
      confidence: null, position: 0, userEdited: true, updatedByDevice: receipt.updatedByDevice,
      updatedAt: '2026-09-05T15:00:00.000Z' }))
  })

  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'test-device', setItem: () => {} })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { location: { pathname: '/', search: '', hash: '', assign: vi.fn() } })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    db = await createRxDatabase({ name: `edits${crypto.randomUUID().replaceAll('-', '')}`, storage: getRxStorageMemory() })
    await db.addCollections({ receipts: collections.receipts, receipt_items: collections.receipt_items, receipt_edits: collections.receipt_edits })
    const id = await createManualReceipt(db)
    receipt = (await db.receipts.findOne(id).exec()).toJSON()
    base = receiptAggregateEditableSnapshot(receipt, [])
  })
  afterEach(async () => {
    vi.useRealTimers()
    await db.remove()
    vi.unstubAllGlobals()
  })

  it('saves receipt and products together while leaving replicated master documents untouched', async () => {
    await edit()
    fetchMock.mockRejectedValue(new TypeError('Load failed'))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('pending')
    const saved = await getReceiptDetail(db, receipt.id)
    expect(saved.receipt).toMatchObject({ merchantNormalized: 'Mercato offline', totalMinor: 300 })
    expect(saved.items).toMatchObject(items)
    expect((await db.receipts.findOne(receipt.id).exec()).totalMinor).toBeNull()
    expect(await db.receipt_items.find().exec()).toHaveLength(0)
    expect((await db.receipt_edits.findOne(receipt.id).exec()).baseRevision).toBe(3)
  })

  it('does no network work in airplane mode and resumes atomically after reconnection', async () => {
    navigator.onLine = false
    await edit({ baseRevision: null })
    await flushReceiptEdits(db)
    expect(fetchMock).not.toHaveBeenCalled()
    navigator.onLine = true
    fetchMock.mockResolvedValueOnce(response({ revision: 3, receipt, items: [] }))
      .mockResolvedValueOnce(response(committed()))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('synced')
    expect(await db.receipt_edits.find().exec()).toHaveLength(0)
    expect((await getReceiptDetail(db, receipt.id)).items).toMatchObject(items)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(3)
    await flushReceiptEdits(db)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('recognizes a committed PUT whose response was lost without duplicating it', async () => {
    await edit()
    fetchMock.mockResolvedValueOnce(response({ revision: 3, receipt, items: [] }))
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(response(committed()))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('pending')
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('synced')
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1)
    expect(await db.receipt_items.find().exec()).toHaveLength(1)
  })

  it('preserves the original revision and draft on a 409 without using LWW push', async () => {
    await edit()
    fetchMock.mockResolvedValueOnce(response({ revision: 8, receipt, items: [] }))
      .mockResolvedValueOnce(response({ detail: { aggregate: { revision: 8, receipt, items: [] } } }, 409))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('conflict')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(3)
    expect((await db.receipts.findOne(receipt.id).exec()).totalMinor).toBeNull()
    expect((await getReceiptDetail(db, receipt.id)).receipt.totalMinor).toBe(300)
    await flushReceiptEdits(db)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('detects a changed server snapshot when the offline draft has no revision yet', async () => {
    await edit({ baseRevision: null })
    fetchMock.mockResolvedValue(response({ revision: 8, receipt: { ...receipt, totalMinor: 999 }, items: [] }))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('conflict')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403, 422])('retains a blocked draft after HTTP %s, with no fallback replication', async (status) => {
    await edit()
    fetchMock.mockResolvedValueOnce(response({ revision: 3, receipt, items: [] }))
      .mockResolvedValueOnce(response({ detail: 'rejected' }, status))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('rejected')
    expect((await db.receipts.findOne(receipt.id).exec()).userConfirmed).toBe(false)
    expect(await db.receipt_items.find().exec()).toHaveLength(0)
    expect((await getReceiptDetail(db, receipt.id)).items).toHaveLength(1)
    if (status === 401) expect(window.location.assign).toHaveBeenCalled()
  })

  it('waits for a new receipt to replicate but does not recreate a known missing receipt', async () => {
    const token = await edit({ baseRevision: null })
    fetchMock.mockResolvedValue(response({ detail: 'not found' }, 404))
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('pending')
    const doc = await db.receipt_edits.findOne(receipt.id).exec()
    await doc.incrementalPatch({ baseRevision: 3 })
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('rejected')
    expect((await db.receipt_edits.findOne(receipt.id).exec()).editId).toBe(token)
  })

  it('does not erase a newer local edit when an earlier request completes', async () => {
    const token = await edit()
    fetchMock.mockResolvedValueOnce(response({ revision: 3, receipt, items: [] }))
      .mockImplementationOnce(async () => {
        await edit({ editId: token, receipt: { ...receipt, merchantNormalized: 'Second edit', totalMinor: 400 } })
        return response(committed())
      })
    await flushReceiptEdits(db)
    const saved = await getReceiptDetail(db, receipt.id)
    expect(saved.receipt.merchantNormalized).toBe('Second edit')
    expect(saved.edit.baseRevision).toBe(5)
  })

  it('rejects a stale tab overwriting another local draft', async () => {
    await edit()
    await expect(edit()).rejects.toMatchObject({ name: 'ReceiptAggregateConflictError' })
  })

  it('can edit again after acknowledgement, including a form opened before it completed', async () => {
    const token = await edit()
    const shown = await getReceiptDetail(db, receipt.id)
    fetchMock.mockResolvedValueOnce(response(committed()))
    await flushReceiptEdits(db)
    await edit({ editId: token, displayedSnapshot: receiptAggregateEditableSnapshot(shown.receipt, shown.items) })
    expect(await db.receipt_edits.find().exec()).toHaveLength(1)
    expect((await db.receipt_edits.findOne(receipt.id).exec()).baseRevision).toBeNull()
  })

  it('retains the draft if local materialization fails after the server commit', async () => {
    await edit()
    fetchMock.mockImplementation(() => Promise.resolve(response(committed())))
    const insert = vi.spyOn(db.receipt_items, 'bulkInsert').mockResolvedValueOnce({ error: [new Error('quota')] })
    await expect(flushReceiptEdits(db)).rejects.toThrow('Receipt items could not be stored')
    expect((await db.receipt_edits.findOne(receipt.id).exec()).status).toBe('pending')
    expect((await getReceiptDetail(db, receipt.id)).items).toHaveLength(1)
    insert.mockRestore()
    expect((await flushReceiptEdits(db)).get(receipt.id)).toBe('synced')
  })

  it('validates the offline payload before persisting it', async () => {
    await expect(edit({ items: [{ ...items[0], quantity: Infinity }] })).rejects.toThrow()
    await expect(edit({ receipt: { ...receipt, currency: 'EU' } })).rejects.toThrow()
    expect(await db.receipt_edits.find().exec()).toHaveLength(0)
  })

  it('bounds an unresponsive request by a timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const result = getReceiptAggregate(receipt.id).catch((error) => error)
    await vi.advanceTimersByTimeAsync(5001)
    expect(await result).toBeInstanceOf(ReceiptTransportError)
  })
})
