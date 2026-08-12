import { preprocessReceiptDocument } from './document-preprocess.js'
export { detectReceiptDocument, sanitizeDocumentQuad } from './document-preprocess.js'

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      return createImageBitmap(file)
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

function outputSize(width, height, maximum) {
  const ratio = Math.min(1, maximum / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  }
}

async function renderImage(source, maximum, mimeType, quality) {
  const originalWidth = source.width || source.naturalWidth
  const originalHeight = source.height || source.naturalHeight
  const size = outputSize(originalWidth, originalHeight, maximum)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { alpha: false })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(source, 0, 0, size.width, size.height)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image encoding failed')), mimeType, quality)
  })
  if (blob.type !== mimeType) throw new Error(`Browser stopped supporting ${mimeType}`)
  return { blob, ...size }
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function processReceiptImage(file, options = {}) {
  const full = await preprocessReceiptDocument(file, {
    targetLongEdge: 3200,
    imageQuality: 0.9,
    preferredMimeType: 'image/webp',
    fallbackMimeType: 'image/jpeg',
    sourceQuad: options.sourceQuad,
    signal: options.signal
  })
  const source = await decodeImage(full.blob)
  try {
    const thumbnail = await renderImage(source, 1280, full.mimeType, 0.92)
    return {
      full: full.blob,
      thumbnail: thumbnail.blob,
      width: full.width,
      height: full.height,
      hash: await sha256(full.blob),
      mimeType: full.mimeType,
      transform: full.transform
    }
  } finally {
    source.close?.()
  }
}
