import { getImageBlob, storeRemoteImage } from '../images/repository.js'
import { apiFetch } from '../sync/api.js'
import { nowIso } from '../utils/ids.js'

let running = false
const JOB_LEASE_NAME = 'bianco-local-job-runner'
const JOB_LEASE_TTL_MS = 120_000
const JOB_LEASE_WAIT_MS = 250
const JOB_LEASE_HEARTBEAT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 90_000
const COMPLETED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

function leaseFromStorage(storage, key) {
  const raw = storage.getItem(key)
  if (!raw) return null
  try {
    const lease = JSON.parse(raw)
    return typeof lease?.owner === 'string' && Number.isFinite(lease.expiresAt) ? lease : null
  } catch {
    return null
  }
}

async function runWithJobLease(callback) {
  const lockManager = globalThis.navigator?.locks
  if (lockManager?.request) {
    let callbackStarted = false
    try {
      return await lockManager.request(JOB_LEASE_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return undefined
        callbackStarted = true
        return callback(() => true)
      })
    } catch (error) {
      // Never execute a failed job callback twice. Only fall back when Web
      // Locks itself failed before granting the lock.
      if (callbackStarted) throw error
    }
  }

  // Safari currently has no Web Locks API. A short localStorage lease prevents
  // ordinary duplicate work across tabs; the server upload remains idempotent
  // by content hash if a tab crashes while holding it.
  const key = `${JOB_LEASE_NAME}-lease`
  const owner = crypto.randomUUID()
  const storage = globalThis.localStorage
  if (!storage) return callback(() => true)

  try {
    const current = leaseFromStorage(storage, key)
    if (current?.expiresAt > Date.now()) return undefined
    storage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + JOB_LEASE_TTL_MS }))
    await new Promise((resolve) => globalThis.setTimeout(resolve, JOB_LEASE_WAIT_MS))
    const acquired = leaseFromStorage(storage, key)
    if (acquired?.owner !== owner) return undefined
  } catch {
    // Storage can be disabled. Duplicate uploads are still content-addressed
    // and the in-tab guard below remains effective.
    return callback(() => true)
  }

  const stillOwner = () => {
    try {
      const held = leaseFromStorage(storage, key)
      return held?.owner === owner && held.expiresAt > Date.now()
    } catch {
      return false
    }
  }
  const heartbeat = globalThis.setInterval(() => {
    try {
      if (leaseFromStorage(storage, key)?.owner === owner) {
        storage.setItem(key, JSON.stringify({ owner, expiresAt: Date.now() + JOB_LEASE_TTL_MS }))
      }
    } catch {
      // A lost lease stops the runner before the next job. The current upload
      // is safe to finish because the server addresses it by content hash.
    }
  }, JOB_LEASE_HEARTBEAT_MS)
  try {
    return await callback(stillOwner)
  } finally {
    globalThis.clearInterval(heartbeat)
    try {
      if (leaseFromStorage(storage, key)?.owner === owner) storage.removeItem(key)
    } catch {
      // The lease expires on its own when storage becomes unavailable.
    }
  }
}

function retryAt(attempts) {
  const delayMinutes = Math.min(60, 2 ** Math.min(6, Math.max(0, attempts - 1)))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

function isAvailabilityError(error) {
  return error instanceof TypeError ||
    ['AbortError', 'TimeoutError'].includes(error?.name) ||
    ['429', '502', '503', '504'].includes(String(error?.code || ''))
}

function errorCode(error) {
  if (error?.name === 'TimeoutError') return 'upload_timeout'
  if (error?.name === 'AbortError') return 'request_aborted'
  return String(error?.code || 'job_failed')
}

function uploadTimeout() {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => {
    controller.abort(new DOMException('Upload timed out', 'TimeoutError'))
  }, UPLOAD_TIMEOUT_MS)
  return {
    signal: controller.signal,
    cancel: () => globalThis.clearTimeout(timer)
  }
}

async function processUpload(db, job, settings) {
  const receipt = await db.receipts.findOne(job.receiptId).exec()
  if (!receipt) throw new Error('Receipt metadata is missing')
  const image = receipt.imageHash ? await db.images.findOne(receipt.imageHash).exec() : null
  if (!image) throw new Error('Image metadata is missing')
  const blob = await getImageBlob(db, image.id, 'full')
  if (!blob) throw new Error('Full image attachment is missing')
  await image.incrementalPatch({ remoteStatus: 'uploading' })
  const form = new FormData()
  const extension = image.mimeType === 'image/webp' ? 'webp' : 'jpg'
  form.append('file', blob, `receipt.${extension}`)
  form.append('sha256', image.id)
  form.append('mimeType', image.mimeType)
  form.append('receiptId', job.receiptId)
  form.append('locale', settings.locale)
  form.append('currency', receipt.currency || settings.defaultCurrency)
  const timeout = uploadTimeout()
  let result
  try {
    const response = await apiFetch('/api/files', {
      method: 'POST',
      body: form,
      signal: timeout.signal
    })
    result = await response.json()
  } finally {
    timeout.cancel()
  }
  await image.incrementalPatch({ remoteStatus: 'uploaded', remoteFileId: result.fileId })
  return true
}

async function processJob(db, job, settings) {
  if (job.type === 'image-upload') return processUpload(db, job, settings)
  return false
}

async function emitJobEvent(onEvent, event) {
  try {
    await onEvent(event)
  } catch {
    // Notification consumers must not change a durably persisted job result.
  }
}

async function resetInterruptedJobs(db) {
  const interrupted = await db.jobs.find({ selector: { status: 'processing' } }).exec()
  await Promise.all(interrupted.map((job) => job.incrementalPatch({
    status: 'pending',
    nextAttemptAt: null,
    updatedAt: nowIso()
  })))
}

async function compactCompletedJobs(db) {
  const cutoff = Date.now() - COMPLETED_JOB_RETENTION_MS
  const jobs = await db.jobs.find({ selector: { status: 'completed' } }).exec()
  await Promise.allSettled(jobs
    .filter((job) => {
      const completedAt = Date.parse(job.updatedAt || job.createdAt || '')
      return Number.isFinite(completedAt) && completedAt < cutoff
    })
    .map((job) => job.remove()))
}

export async function recoverInterruptedJobs(db) {
  await runWithJobLease(async () => {
    await resetInterruptedJobs(db)
    await compactCompletedJobs(db)
  })
}

export async function runPendingJobs(db, settings, onEvent = () => {}) {
  if (running || !navigator.onLine) return
  running = true
  try {
    await runWithJobLease(async (stillOwnsLease) => {
      // A previous tab may have crashed after setting a job to processing. At
      // this point this runner owns the cross-tab lease, so resetting it cannot
      // race a compliant live runner.
      await resetInterruptedJobs(db)
      await compactCompletedJobs(db)
      const jobs = await db.jobs.find().exec()
      const now = nowIso()
      const eligible = jobs.filter((job) =>
        (job.status === 'pending' || (job.status === 'failed' && job.attempts < 5)) &&
        (!job.nextAttemptAt || job.nextAttemptAt <= now)
      )
      for (const job of eligible) {
        if (!stillOwnsLease()) break
        await job.incrementalPatch({ status: 'processing', updatedAt: nowIso() })
        try {
          const processed = await processJob(db, job, settings)
          if (!processed) {
            await job.incrementalPatch({ status: 'pending', updatedAt: nowIso() })
            continue
          }
          await job.incrementalPatch({
            status: 'completed',
            nextAttemptAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: nowIso()
          })
          await emitJobEvent(onEvent, {
            type: 'job-completed', jobType: job.type, receiptId: job.receiptId
          })
        } catch (error) {
          const attempts = job.attempts + 1
          const availabilityError = isAvailabilityError(error)
          const terminal = !availabilityError && attempts >= 5
          await job.incrementalPatch({
            status: terminal ? 'failed' : 'pending',
            attempts,
            nextAttemptAt: terminal ? null : retryAt(attempts),
            lastErrorCode: errorCode(error),
            lastErrorMessage: String(error.message || error).slice(0, 300),
            updatedAt: nowIso()
          })
          if (job.type === 'image-upload') {
            const receipt = await db.receipts.findOne(job.receiptId).exec()
            const image = receipt?.imageHash ? await db.images.findOne(receipt.imageHash).exec() : null
            await image?.incrementalPatch({ remoteStatus: terminal ? 'failed' : 'pending' })
          }
          await emitJobEvent(onEvent, {
            type: 'job-failed', jobType: job.type, receiptId: job.receiptId, error
          })
        }
      }
    })
  } finally {
    running = false
  }
}

export async function downloadRemoteImage(db, receipt, variant = 'thumbnail') {
  if (!receipt.imageHash) return null
  const response = await apiFetch(`/api/files/${receipt.imageHash}?variant=${variant}`)
  const blob = await response.blob()
  await storeRemoteImage(db, receipt.id, receipt.imageHash, blob, variant)
  return blob
}
