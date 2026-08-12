import { describe, expect, it } from 'vitest'
import { computeInsights, spendingSeries } from '../src/insights/compute.js'

const receipt = (id, date, total, category = 'food_grocery', merchant = 'Market') => ({
  id, transactionDate: date, totalMinor: total, categoryId: category,
  merchantNormalized: merchant, merchantRaw: merchant, status: 'confirmed'
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
})
