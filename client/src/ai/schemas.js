import { z } from 'zod'

const nullableMinor = z.number().int().nonnegative().nullable()

export const extractedItemSchema = z.object({
  rawName: z.string(),
  normalizedName: z.string(),
  quantity: z.number().nonnegative().nullable(),
  unitPriceMinor: nullableMinor,
  totalPriceMinor: nullableMinor,
  categoryId: z.string(),
  confidence: z.number().min(0).max(1).nullable()
})

export const receiptExtractionSchema = z.object({
  schemaVersion: z.literal(1),
  documentType: z.literal('receipt'),
  merchant: z.object({
    rawName: z.string().nullable(),
    normalizedName: z.string().nullable()
  }),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().length(3),
  subtotalMinor: nullableMinor,
  taxMinor: nullableMinor,
  discountMinor: nullableMinor,
  totalMinor: nullableMinor,
  categoryId: z.string(),
  items: z.array(extractedItemSchema).max(250),
  confidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string())
})

export const generatedInsightsSchema = z.object({
  observations: z.array(z.string()).max(3),
  suggestion: z.string().nullable()
})
