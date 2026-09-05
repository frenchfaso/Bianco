import { applyReceiptAggregate } from '../stores/receipts.js'
import {
  getReceiptAggregate, putReceiptAggregate, receiptAggregateMatches,
  receiptAggregateEditableSnapshot, isReceiptAggregateConflict, isReceiptServerUnavailable
} from './receipt-aggregates.js'

const running = new WeakMap()

export function withReceiptEditLock(db, callback) {
  return globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request(`bianco-receipt-edits-${db.name}`, callback)
    : callback()
}

async function flushEdit(db, document) {
  const edit = document.toJSON()
  if (edit.status !== 'pending') return edit.status
  const update = JSON.parse(edit.update)
  try {
    let aggregate = await getReceiptAggregate(edit.id)
    const alreadyCommitted = aggregate.receipt.userConfirmed && receiptAggregateMatches(
      { receipt: update.receipt, items: update.items }, aggregate
    )
    if (!alreadyCommitted) {
      if (edit.baseRevision === null) {
        if (!receiptAggregateMatches(JSON.parse(edit.baseSnapshot), aggregate)) {
          await document.incrementalModify((current) => current.editId === edit.editId
            ? { ...current, status: 'conflict' } : current)
          return 'conflict'
        }
        update.baseRevision = aggregate.revision
      } else update.baseRevision = edit.baseRevision
      aggregate = await putReceiptAggregate(edit.id, update)
    }
    // If the response was lost, GET above recognizes the exact committed edit.
    // Keep the durable draft until all canonical local documents are applied.
    await applyReceiptAggregate(db, aggregate)
    await document.incrementalModify((current) => current.editId === edit.editId
      ? { ...current, _deleted: true }
      : { ...current, baseRevision: aggregate.revision,
          baseSnapshot: JSON.stringify(receiptAggregateEditableSnapshot(aggregate.receipt, aggregate.items)) })
    return 'synced'
  } catch (error) {
    // A newly created local receipt may still be travelling through replication.
    // A known server receipt returning 404 is NOT silently recreated.
    if (isReceiptServerUnavailable(error) || (error?.code === '404' && edit.baseRevision === null)) return 'pending'
    // Storage/quota failures after a successful remote commit leave the draft
    // pending; the next run can acknowledge the same server state and retry.
    if (!isReceiptAggregateConflict(error) && !/^\d{3}$/.test(String(error?.code || ''))) throw error
    const status = isReceiptAggregateConflict(error) ? 'conflict' : 'rejected'
    await document.incrementalModify((current) => current.editId === edit.editId
      ? { ...current, status } : current)
    return status
  }
}

export async function flushReceiptEdits(db) {
  if (running.has(db)) return running.get(db)
  const flush = async () => {
    const results = new Map()
    for (const edit of await db.receipt_edits.find().exec()) {
      if (globalThis.navigator?.onLine === false) break
      results.set(edit.id, await flushEdit(db, edit))
      if (results.get(edit.id) === 'pending') break
    }
    return results
  }
  // Web Locks serializes tabs. With no Locks API, the server's atomic revision
  // check still rejects competing writes; acknowledgement is idempotent.
  const promise = withReceiptEditLock(db, flush)
  running.set(db, promise)
  try { return await promise } finally { running.delete(db) }
}
