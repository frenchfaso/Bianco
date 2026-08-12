import { createId, nowIso } from '../utils/ids.js'

export function compareDocuments(left, right) {
  const leftTimestamp = Date.parse(left.updatedAt || '')
  const rightTimestamp = Date.parse(right.updatedAt || '')
  const timeComparison = Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)
    ? leftTimestamp - rightTimestamp
    : String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''))
  if (timeComparison !== 0) return timeComparison
  return String(left.updatedByDevice || '').localeCompare(String(right.updatedByDevice || ''))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  )
}

export function documentsAreEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

export function createConflictHandler(collectionName, getAuditCollection) {
  return {
    isEqual(left, right) {
      return documentsAreEqual(left, right)
    },
    resolve(input) {
      const local = input.newDocumentState
      const remote = input.realMasterState
      // Equal write metadata means that the local document is not a newer edit.
      // Prefer the master's exact representation so the replication can converge
      // instead of pushing a structurally different document forever.
      const winner = compareDocuments(local, remote) > 0 ? local : remote
      void getAuditCollection().insert({
        id: createId(),
        type: 'sync-conflict',
        collection: collectionName,
        documentId: winner.id,
        resolvedAt: nowIso(),
        winnerDevice: winner.updatedByDevice || ''
      }).catch(() => {})
      return winner
    }
  }
}
