import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildReceiptAggregateUpdate,
  getReceiptAggregate,
  isReceiptAggregateConflict,
  putReceiptAggregate,
  receiptAggregateEditableSnapshot,
  receiptAggregateMatches
} from '../src/sync/receipt-aggregates.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('receipt aggregate API', () => {
  it('matches the revision only to the editable state shown in the form', () => {
    const receipt = {
      merchantNormalized: 'Mercato',
      transactionDate: '2026-08-12',
      currency: 'EUR',
      subtotalMinor: null,
      taxMinor: null,
      discountMinor: null,
      totalMinor: 500,
      categoryId: 'food_grocery'
    }
    const items = [{
      id: 'item-1',
      rawName: 'PANE',
      normalizedName: 'Pane',
      quantity: 1,
      unitPriceMinor: 500,
      totalPriceMinor: 500,
      categoryId: 'food_grocery'
    }]
    const snapshot = receiptAggregateEditableSnapshot(receipt, items)
    expect(receiptAggregateMatches(snapshot, {
      receipt: { ...receipt, status: 'confirmed', imageHash: 'ignored' },
      items: [{ ...items[0], confidence: 0.9, userEdited: true }]
    })).toBe(true)
    expect(receiptAggregateMatches(snapshot, {
      receipt: { ...receipt, totalMinor: 600 },
      items
    })).toBe(false)
  })

  it('loads a revision and sends only the editable aggregate fields', async () => {
    const aggregate = { revision: 4, receipt: { id: 'receipt/1' }, items: [] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify(aggregate), { status: 200 }))
      .mockResolvedValueOnce(new globalThis.Response(JSON.stringify({ ...aggregate, revision: 5 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getReceiptAggregate('receipt/1')).resolves.toEqual(aggregate)
    const update = buildReceiptAggregateUpdate({
      baseRevision: 4,
      updatedByDevice: 'device-1',
      receipt: {
        merchantNormalized: 'Mercato',
        transactionDate: '2026-08-12',
        currency: 'eur',
        subtotalMinor: 900,
        taxMinor: 100,
        discountMinor: null,
        totalMinor: 1000,
        categoryId: 'food_grocery',
        imageHash: 'must-not-leave-the-client'
      },
      items: [{
        id: 'item-1',
        rawName: 'PANE',
        normalizedName: 'Pane',
        quantity: 2,
        unitPriceMinor: 250,
        totalPriceMinor: 500,
        categoryId: 'food_grocery',
        confidence: 0.2
      }]
    })
    await expect(putReceiptAggregate('receipt/1', update)).resolves.toMatchObject({ revision: 5 })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sync/receipt-aggregates/receipt%2F1')
    const [, request] = fetchMock.mock.calls[1]
    expect(request.method).toBe('PUT')
    expect(JSON.parse(request.body)).toEqual({
      baseRevision: 4,
      updatedByDevice: 'device-1',
      receipt: {
        merchantNormalized: 'Mercato',
        transactionDate: '2026-08-12',
        currency: 'EUR',
        subtotalMinor: 900,
        taxMinor: 100,
        discountMinor: null,
        totalMinor: 1000,
        categoryId: 'food_grocery'
      },
      items: [{
        id: 'item-1',
        normalizedName: 'Pane',
        quantity: 2,
        unitPriceMinor: 250,
        totalPriceMinor: 500,
        categoryId: 'food_grocery'
      }]
    })
  })

  it('turns a stale revision into a typed conflict while preserving the server aggregate', async () => {
    const current = { revision: 9, receipt: { id: 'receipt-1' }, items: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new globalThis.Response(JSON.stringify({
      detail: { code: 'revision_conflict', aggregate: current }
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })))

    let caught
    try {
      await putReceiptAggregate('receipt-1', { baseRevision: 8, receipt: {}, items: [] })
    } catch (error) {
      caught = error
    }
    expect(isReceiptAggregateConflict(caught)).toBe(true)
    expect(caught.aggregate).toEqual(current)
  })
})
