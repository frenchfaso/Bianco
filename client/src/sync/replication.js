import { replicateRxCollection } from 'rxdb/plugins/replication'
import { Subject } from 'rxjs'
import { apiFetch } from './api.js'

let active = null

async function parseSse(response, onResync, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const event of events) {
      const data = event.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
      if (data === 'RESYNC' || data === '"RESYNC"') onResync()
    }
  }
}

async function connectEvents(stream, controller) {
  while (!controller.signal.aborted) {
    try {
      const response = await apiFetch('/api/sync/events', { signal: controller.signal })
      await parseSse(response, () => stream.next('RESYNC'), controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      console.warn('SSE reconnect scheduled', error.message)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3000))
  }
}

function replicateCollection(collection, collectionName, stream) {
  return replicateRxCollection({
    collection,
    replicationIdentifier: `bianco-http-${collectionName}-v1`,
    live: true,
    retryTime: 5000,
    autoStart: true,
    pull: {
      batchSize: 100,
      stream$: stream.asObservable(),
      async handler(checkpoint, batchSize) {
        const response = await apiFetch(`/api/sync/${collectionName}/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkpoint: checkpoint || { sequence: 0 }, batchSize })
        })
        return response.json()
      }
    },
    push: {
      batchSize: 100,
      async handler(rows) {
        const response = await apiFetch(`/api/sync/${collectionName}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows })
        })
        return (await response.json()).conflicts
      }
    }
  })
}

export async function startReplication(db, onStatus = () => {}) {
  await stopReplication()
  const stream = new Subject()
  const controller = new AbortController()
  const states = [
    replicateCollection(db.receipts, 'receipts', stream),
    replicateCollection(db.receipt_items, 'receipt_items', stream)
  ]
  states.forEach((state) => {
    state.error$.subscribe((error) => {
      onStatus('error', error)
      console.warn('Replication error', error.message)
    })
    state.active$.subscribe((isActive) => onStatus(isActive ? 'syncing' : 'idle'))
  })
  active = { states, stream, controller }
  void connectEvents(stream, controller)
  onStatus('syncing')
  return active
}

export async function stopReplication() {
  if (!active) return
  active.controller.abort()
  active.stream.complete()
  await Promise.all(active.states.map((state) => state.cancel()))
  active = null
}

export function resyncNow() {
  active?.stream.next('RESYNC')
}
