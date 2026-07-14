import { describe, expect, it } from 'vitest'
import { computeInsights } from '../src/insights/compute.js'

const receipt = (id, date, total, category = 'food_grocery', merchant = 'Market') => ({
  id, transactionDate: date, totalMinor: total, categoryId: category,
  merchantNormalized: merchant, merchantRaw: merchant
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
    expect(result.priceChanges[0]).toMatchObject({ latest: 300, previousAverage: 200, changePercent: 50 })
    expect(result.deterministic.some((entry) => entry.type === 'category')).toBe(true)
  })

  it('suppresses deterministic deltas below configured thresholds', () => {
    const result = computeInsights([
      receipt('a', '2026-07-10', 1100), receipt('b', '2026-06-10', 1000)
    ], [], { now: new Date('2026-07-14T12:00:00'), minimumMinor: 1000, minimumPercent: 20 })
    expect(result.deterministic).toEqual([])
  })
})
