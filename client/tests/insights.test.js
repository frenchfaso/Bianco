import { describe, expect, it } from 'vitest'
import {
  computeInsights,
  insightSnapshot,
  spendingSeries,
  UNKNOWN_MERCHANT_ID
} from '../src/insights/compute.js'

const receipt = (id, date, total, category = 'food_grocery', merchant = 'Market') => ({
  id, transactionDate: date, totalMinor: total, categoryId: category,
  merchantNormalized: merchant, merchantRaw: merchant, status: 'confirmed', currency: 'EUR'
})

describe('computeInsights', () => {
  it('compares equivalent monthly periods and aggregates dimensions', () => {
    const receipts = [
      receipt('current', '2026-07-10', 4000),
      receipt('previous', '2026-06-10', 2000),
      receipt('future-previous', '2026-06-20', 9000)
    ]
    const items = [
      { receiptId: 'previous', normalizedName: 'Latte', rawName: '', totalPriceMinor: 2000, unitPriceMinor: 200, quantity: 1 },
      { receiptId: 'current', normalizedName: 'Latte', rawName: '', totalPriceMinor: 4000, unitPriceMinor: 300, quantity: 2 }
    ]
    const result = computeInsights(receipts, items, {
      now: new Date('2026-07-14T12:00:00'), minimumMinor: 1000, minimumPercent: 20
    })
    expect(result.total).toBe(4000)
    expect(result.previousTotal).toBe(2000)
    expect(result.changePercent).toBe(100)
    expect(result.categories[0].difference).toBe(2000)
    expect(result.products[0].frequency).toBe(1)
    expect(result.priceChanges).toEqual([])
    expect(result.deterministic.some((entry) => entry.type === 'category')).toBe(true)
  })

  it('keeps known item categories and assigns an unexplained residual to other', () => {
    const receipts = [receipt('mixed', '2026-07-12', 1200, 'other')]
    const items = [
      { receiptId: 'mixed', normalizedName: 'Pane', totalPriceMinor: 600, categoryId: 'food_grocery' },
      { receiptId: 'mixed', normalizedName: 'Sapone', totalPriceMinor: 400, categoryId: 'personal' }
    ]

    const result = computeInsights(receipts, items, { now: new Date('2026-07-15T12:00:00Z') })

    expect(result.categories.find((entry) => entry.id === 'food_grocery').total).toBe(600)
    expect(result.categories.find((entry) => entry.id === 'personal').total).toBe(400)
    expect(result.categories.find((entry) => entry.id === 'other').total).toBe(200)
    expect(result.categories.reduce((sum, entry) => sum + entry.total, 0)).toBe(1200)
  })

  it('suppresses deterministic deltas below configured thresholds', () => {
    const result = computeInsights([
      receipt('a', '2026-07-10', 1100), receipt('b', '2026-06-10', 1000)
    ], [], { now: new Date('2026-07-14T12:00:00'), minimumMinor: 1000, minimumPercent: 20 })
    expect(result.deterministic).toEqual([])
  })

  it('builds stable weekly and monthly spending buckets in minor units', () => {
    const receipts = [
      receipt('may', '2026-05-31', 1000),
      receipt('june', '2026-06-15', 2000),
      receipt('week-previous', '2026-07-13', 3000),
      receipt('week-current', '2026-07-20', 4000)
    ]
    const now = new Date('2026-07-21T12:00:00')

    expect(spendingSeries(receipts, 'month', now, 3)).toEqual([
      { start: '2026-05-01', total: 1000 },
      { start: '2026-06-01', total: 2000 },
      { start: '2026-07-01', total: 7000 }
    ])
    expect(spendingSeries(receipts, 'week', now, 2)).toEqual([
      { start: '2026-07-13', total: 3000 },
      { start: '2026-07-20', total: 4000 }
    ])
  })

  it('uses local calendar dates, includes today before noon and excludes unconfirmed AI data', () => {
    const result = computeInsights([
      receipt('today', '2026-07-14', 1200),
      { ...receipt('review', '2026-07-14', 9900), status: 'needs_review' },
      { ...receipt('failed', '2026-07-14', 8800), status: 'failed' }
    ], [], { now: new Date(2026, 6, 14, 9, 0, 0) })

    expect(result.total).toBe(1200)
    expect(result.period).toMatchObject({ start: '2026-07-01', end: '2026-07-14' })
  })

  it('keeps every aggregate in the default currency and reports excluded receipts', () => {
    const receipts = [
      receipt('eur-current', '2026-07-10', 4000, 'food_grocery', 'Euro Market'),
      receipt('eur-previous', '2026-06-10', 2000, 'food_grocery', 'Euro Market'),
      { ...receipt('usd-current', '2026-07-11', 999900, 'restaurant', 'Dollar Store'), currency: 'usd' },
      { ...receipt('usd-previous', '2026-06-11', 888800, 'restaurant', 'Dollar Store'), currency: 'USD' }
    ]
    const items = [
      {
        receiptId: 'eur-current', normalizedName: 'Pane', rawName: 'PANE', totalPriceMinor: 4000,
        unitPriceMinor: 4000, quantity: 1, categoryId: 'food_grocery'
      },
      {
        receiptId: 'usd-current', normalizedName: 'Burger', rawName: 'BURGER', totalPriceMinor: 999900,
        unitPriceMinor: 999900, quantity: 1, categoryId: 'restaurant'
      }
    ]

    const result = computeInsights(receipts, items, {
      now: new Date('2026-07-14T12:00:00Z'), defaultCurrency: 'eur'
    })

    expect(result).toMatchObject({ total: 4000, previousTotal: 2000, difference: 2000, excludedCurrencyCount: 2 })
    expect(result.categories.map((entry) => entry.id)).toEqual(['food_grocery'])
    expect(result.merchants.map((entry) => entry.id)).toEqual(['Euro Market'])
    expect(result.products.map((entry) => entry.id)).toEqual(['Pane'])
    expect(result.spending.monthly.at(-1).total).toBe(4000)
    expect(insightSnapshot(result).items.map((entry) => entry.id)).toEqual(['Pane'])
  })

  it('folds unknown legacy item and receipt categories into other', () => {
    const receipts = [
      receipt('with-item', '2026-07-10', 500, 'legacy_receipt'),
      receipt('fallback', '2026-07-11', 300, 'legacy_receipt')
    ]
    const items = [{ receiptId: 'with-item', totalPriceMinor: 500, categoryId: 'legacy_item' }]

    const result = computeInsights(receipts, items, { now: new Date('2026-07-14T12:00:00Z') })

    expect(result.categories).toEqual([
      expect.objectContaining({ id: 'other', total: 800, count: 2 })
    ])
  })

  it('only reports a price change after three exact and consistent observations', () => {
    const receipts = [
      receipt('a', '2026-05-10', 200),
      receipt('b', '2026-06-10', 200),
      receipt('c', '2026-07-10', 300)
    ]
    const item = (receiptId, price) => ({
      receiptId,
      normalizedName: 'Latte 1 l',
      rawName: 'LATTE 1L',
      categoryId: 'food_grocery',
      quantity: 1,
      unitPriceMinor: price,
      totalPriceMinor: price
    })

    expect(computeInsights(receipts.slice(1), [item('b', 200), item('c', 300)], {
      now: new Date(2026, 6, 14)
    }).priceChanges).toEqual([])
    expect(computeInsights(receipts, [item('a', 200), item('b', 200), item('c', 300)], {
      now: new Date(2026, 6, 14)
    }).priceChanges[0]).toMatchObject({ latest: 300, previousAverage: 200, changePercent: 50 })
  })

  it('counts product frequency by distinct receipt while summing lines', () => {
    const receipts = [receipt('same-receipt', '2026-07-10', 250)]
    const items = [
      {
        receiptId: 'same-receipt', normalizedName: 'Mele', rawName: 'MELE',
        totalPriceMinor: 100, quantity: 1, categoryId: 'food_grocery'
      },
      {
        receiptId: 'same-receipt', normalizedName: 'Mele', rawName: 'MELE',
        totalPriceMinor: 150, quantity: 2, categoryId: 'food_grocery'
      }
    ]

    const product = computeInsights(receipts, items, {
      now: new Date('2026-07-14T12:00:00Z')
    }).products[0]

    expect(product).toMatchObject({
      id: 'Mele', total: 250, quantity: 3, frequency: 1
    })
  })

  it('does not send the unknown-merchant sentinel to the AI', () => {
    const snapshot = insightSnapshot({
      period: {
        start: '2026-07-01', end: '2026-07-31',
        previousStart: '2026-06-01', previousEnd: '2026-06-30'
      },
      total: 100,
      previousTotal: 0,
      categories: [],
      merchants: [
        { id: UNKNOWN_MERCHANT_ID, total: 100 },
        { id: 'Known Market', total: 50 }
      ],
      products: [],
      priceChanges: []
    })

    expect(snapshot.merchants).toEqual([{ id: 'Known Market', total: 50 }])
  })

  it('bounds every collection sent to the AI insight endpoint', () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({ id: `entry-${index}` }))
    const snapshot = insightSnapshot({
      period: { start: '2026-07-01', end: '2026-07-31', previousStart: '2026-06-01', previousEnd: '2026-06-30' },
      total: 0,
      previousTotal: 0,
      categories: entries,
      merchants: entries,
      products: entries,
      priceChanges: entries
    })

    expect(snapshot.categories).toHaveLength(100)
    expect(snapshot.merchants).toHaveLength(100)
    expect(snapshot.items).toHaveLength(100)
    expect(snapshot.priceChanges).toHaveLength(100)
    expect(snapshot.categories.at(-1).id).toBe('entry-99')
  })
})
