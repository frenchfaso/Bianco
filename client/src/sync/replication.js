import { replicateRxCollection } from 'rxdb/plugins/replication'
import { Subject } from 'rxjs'
import { apiFetch } from './api.js'

let active = null
const REMOTE_CONNECTED_EVENT = 'REMOTE_CONNECTED'

export function createReplicationStatusTracker(onStatus = () => {}) {
  const activeCollections = new Map()
  const failedCollections = new Set()
  let transport = 'connecting'
  let lastStatus = null

  const publish = () => {
    let status
    if (transport === 'disconnected' || failedCollections.size) status = 'error'
    else if (transport !== 'connected' || [...activeCollections.values()].some(Boolean)) status = 'syncing'
    else status = 'idle'
    if (status !== lastStatus) {
      lastStatus = status
      onStatus(status)
    }
  }

  return {
    collectionActive(name, value) {
      activeCollections.set(name, value)
      // A fresh attempt supersedes the error from the previous replication
      // cycle. A new error event will put the collection back into attention.
      if (value) failedCollections.delete(name)
      publish()
    },
    collectionError(name) {
      failedCollections.add(name)
      publish()
    },
    collectionSuccess(name) {
      failedCollections.delete(name)
      publish()
    },
    transportConnecting() {
      transport = 'connecting'
      publish()
    },
    transportConnected() {
      transport = 'connected'
      publish()
    },
    transportDisconnected() {
      transport = 'disconnected'
      publish()
    },
    publish
  }
}

export async function parseSse(response, onEvent, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''
    for (const event of events) {
      const data = event.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim()
      if (!data) continue
      if (data.startsWith('"')) {
        try {
          onEvent(JSON.parse(data))
          continue
        } catch {
          // A malformed quoted payload is handled as plain SSE data.
        }
      }
      onEvent(data)
    }
  }
}

async function connectEvents(stream, controller, onRemoteEvent, tracker) {
  while (!controller.signal.aborted) {
    try {
      tracker.transportConnecting()
      const response = await apiFetch('/api/sync/events', { signal: controller.signal })
      if (!response.ok || !response.body) throw new Error(`SSE connection failed (${response.status})`)
      // Pull once on every connection so changes made while this client was
      // offline are not missed before the next live server event.
      stream.next('RESYNC')
      tracker.transportConnected()
      onRemoteEvent(REMOTE_CONNECTED_EVENT)
      await parseSse(response, (event) => {
        if (event === 'RESYNC') stream.next('RESYNC')
        onRemoteEvent(event)
      }, controller.signal)
    } catch {
      if (controller.signal.aborted) return
      tracker.transportDisconnected()
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

export async function startReplication(db, onStatus = () => {}, onRemoteEvent = () => {}) {
  await stopReplication()
  const stream = new Subject()
  const controller = new AbortController()
  const states = [
    replicateCollection(db.receipts, 'receipts', stream),
    replicateCollection(db.receipt_items, 'receipt_items', stream)
  ]
  const tracker = createReplicationStatusTracker(onStatus)
  states.forEach((state, index) => {
    const collectionName = index === 0 ? 'receipts' : 'receipt_items'
    state.error$.subscribe(() => {
      tracker.collectionError(collectionName)
      // RxDB error messages include full document contents. Do not leak receipt
      // data to the production console; the replication retries automatically.
    })
    state.received$.subscribe(() => tracker.collectionSuccess(collectionName))
    state.sent$.subscribe(() => tracker.collectionSuccess(collectionName))
    state.active$.subscribe((isActive) => tracker.collectionActive(collectionName, isActive))
  })
  active = { states, stream, controller, tracker }
  tracker.publish()
  void connectEvents(stream, controller, onRemoteEvent, tracker)
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
