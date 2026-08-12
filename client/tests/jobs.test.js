import { afterEach, describe, expect, it, vi } from 'vitest'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function document(data, onRemove = () => {}) {
  return {
    ...data,
    removed: false,
    async incrementalPatch(patch) {
      Object.assign(this, patch)
    },
    async remove() {
      this.removed = true
      onRemove(this)
    }
  }
}

function collection(documents) {
  const active = () => documents.filter((entry) => !entry.removed)
  return {
    find(query = {}) {
      return {
        async exec() {
          const selector = query.selector || {}
          return active().filter((entry) => Object.entries(selector)
            .every(([key, value]) => entry[key] === value))
        }
      }
    },
    findOne(id) {
      return { async exec() { return active().find((entry) => entry.id === id) || null } }
    }
  }
}

function queueFixture(extraJobs = []) {
  const full = new Blob(['receipt-image'], { type: 'image/webp' })
  const job = document({
    id: 'job-1',
    type: 'image-upload',
    receiptId: 'receipt-1',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  const receipt = document({ id: 'receipt-1', imageHash: 'image-1', currency: 'EUR' })
  const image = document({
    id: 'image-1',
    mimeType: 'image/webp',
    remoteStatus: 'pending',
    remoteFileId: null,
    getAttachment: (id) => id === 'full' ? { getData: async () => full } : null
  })
  const jobs = [job, ...extraJobs]
  return {
    db: {
      jobs: collection(jobs),
      receipts: collection([receipt]),
      images: collection([image])
    },
    job,
    image,
    jobs
  }
}

function lockManager() {
  let held = false
  return {
    async request(_name, options, callback) {
      if (options.ifAvailable && held) return callback(null)
      held = true
      try {
        return await callback({ name: 'bianco-local-job-runner' })
      } finally {
        held = false
      }
    }
  }
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }
}

async function separateRunners() {
  vi.resetModules()
  const first = await import('../src/ai/jobs.js')
  vi.resetModules()
  const second = await import('../src/ai/jobs.js')
  return [first, second]
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('local job runner', () => {
  it('uses Web Locks to prevent two tab-equivalent runners from uploading the same job', async () => {
    const started = deferred()
    const finish = deferred()
    const fetchMock = vi.fn((_url, options) => {
      started.resolve()
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        finish.promise.then(() => resolve(new globalThis.Response(
          JSON.stringify({ fileId: 'image-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )))
      })
    })
    vi.stubGlobal('navigator', { onLine: true, locks: lockManager() })
    vi.stubGlobal('fetch', fetchMock)
    const { db, job } = queueFixture()
    const [first, second] = await separateRunners()

    const firstRun = first.runPendingJobs(db, { locale: 'it-IT', defaultCurrency: 'EUR' })
    await started.promise
    await second.runPendingJobs(db, { locale: 'it-IT', defaultCurrency: 'EUR' })
    finish.resolve()
    await firstRun

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(job.status).toBe('completed')
  })

  it('uses the Safari localStorage lease across tab-equivalent runners', async () => {
    const started = deferred()
    const finish = deferred()
    const fetchMock = vi.fn(() => {
      started.resolve()
      return finish.promise.then(() => new globalThis.Response(
        JSON.stringify({ fileId: 'image-1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ))
    })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('fetch', fetchMock)
    const { db } = queueFixture()
    const [first, second] = await separateRunners()

    const firstRun = first.runPendingJobs(db, { locale: 'it-IT', defaultCurrency: 'EUR' })
    await second.runPendingJobs(db, { locale: 'it-IT', defaultCurrency: 'EUR' })
    await started.promise
    finish.resolve()
    await firstRun

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not execute the callback twice when an upload fails under the Safari lease', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('localStorage', memoryStorage())
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const { db, job } = queueFixture()
    vi.resetModules()
    const runner = await import('../src/ai/jobs.js')

    await runner.runPendingJobs(db, { locale: 'it-IT', defaultCurrency: 'EUR' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(job.attempts).toBe(1)
    expect(job.status).toBe('pending')
  })

  it('aborts a hung upload safely and schedules it for retry', async () => {
    vi.useFakeTimers()
    const started = deferred()
    const fetchMock = vi.fn((_url, options) => {
      started.resolve()
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    })
    vi.stubGlobal('navigator', { onLine: true, locks: lockManager() })
    vi.stubGlobal('fetch', fetchMock)
    const { db, job, image } = queueFixture()
    const events = []
    vi.resetModules()
    const runner = await import('../src/ai/jobs.js')

    const run = runner.runPendingJobs(
      db,
      { locale: 'it-IT', defaultCurrency: 'EUR' },
      (event) => events.push(event)
    )
    await started.promise
    await vi.advanceTimersByTimeAsync(90_001)
    await run

    expect(job).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'upload_timeout'
    })
    expect(job.nextAttemptAt).not.toBeNull()
    expect(image.remoteStatus).toBe('pending')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('job-failed')
  })

  it('keeps a completed result when its notification consumer fails', async () => {
    vi.stubGlobal('navigator', { onLine: true, locks: lockManager() })
    const fetchMock = vi.fn().mockResolvedValue(new globalThis.Response(
      JSON.stringify({ fileId: 'image-1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { db, job } = queueFixture()
    vi.resetModules()
    const runner = await import('../src/ai/jobs.js')

    await runner.runPendingJobs(
      db,
      { locale: 'it-IT', defaultCurrency: 'EUR' },
      () => { throw new Error('UI listener failed') }
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(job).toMatchObject({ status: 'completed', attempts: 0, lastErrorCode: null })
  })

  it('recovers interrupted work under the lease and removes only completed jobs older than seven days', async () => {
    const oldCompleted = document({
      id: 'old-completed',
      status: 'completed',
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    })
    const recentCompleted = document({
      id: 'recent-completed',
      status: 'completed',
      updatedAt: new Date().toISOString()
    })
    const interrupted = document({
      id: 'interrupted',
      status: 'processing',
      nextAttemptAt: '2099-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString()
    })
    const db = {
      jobs: collection([oldCompleted, recentCompleted, interrupted])
    }
    vi.stubGlobal('navigator', { onLine: true, locks: lockManager() })
    vi.resetModules()
    const runner = await import('../src/ai/jobs.js')

    await runner.recoverInterruptedJobs(db)

    expect(oldCompleted.removed).toBe(true)
    expect(recentCompleted.removed).toBe(false)
    expect(interrupted).toMatchObject({ status: 'pending', nextAttemptAt: null })
  })
})
