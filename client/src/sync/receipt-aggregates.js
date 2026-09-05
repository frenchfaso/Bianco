import { apiFetch } from './api.js'

export class ReceiptTransportError extends Error {
  constructor(cause) {
    super('Receipt server unavailable', { cause })
    this.name = 'ReceiptTransportError'
  }
}

async function aggregateRequest(path, options = {}) {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 5000)
  try {
    const response = await apiFetch(path, { ...options, signal: controller.signal })
    // Keep the deadline active while receiving the response body as well.
    return await response.json()
  } catch (error) {
    const hasHttpStatus = typeof error?.code === 'string' && /^\d{3}$/.test(error.code)
    if (!hasHttpStatus && (error instanceof TypeError || controller.signal.aborted)) {
      throw new ReceiptTransportError(error)
    }
    throw error
  } finally {
    globalThis.clearTimeout(timer)
  }
}

export function isReceiptServerUnavailable(error) {
  return error instanceof ReceiptTransportError || ['408', '429', '502', '503', '504'].includes(error?.code)
}

export class ReceiptAggregateConflictError extends Error {
  constructor(aggregate = null) {
    super('Receipt aggregate revision conflict')
    this.name = 'ReceiptAggregateConflictError'
    this.aggregate = aggregate
  }
}

export async function getReceiptAggregate(receiptId) {
  return aggregateRequest(`/api/sync/receipt-aggregates/${encodeURIComponent(receiptId)}`)
}

export async function putReceiptAggregate(receiptId, update) {
  try {
    return await aggregateRequest(`/api/sync/receipt-aggregates/${encodeURIComponent(receiptId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })
  } catch (error) {
    if (error?.code === '409') {
      throw new ReceiptAggregateConflictError(error.problem?.detail?.aggregate || null)
    }
    throw error
  }
}

export function receiptAggregateEditableSnapshot(receipt, items) {
  return {
    receipt: {
      merchantNormalized: receipt.merchantNormalized || null,
      transactionDate: receipt.transactionDate || null,
      currency: (receipt.currency || 'EUR').toUpperCase(),
      subtotalMinor: receipt.subtotalMinor ?? null,
      taxMinor: receipt.taxMinor ?? null,
      discountMinor: receipt.discountMinor ?? null,
      totalMinor: receipt.totalMinor ?? null,
      categoryId: receipt.categoryId || 'other'
    },
    items: items.map((item) => ({
      id: item.id,
      normalizedName: item.normalizedName || item.rawName || '',
      quantity: item.quantity ?? null,
      unitPriceMinor: item.unitPriceMinor ?? null,
      totalPriceMinor: item.totalPriceMinor ?? null,
      categoryId: item.categoryId || 'other'
    }))
  }
}

export function buildReceiptAggregateUpdate({ baseRevision, updatedByDevice, receipt, items }) {
  return {
    baseRevision,
    updatedByDevice,
    ...receiptAggregateEditableSnapshot(receipt, items)
  }
}

export function receiptAggregateMatches(snapshot, aggregate) {
  if (!snapshot || !aggregate?.receipt || !Array.isArray(aggregate.items)) return false
  return JSON.stringify(snapshot) === JSON.stringify(
    receiptAggregateEditableSnapshot(aggregate.receipt, aggregate.items)
  )
}

export function isReceiptAggregateConflict(error) {
  return error instanceof ReceiptAggregateConflictError
}
