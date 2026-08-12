import { describe, expect, it } from 'vitest'

import {
  defaultDocumentQuad,
  detectDocumentQuad,
  encodeCanvasWithFallback,
  sanitizeDocumentQuad
} from '../src/images/document-preprocess.js'

function imageData(width, height, polygon = null) {
  const data = new Uint8ClampedArray(width * height * 4)
  const contains = (x, y) => {
    if (!polygon) return false
    let inside = false
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const currentPoint = polygon[index]
      const previousPoint = polygon[previous]
      const crosses = (currentPoint.y > y) !== (previousPoint.y > y)
        && x < (
          (previousPoint.x - currentPoint.x) * (y - currentPoint.y)
          / (previousPoint.y - currentPoint.y)
          + currentPoint.x
        )
      if (crosses) inside = !inside
    }
    return inside
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const receipt = contains(x, y)
      data[offset] = receipt ? 242 : 38
      data[offset + 1] = receipt ? 241 : 48
      data[offset + 2] = receipt ? 236 : 58
      data[offset + 3] = 255
    }
  }
  return { data, width, height }
}

describe('detectDocumentQuad', () => {
  it('finds and conservatively expands a perspective receipt', () => {
    const width = 240
    const height = 320
    const sourceQuad = [
      { x: 52, y: 24 },
      { x: 202, y: 42 },
      { x: 190, y: 292 },
      { x: 38, y: 278 }
    ]

    const result = detectDocumentQuad(imageData(width, height, sourceQuad), width, height)

    expect(result.reason).toBe('document-detected')
    expect(result.confidence).toBeGreaterThan(0.8)
    expect(result.quad).toHaveLength(4)
    expect(result.quad[0].x).toBeLessThan(sourceQuad[0].x)
    expect(result.quad[1].x).toBeGreaterThan(sourceQuad[1].x)
    expect(result.quad[2].y).toBeGreaterThan(sourceQuad[2].y)
  })

  it('falls back when no bright document is present', () => {
    const width = 160
    const height = 120

    const result = detectDocumentQuad(imageData(width, height), width, height)

    expect(result.quad).toBeNull()
    expect(result.reason).toBe('no-document-component')
  })
})

describe('encodeCanvasWithFallback', () => {
  it('keeps WebP when the browser encoder supports it', async () => {
    const canvas = {
      convertToBlob: async ({ type }) => new Blob(['webp'], { type })
    }

    const result = await encodeCanvasWithFallback(
      canvas,
      'image/webp',
      'image/jpeg',
      0.9
    )

    expect(result.mimeType).toBe('image/webp')
    expect(result.blob.type).toBe('image/webp')
  })

  it('falls back to JPEG when WebP encoding is unavailable', async () => {
    const requestedTypes = []
    const canvas = {
      convertToBlob: async ({ type }) => {
        requestedTypes.push(type)
        return new Blob(['image'], {
          type: type === 'image/webp' ? 'image/png' : type
        })
      }
    }

    const result = await encodeCanvasWithFallback(
      canvas,
      'image/webp',
      'image/jpeg',
      0.9
    )

    expect(requestedTypes).toEqual(['image/webp', 'image/jpeg'])
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.blob.type).toBe('image/jpeg')
  })
})

describe('editable document quadrilateral', () => {
  it('provides a safe inset fallback and accepts a convex user adjustment', () => {
    const quad = defaultDocumentQuad(1000, 1600)

    expect(quad).toHaveLength(4)
    expect(sanitizeDocumentQuad(quad, 1000, 1600)).toEqual(quad)
  })

  it('rejects crossed corners before perspective correction', () => {
    const crossed = [
      { x: 10, y: 10 },
      { x: 90, y: 90 },
      { x: 90, y: 10 },
      { x: 10, y: 90 }
    ]

    expect(sanitizeDocumentQuad(crossed, 100, 100)).toBeNull()
  })
})
