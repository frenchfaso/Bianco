async function blobToDataUrl(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return `data:${blob.type};base64,${btoa(binary)}`
}

export async function buildBackup(db, includeImages = false) {
  const [receiptDocuments, itemDocuments, imageDocuments] = await Promise.all([
    db.receipts.find().exec(),
    db.receipt_items.find().exec(),
    db.images.find().exec()
  ])
  const images = []
  if (includeImages) {
    for (const document of imageDocuments) {
      const full = document.getAttachment('full')
      const thumbnail = document.getAttachment('thumbnail')
      images.push({
        ...document.toJSON(),
        full: full ? await blobToDataUrl(await full.getData()) : null,
        thumbnail: thumbnail ? await blobToDataUrl(await thumbnail.getData()) : null
      })
    }
  }
  return {
    application: 'bianco',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    receipts: receiptDocuments.map((document) => document.toJSON()),
    items: itemDocuments.map((document) => document.toJSON()),
    images
  }
}

export async function downloadBackup(db, includeImages = false) {
  const backup = await buildBackup(db, includeImages)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `bianco-${backup.exportedAt.slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
