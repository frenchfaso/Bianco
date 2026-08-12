import { describe, expect, it } from 'vitest'

import { fitCropMagnifierSize, placeCropMagnifier } from '../src/images/crop-magnifier.js'

describe('crop magnifier geometry', () => {
  it.each([
    [2, 2],
    [388, 2],
    [2, 842],
    [388, 842],
    [195, 422]
  ])('keeps the lens visible around pointer %i,%i', (x, y) => {
    const viewport = { width: 390, height: 844 }
    const size = fitCropMagnifierSize(viewport.width, viewport.height)
    const position = placeCropMagnifier(x, y, size, viewport.width, viewport.height)

    expect(position.left).toBeGreaterThanOrEqual(12)
    expect(position.top).toBeGreaterThanOrEqual(12)
    expect(position.left + size).toBeLessThanOrEqual(viewport.width - 12)
    expect(position.top + size).toBeLessThanOrEqual(viewport.height - 12)
  })

  it('shrinks to remain visible in a very small viewport', () => {
    expect(fitCropMagnifierSize(120, 100, 156, 12)).toBe(76)
  })
})
