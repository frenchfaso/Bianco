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
    let image = await db.images.findOne(processed.hash).exec()
    if (!image) {
      try {
        image = await db.images.insert({
          id: processed.hash,
          // Legacy ownership field. The hash is the actual identity and an
          // asset may be referenced by more than one receipt.
          receiptId: receipt.id,
          mimeType: processed.mimeType,
          width: processed.width,
          height: processed.height,
          sizeBytes: processed.full.size,
          remoteStatus: 'pending',
          remoteFileId: null,
          createdAt: nowIso()
        })
      } catch {
        image = await db.images.findOne(processed.hash).exec()
        if (!image) throw new Error('Image asset could not be stored')
      }
    }
    if (!image.getAttachment('full')) {
      await image.putAttachment({ id: 'full', data: processed.full, type: processed.mimeType })
    }
    if (!image.getAttachment('thumbnail')) {
      await image.putAttachment({ id: 'thumbnail', data: processed.thumbnail, type: processed.mimeType })
    }
    await db.jobs.insert(newJob('image-upload', receipt.id))
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
  const existingById = new Map(existing.map((document) => [document.id, document]))
  const timestamp = nowIso()
  const deviceId = getDeviceId()
  const incomingIds = new Set()
  const inserts = []
  const patches = []
  items.forEach((item, position) => {
    const id = item.id || createId()
    incomingIds.add(id)
    const values = {
      rawName: item.rawName || '',
      normalizedName: item.normalizedName || item.rawName || '',
      quantity: item.quantity ?? null,
      unitPriceMinor: item.unitPriceMinor ?? null,
      totalPriceMinor: item.totalPriceMinor ?? null,
      categoryId: item.categoryId || 'other',
      confidence: item.confidence ?? null,
      position,
      userEdited: userEdited || Boolean(item.userEdited)
    }
    const document = existingById.get(id)
    if (!document) {
      inserts.push({ id, receiptId, ...values, updatedAt: timestamp, updatedByDevice: deviceId })
      return
    }
    const changed = Object.entries(values).some(([key, value]) => document[key] !== value)
    if (changed) patches.push(document.incrementalPatch({ ...values, updatedAt: timestamp, updatedByDevice: deviceId }))
  })
  await Promise.all(patches)
  if (inserts.length) await db.receipt_items.bulkInsert(inserts)
  await Promise.all(existing
    .filter((document) => !incomingIds.has(document.id))
    .map((document) => document.remove()))
}

const receiptFields = [
  'status', 'capturedAt', 'transactionDate', 'merchantRaw', 'merchantNormalized',
  'currency', 'subtotalMinor', 'taxMinor', 'discountMinor', 'totalMinor', 'categoryId',
  'imageHash', 'overallConfidence', 'warnings', 'userConfirmed', 'ai', 'updatedAt',
  'updatedByDevice'
]

const itemFields = [
  'receiptId', 'rawName', 'normalizedName', 'quantity', 'unitPriceMinor',
  'totalPriceMinor', 'categoryId', 'confidence', 'position', 'userEdited', 'updatedAt',
  'updatedByDevice'
]

function selectFields(document, fields) {
  return Object.fromEntries(fields
    .filter((field) => Object.hasOwn(document, field))
    .map((field) => [field, document[field]]))
}

/**
 * Mirrors the server's successful aggregate commit without generating a second
 * client timestamp. Replication can therefore converge on the exact master
 * documents instead of turning the same edit into another conflict.
 */
export async function applyReceiptAggregate(db, aggregate) {
  const receipt = aggregate?.receipt
  if (!receipt?.id) throw new Error('Invalid receipt aggregate')

  const receiptValues = selectFields(receipt, receiptFields)
  const localReceipt = await db.receipts.findOne(receipt.id).exec()
  if (localReceipt) await localReceipt.incrementalPatch(receiptValues)
  else await db.receipts.insert({ id: receipt.id, ...receiptValues })

  const localItems = await db.receipt_items.find({ selector: { receiptId: receipt.id } }).exec()
  const localById = new Map(localItems.map((document) => [document.id, document]))
  const remoteIds = new Set()
  const inserts = []
  const patches = []
  for (const item of aggregate.items || []) {
    if (!item?.id) continue
    remoteIds.add(item.id)
    const values = selectFields({ ...item, receiptId: receipt.id }, itemFields)
    const localItem = localById.get(item.id)
    if (localItem) patches.push(localItem.incrementalPatch(values))
    else inserts.push({ id: item.id, ...values })
  }
  await Promise.all(patches)
  if (inserts.length) await db.receipt_items.bulkInsert(inserts)
  await Promise.all(localItems
    .filter((document) => !remoteIds.has(document.id))
    .map((document) => document.remove()))
}

export async function deleteReceipt(db, receiptId) {
  const receipt = await db.receipts.findOne(receiptId).exec()
  const imageHash = receipt?.imageHash
  const items = await db.receipt_items.find({ selector: { receiptId } }).exec()
  await Promise.all(items.map((item) => item.remove()))
  const jobs = (await db.jobs.find().exec()).filter((job) => job.receiptId === receiptId)
  await Promise.all(jobs.map((job) => job.remove()))
  await receipt?.remove()
  if (imageHash) {
    const remainingReferences = (await db.receipts.find().exec())
      .filter((candidate) => candidate.imageHash === imageHash)
    if (!remainingReferences.length) {
      const image = await db.images.findOne(imageHash).exec()
      await image?.remove()
    }
  }
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
