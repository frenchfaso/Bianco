import { createId, getDeviceId, nowIso, todayLocal } from '../utils/ids.js'

const emptyAi = {
  providerId: null,
  modelId: null,
  promptVersion: null,
  schemaVersion: null
}

function baseReceipt(overrides = {}) {
  const now = nowIso()
  return {
    id: createId(),
    status: 'manual',
    capturedAt: now,
    transactionDate: todayLocal(),
    merchantRaw: null,
    merchantNormalized: null,
    currency: 'EUR',
    subtotalMinor: null,
    taxMinor: null,
    discountMinor: null,
    totalMinor: null,
    categoryId: 'other',
    imageHash: null,
    overallConfidence: null,
    warnings: [],
    userConfirmed: false,
    ai: { ...emptyAi },
    updatedAt: now,
    updatedByDevice: getDeviceId(),
    ...overrides
  }
}

function newJob(type, receiptId) {
  const now = nowIso()
  return {
    id: createId(),
    type,
    receiptId,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now
  }
}

export async function createManualReceipt(db, currency = 'EUR') {
  const receipt = baseReceipt({ currency })
  await db.receipts.insert(receipt)
  return receipt.id
}

export async function createCapturedReceipt(db, processed, currency = 'EUR') {
  const receipt = baseReceipt({
    status: 'captured',
    currency,
    imageHash: processed.hash
  })
  await db.receipts.insert(receipt)
  try {
    const image = await db.images.insert({
      id: processed.hash,
      receiptId: receipt.id,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.full.size,
      remoteStatus: 'pending',
      remoteFileId: null,
      createdAt: nowIso()
    })
    await image.putAttachment({ id: 'full', data: processed.full, type: processed.mimeType })
    await image.putAttachment({ id: 'thumbnail', data: processed.thumbnail, type: processed.mimeType })
    await db.jobs.bulkInsert([
      newJob('ai-extraction', receipt.id),
      newJob('image-upload', receipt.id)
    ])
    const receiptDocument = await db.receipts.findOne(receipt.id).exec()
    await receiptDocument.incrementalPatch({
      status: 'queued',
      updatedAt: nowIso(),
      updatedByDevice: getDeviceId()
    })
  } catch (error) {
    const receiptDocument = await db.receipts.findOne(receipt.id).exec()
    await receiptDocument?.incrementalPatch({
      status: 'failed',
      warnings: ['Salvataggio immagine incompleto'],
      updatedAt: nowIso(),
      updatedByDevice: getDeviceId()
    })
    throw error
  }
  return receipt.id
}

export async function updateReceipt(db, receiptId, changes, confirmed = false) {
  const document = await db.receipts.findOne(receiptId).exec()
  if (!document) throw new Error('Receipt not found')
  await document.incrementalPatch({
    ...changes,
    userConfirmed: confirmed || document.userConfirmed,
    status: confirmed ? 'confirmed' : document.status,
    updatedAt: nowIso(),
    updatedByDevice: getDeviceId()
  })
}

export async function replaceReceiptItems(db, receiptId, items, userEdited = false) {
  const existing = await db.receipt_items.find({ selector: { receiptId } }).exec()
  await Promise.all(existing.map((document) => document.remove()))
  if (!items.length) return
  const timestamp = nowIso()
  await db.receipt_items.bulkInsert(items.map((item, position) => ({
    id: item.id || createId(),
    receiptId,
    rawName: item.rawName || '',
    normalizedName: item.normalizedName || item.rawName || '',
    quantity: item.quantity ?? null,
    unitPriceMinor: item.unitPriceMinor ?? null,
    totalPriceMinor: item.totalPriceMinor ?? null,
    categoryId: item.categoryId || 'other',
    confidence: item.confidence ?? null,
    position,
    userEdited: userEdited || Boolean(item.userEdited),
    updatedAt: timestamp,
    updatedByDevice: getDeviceId()
  })))
}

export async function applyExtraction(db, receiptId, extraction, provider) {
  await updateReceipt(db, receiptId, {
    status: 'needs_review',
    transactionDate: extraction.transactionDate,
    merchantRaw: extraction.merchant.rawName,
    merchantNormalized: extraction.merchant.normalizedName,
    currency: extraction.currency,
    subtotalMinor: extraction.subtotalMinor,
    taxMinor: extraction.taxMinor,
    discountMinor: extraction.discountMinor,
    totalMinor: extraction.totalMinor,
    categoryId: extraction.categoryId,
    overallConfidence: extraction.confidence,
    warnings: extraction.warnings,
    ai: {
      providerId: provider.id,
      modelId: provider.model || null,
      promptVersion: 'receipt-v1',
      schemaVersion: extraction.schemaVersion
    }
  })
  await replaceReceiptItems(db, receiptId, extraction.items)
}

export async function deleteReceipt(db, receiptId) {
  const items = await db.receipt_items.find({ selector: { receiptId } }).exec()
  await Promise.all(items.map((item) => item.remove()))
  const image = await db.images.findOne({ selector: { receiptId } }).exec()
  await image?.remove()
  const jobs = await db.jobs.find({ selector: { receiptId } }).exec()
  await Promise.all(jobs.map((job) => job.remove()))
  const receipt = await db.receipts.findOne(receiptId).exec()
  await receipt?.remove()
}

export async function getReceiptDetail(db, receiptId) {
  const receipt = await db.receipts.findOne(receiptId).exec()
  if (!receipt) return null
  const items = await db.receipt_items.find({
    selector: { receiptId },
    sort: [{ position: 'asc' }]
  }).exec()
  return {
    receipt: receipt.toJSON(),
    items: items.map((item) => item.toJSON())
  }
}

export function observeReceipts(db, callback) {
  return db.receipts.find({ sort: [{ updatedAt: 'desc' }] }).$.subscribe((documents) => {
    callback(documents.map((document) => document.toJSON()))
  })
}

export function observeItems(db, callback) {
  return db.receipt_items.find().$.subscribe((documents) => {
    callback(documents.map((document) => document.toJSON()))
  })
}
