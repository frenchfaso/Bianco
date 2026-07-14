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

async function renderJpeg(source, maximum, quality) {
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
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('JPEG encoding failed')), 'image/jpeg', quality)
  })
  return { blob, ...size }
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function processReceiptImage(file) {
  const source = await decodeImage(file)
  try {
    const full = await renderJpeg(source, 2200, 0.82)
    const thumbnail = await renderJpeg(source, 320, 0.78)
    return {
      full: full.blob,
      thumbnail: thumbnail.blob,
      width: full.width,
      height: full.height,
      hash: await sha256(full.blob),
      mimeType: 'image/jpeg'
    }
  } finally {
    source.close?.()
  }
}
