import { nowIso } from '../utils/ids.js'

export async function getImageBlob(db, imageHash, attachmentId = 'full') {
  if (!imageHash) return null
  const image = await db.images.findOne(imageHash).exec()
  const attachment = image?.getAttachment(attachmentId)
  return attachment ? attachment.getData() : null
}

export async function getImageUrl(db, imageHash, attachmentId = 'thumbnail') {
  const blob = await getImageBlob(db, imageHash, attachmentId)
  return blob ? URL.createObjectURL(blob) : null
}

export async function storeRemoteImage(db, receiptId, imageHash, blob, variant) {
  let image = await db.images.findOne(imageHash).exec()
  if (!image) {
    image = await db.images.insert({
      id: imageHash,
      receiptId,
      mimeType: 'image/jpeg',
      width: 0,
      height: 0,
      sizeBytes: variant === 'full' ? blob.size : 0,
      remoteStatus: 'remote',
      remoteFileId: imageHash,
      createdAt: nowIso()
    })
  }
  await image.putAttachment({ id: variant, data: blob, type: 'image/jpeg' })
  if (variant === 'full') await image.incrementalPatch({ sizeBytes: blob.size })
  return image
}
