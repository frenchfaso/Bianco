import { describe, expect, it, vi } from 'vitest'
import { compareDocuments, createConflictHandler, documentsAreEqual } from '../src/sync/conflicts.js'

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

  it('orders equivalent ISO representations chronologically, not lexicographically', () => {
    expect(compareDocuments(
      { updatedAt: '2099-01-02T00:00:00.001000Z', updatedByDevice: 'a' },
      { updatedAt: '2099-01-02T00:00:00Z', updatedByDevice: 'z' }
    )).toBeGreaterThan(0)
    expect(compareDocuments(
      { updatedAt: '2026-08-12T10:00:01Z', updatedByDevice: 'a' },
      { updatedAt: '2026-08-12T12:00:00+02:00', updatedByDevice: 'z' }
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

  it('prefers the master document when write metadata ties', () => {
    const handler = createConflictHandler('receipt_items', () => ({ insert: vi.fn().mockResolvedValue(undefined) }))
    const local = {
      id: 'i1',
      rawName: 'local stale value',
      updatedAt: '2026-07-14T10:00:00Z',
      updatedByDevice: 'device-a'
    }
    const remote = {
      id: 'i1',
      rawName: 'master value',
      updatedAt: '2026-07-14T10:00:00Z',
      updatedByDevice: 'device-a'
    }

    expect(handler.resolve({ newDocumentState: local, realMasterState: remote })).toBe(remote)
  })

  it('still keeps a genuinely newer local edit', () => {
    const handler = createConflictHandler('receipt_items', () => ({ insert: vi.fn().mockResolvedValue(undefined) }))
    const local = { id: 'i1', updatedAt: '2026-07-14T10:01:00Z', updatedByDevice: 'device-a' }
    const remote = { id: 'i1', updatedAt: '2026-07-14T10:00:00Z', updatedByDevice: 'device-b' }

    expect(handler.resolve({ newDocumentState: local, realMasterState: remote })).toBe(local)
  })

  it('treats equivalent documents with a different key order as equal', () => {
    expect(documentsAreEqual(
      { id: 'i1', nested: { quantity: 2, unit: 'piece' } },
      { nested: { unit: 'piece', quantity: 2 }, id: 'i1' }
    )).toBe(true)
  })
})
