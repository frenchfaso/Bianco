import { createId, getDeviceId, nowIso } from '../utils/ids.js'
import { ReceiptAggregateConflictError, buildReceiptAggregateUpdate, receiptAggregateMatches } from '../sync/receipt-aggregates.js'
import { z } from 'zod'

const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
const category = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
const editableUpdate = z.object({
  baseRevision: z.number().int().min(0),
  updatedByDevice: z.string().min(1).max(128),
  receipt: z.object({
    merchantNormalized: z.string().max(300).nullable(),
    transactionDate: z.iso.date().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    subtotalMinor: amount, taxMinor: amount, discountMinor: amount, totalMinor: amount,
    categoryId: category
  }),
  items: z.array(z.object({
    id, normalizedName: z.string().min(1).max(300),
    quantity: z.number().min(0).max(1_000_000).nullable(),
    unitPriceMinor: amount, totalPriceMinor: amount, categoryId: category
  })).max(500)
}).refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length)

// A single local document is the commit point for the receipt AND its items.
// This collection is never sent through per-document LWW replication.
export async function queueReceiptEdit(db, { receiptId, editId = null, baseRevision, baseSnapshot, displayedSnapshot, receipt, items }) {
  const update = editableUpdate.parse(buildReceiptAggregateUpdate({
    baseRevision: baseRevision ?? 0, updatedByDevice: getDeviceId(), receipt, items
  }))
  const values = {
    id: receiptId,
    editId: createId(),
    baseRevision: baseRevision ?? null,
    baseSnapshot: JSON.stringify(baseSnapshot),
    update: JSON.stringify(update),
    status: 'pending',
    updatedAt: nowIso()
  }
  const existing = await db.receipt_edits.findOne(receiptId).exec()
  if (existing) {
    await existing.incrementalModify((current) => {
      if (current._deleted || current.editId !== editId || current.status === 'conflict') throw new ReceiptAggregateConflictError()
      return { ...current, ...values, baseRevision: current.baseRevision, baseSnapshot: current.baseSnapshot }
    })
  } else {
    if (editId) {
      // A background acknowledgement may have cleared the draft while its form
      // was open. Continue only if the canonical state still matches that form.
      const currentReceipt = await db.receipts.findOne(receiptId).exec()
      const currentItems = await db.receipt_items.find({ selector: { receiptId }, sort: [{ position: 'asc' }] }).exec()
      if (!receiptAggregateMatches(displayedSnapshot, {
        receipt: currentReceipt?.toJSON(), items: currentItems.map((item) => item.toJSON())
      })) throw new ReceiptAggregateConflictError()
      values.baseRevision = null
      values.baseSnapshot = JSON.stringify(displayedSnapshot)
    }
    try {
      await db.receipt_edits.insert(values)
    } catch (error) {
      if (await db.receipt_edits.findOne(receiptId).exec()) throw new ReceiptAggregateConflictError()
      throw error
    }
  }
  return values.editId
}

export function overlayReceiptEdits(receipts, items, edits) {
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  let visibleItems = items
  for (const edit of edits) {
    const original = receiptById.get(edit.id)
    if (!original) continue
    const update = JSON.parse(edit.update)
    receiptById.set(edit.id, {
      ...original, ...update.receipt, status: 'confirmed', userConfirmed: true,
      updatedAt: edit.updatedAt, updatedByDevice: update.updatedByDevice
    })
    const originalItems = new Map(items.filter((item) => item.receiptId === edit.id).map((item) => [item.id, item]))
    visibleItems = visibleItems.filter((item) => item.receiptId !== edit.id).concat(update.items.map((item, position) => ({
      rawName: item.normalizedName, confidence: null,
      ...originalItems.get(item.id), ...item, receiptId: edit.id, position, userEdited: true,
      updatedAt: edit.updatedAt, updatedByDevice: update.updatedByDevice
    })))
  }
  return { receipts: [...receiptById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), items: visibleItems }
}
