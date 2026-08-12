import { describe, expect, it } from 'vitest'
import { ReadableStream } from 'node:stream/web'
import { createReplicationStatusTracker, parseSse } from '../src/sync/replication.js'

function sseResponse(chunks) {
  const encoder = new TextEncoder()
  return { body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  }) }
}

describe('replication event stream', () => {
  it('parses sync and AI configuration events across chunk boundaries', async () => {
    const events = []
    const response = sseResponse([
      'event: change\ndata: RES',
      'YNC\n\nevent: change\r\ndata: "AI_CONFIGURATION_CHANGED"\r\n\r\n'
    ])

    await parseSse(response, (event) => events.push(event), new AbortController().signal)

    expect(events).toEqual(['RESYNC', 'AI_CONFIGURATION_CHANGED'])
  })

  it('does not report idle until both collections and SSE are idle and connected', () => {
    const statuses = []
    const tracker = createReplicationStatusTracker((status) => statuses.push(status))
    tracker.publish()
    tracker.collectionActive('receipts', true)
    tracker.collectionActive('receipt_items', true)
    tracker.transportConnected()
    tracker.collectionActive('receipts', false)
    expect(statuses.at(-1)).toBe('syncing')
    tracker.collectionActive('receipt_items', false)
    expect(statuses.at(-1)).toBe('idle')
    tracker.transportDisconnected()
    expect(statuses.at(-1)).toBe('error')
  })

  it('keeps collection failures visible until that collection retries or succeeds', () => {
    const statuses = []
    const tracker = createReplicationStatusTracker((status) => statuses.push(status))
    tracker.transportConnected()
    tracker.collectionError('receipts')
    expect(statuses.at(-1)).toBe('error')

    // Reconnecting SSE alone must not hide an unresolved RxDB push error.
    tracker.transportConnected()
    expect(statuses.at(-1)).toBe('error')

    tracker.collectionSuccess('receipt_items')
    expect(statuses.at(-1)).toBe('error')
    tracker.collectionSuccess('receipts')
    expect(statuses.at(-1)).toBe('idle')
  })
})
