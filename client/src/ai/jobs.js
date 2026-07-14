import { getImageBlob, storeRemoteImage } from '../images/repository.js'
import { apiFetch } from '../sync/api.js'
import { nowIso } from '../utils/ids.js'

let running = false

function retryAt(attempts) {
  const delayMinutes = Math.min(60, 2 ** Math.min(6, Math.max(0, attempts - 1)))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

function isAvailabilityError(error) {
  return error instanceof TypeError || ['429', '502', '503', '504'].includes(error.code)
}

async function processUpload(db, job, settings) {
  const image = await db.images.findOne({ selector: { receiptId: job.receiptId } }).exec()
  if (!image) throw new Error('Image metadata is missing')
  const receipt = await db.receipts.findOne(job.receiptId).exec()
  if (!receipt) throw new Error('Receipt metadata is missing')
  const blob = await getImageBlob(db, image.id, 'full')
  if (!blob) throw new Error('Full image attachment is missing')
  await image.incrementalPatch({ remoteStatus: 'uploading' })
  const form = new FormData()
  form.append('file', blob, 'receipt.jpg')
  form.append('sha256', image.id)
  form.append('mimeType', image.mimeType)
  form.append('receiptId', job.receiptId)
  form.append('locale', settings.locale)
  form.append('currency', receipt.currency || settings.defaultCurrency)
  const response = await apiFetch('/api/files', {
    method: 'POST',
    body: form
  })
  const result = await response.json()
  await image.incrementalPatch({ remoteStatus: 'uploaded', remoteFileId: result.fileId })
  return true
}

async function processJob(db, job, settings) {
  if (job.type === 'image-upload') return processUpload(db, job, settings)
  return false
}

export async function recoverInterruptedJobs(db) {
  const interrupted = await db.jobs.find({ selector: { status: 'processing' } }).exec()
  await Promise.all(interrupted.map((job) => job.incrementalPatch({
    status: 'pending',
    nextAttemptAt: null,
    updatedAt: nowIso()
  })))
}

export async function runPendingJobs(db, settings, onEvent = () => {}) {
  if (running || !navigator.onLine) return
  running = true
  try {
    const jobs = await db.jobs.find().exec()
    const now = nowIso()
    const eligible = jobs.filter((job) =>
      (job.status === 'pending' || (job.status === 'failed' && job.attempts < 5)) &&
      (!job.nextAttemptAt || job.nextAttemptAt <= now)
    )
    for (const job of eligible) {
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
        await onEvent({ type: 'job-completed', jobType: job.type, receiptId: job.receiptId })
      } catch (error) {
        const attempts = job.attempts + 1
        const availabilityError = isAvailabilityError(error)
        const terminal = !availabilityError && attempts >= 5
        await job.incrementalPatch({
          status: terminal ? 'failed' : 'pending',
          attempts,
          nextAttemptAt: terminal ? null : retryAt(attempts),
          lastErrorCode: error.code || 'job_failed',
          lastErrorMessage: String(error.message || error).slice(0, 300),
          updatedAt: nowIso()
        })
        if (job.type === 'image-upload') {
          const image = await db.images.findOne({ selector: { receiptId: job.receiptId } }).exec()
          await image?.incrementalPatch({ remoteStatus: terminal ? 'failed' : 'pending' })
        }
        await onEvent({ type: 'job-failed', jobType: job.type, receiptId: job.receiptId, error })
      }
    }
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
