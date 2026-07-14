import { describe, expect, it } from 'vitest'
import { receiptExtractionSchema } from '../src/ai/schemas.js'

const validExtraction = {
  schemaVersion: 1,
  documentType: 'receipt',
  merchant: { rawName: 'MARKET', normalizedName: 'Market' },
  transactionDate: '2026-07-13',
  currency: 'EUR',
  subtotalMinor: 1000,
  taxMinor: 100,
  discountMinor: 0,
  totalMinor: 1100,
  categoryId: 'food_grocery',
  items: [{
    rawName: 'LATTE', normalizedName: 'Latte', quantity: 1,
    unitPriceMinor: 1100, totalPriceMinor: 1100, categoryId: 'food_grocery', confidence: 0.9
  }],
  confidence: 0.92,
  warnings: []
}

describe('receiptExtractionSchema', () => {
  it('accepts the versioned item-level contract', () => {
    expect(receiptExtractionSchema.parse(validExtraction).items[0].normalizedName).toBe('Latte')
  })

  it('rejects invalid confidence and negative minor values', () => {
    expect(() => receiptExtractionSchema.parse({ ...validExtraction, confidence: 1.2 })).toThrow()
    expect(() => receiptExtractionSchema.parse({ ...validExtraction, totalMinor: -1 })).toThrow()
  })
})
