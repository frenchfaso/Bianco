import { describe, expect, it, vi } from 'vitest'
import { compareDocuments, createConflictHandler } from '../src/sync/conflicts.js'

describe('last-write-wins conflict handler', () => {
  it('orders by updatedAt and then updatedByDevice', () => {
    expect(compareDocuments(
      { updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'a' },
      { updatedAt: '2026-07-14T09:00:00Z', updatedByDevice: 'z' }
    )).toBeGreaterThan(0)
    expect(compareDocuments(
      { updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'b' },
      { updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'a' }
    )).toBeGreaterThan(0)
  })

  it('returns the deterministic winner and records an audit event', async () => {
    const insert = vi.fn().mockResolvedValue(undefined)
    const handler = createConflictHandler('receipts', () => ({ insert }))
    const winner = handler.resolve({
      newDocumentState: { id: 'r1', updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'a' },
      realMasterState: { id: 'r1', updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'b' }
    })
    expect(winner.updatedByDevice).toBe('b')
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce())
    expect(insert.mock.calls[0][0]).toMatchObject({ type: 'sync-conflict', collection: 'receipts', winnerDevice: 'b' })
  })
})
