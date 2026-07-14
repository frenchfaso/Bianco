import { createId, nowIso } from '../utils/ids.js'

export function compareDocuments(left, right) {
  const timeComparison = String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''))
  if (timeComparison !== 0) return timeComparison
  return String(left.updatedByDevice || '').localeCompare(String(right.updatedByDevice || ''))
}

export function createConflictHandler(collectionName, getAuditCollection) {
  return {
    isEqual(left, right) {
      return JSON.stringify(left) === JSON.stringify(right)
    },
    resolve(input) {
      const local = input.newDocumentState
      const remote = input.realMasterState
      const winner = compareDocuments(local, remote) >= 0 ? local : remote
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
