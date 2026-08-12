function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function fitCropMagnifierSize(viewportWidth, viewportHeight, preferredSize = 156, margin = 12) {
  const availableWidth = Math.max(1, viewportWidth - margin * 2)
  const availableHeight = Math.max(1, viewportHeight - margin * 2)
  return Math.min(preferredSize, availableWidth, availableHeight)
}

export function placeCropMagnifier(
  pointerX,
  pointerY,
  size,
  viewportWidth,
  viewportHeight,
  { margin = 12, gap = 18 } = {}
) {
  const minimumLeft = margin
  const maximumLeft = viewportWidth - margin - size
  const minimumTop = margin
  const maximumTop = viewportHeight - margin - size

  const right = pointerX + gap
  const left = pointerX - gap - size
  const above = pointerY - gap - size
  const below = pointerY + gap

  const proposedLeft = right <= maximumLeft
    ? right
    : left >= minimumLeft
      ? left
      : pointerX < viewportWidth / 2 ? maximumLeft : minimumLeft
  const proposedTop = above >= minimumTop
    ? above
    : below <= maximumTop
      ? below
      : pointerY < viewportHeight / 2 ? maximumTop : minimumTop

  return {
    left: clamp(proposedLeft, minimumLeft, maximumLeft),
    top: clamp(proposedTop, minimumTop, maximumTop)
  }
}
