const DEFAULTS = Object.freeze({
  detectionLongEdge: 960,
  targetLongEdge: 3200,
  imageQuality: 0.9,
  preferredMimeType: 'image/webp',
  fallbackMimeType: 'image/jpeg',
  // Missing a few edge pixels can change an amount; a thin strip of background
  // is much less harmful to OCR. This expands each side by roughly 6%.
  cropMargin: 0.12,
  minimumConfidence: 0.55,
  portraitReceipts: true
})

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function canvasFor(width, height) {
  if (typeof globalThis.OffscreenCanvas === 'function') {
    return new globalThis.OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function canvasContext(canvas) {
  const context = canvas.getContext('2d', {
    alpha: false,
    colorSpace: 'srgb',
    willReadFrequently: true
  })
  if (!context) throw new Error('Canvas 2D is unavailable')
  return context
}

async function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Image encoding failed')),
      type,
      quality
    )
  })
}

export async function encodeCanvasWithFallback(
  canvas,
  preferredType,
  fallbackType,
  quality
) {
  try {
    const preferred = await canvasBlob(canvas, preferredType, quality)
    if (preferred.type === preferredType) {
      return { blob: preferred, mimeType: preferredType }
    }
  } catch {
    // Unsupported encoders may reject instead of returning a fallback format.
  }
  const fallback = await canvasBlob(canvas, fallbackType, quality)
  if (fallback.type !== fallbackType) {
    throw new Error(`Browser cannot encode ${preferredType} or ${fallbackType}`)
  }
  return { blob: fallback, mimeType: fallbackType }
}

function outputSize(width, height, maximum) {
  const ratio = Math.min(1, maximum / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  }
}

function percentile(histogram, count, quantile) {
  const target = Math.max(0, Math.ceil(count * quantile) - 1)
  let seen = 0
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value]
    if (seen > target) return value
  }
  return histogram.length - 1
}

function integralImage(mask, width, height) {
  const stride = width + 1
  const integral = new Uint32Array(stride * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let rowTotal = 0
    const sourceOffset = y * width
    const targetOffset = (y + 1) * stride
    const previousOffset = y * stride
    for (let x = 0; x < width; x += 1) {
      rowTotal += mask[sourceOffset + x]
      integral[targetOffset + x + 1] = integral[previousOffset + x + 1] + rowTotal
    }
  }
  return integral
}

function boxSum(integral, width, x0, y0, x1, y1) {
  const stride = width + 1
  return integral[y1 * stride + x1]
    - integral[y0 * stride + x1]
    - integral[y1 * stride + x0]
    + integral[y0 * stride + x0]
}

function dilate(mask, width, height, radius) {
  const integral = integralImage(mask, width, height)
  const output = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      output[y * width + x] = boxSum(integral, width, x0, y0, x1, y1) > 0 ? 1 : 0
    }
  }
  return output
}

function erode(mask, width, height, radius) {
  const integral = integralImage(mask, width, height)
  const output = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius)
    const y1 = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width, x + radius + 1)
      const area = (x1 - x0) * (y1 - y0)
      output[y * width + x] = boxSum(integral, width, x0, y0, x1, y1) === area ? 1 : 0
    }
  }
  return output
}

function largestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  let best = null

  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || visited[origin]) continue
    let head = 0
    let tail = 0
    queue[tail++] = origin
    visited[origin] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0

    while (head < tail) {
      const index = queue[head++]
      const y = Math.floor(index / width)
      const x = index - y * width
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      if (x > 0) {
        const next = index - 1
        if (mask[next] && !visited[next]) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (x + 1 < width) {
        const next = index + 1
        if (mask[next] && !visited[next]) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (y > 0) {
        const next = index - width
        if (mask[next] && !visited[next]) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
      if (y + 1 < height) {
        const next = index + width
        if (mask[next] && !visited[next]) {
          visited[next] = 1
          queue[tail++] = next
        }
      }
    }

    const boundsArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1))
    const rectangularity = tail / boundsArea
    const touches = Number(minX === 0) + Number(minY === 0)
      + Number(maxX === width - 1) + Number(maxY === height - 1)
    const score = tail * (0.65 + 0.35 * rectangularity) * (touches >= 3 ? 0.08 : 1)
    if (!best || score > best.score) {
      best = {
        score,
        size: tail,
        pixels: Int32Array.from(queue.subarray(0, tail)),
        bounds: { minX, minY, maxX, maxY },
        rectangularity,
        touches
      }
    }
  }
  return best
}

function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

function convexQuad(points) {
  let orientation = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const following = points[(index + 2) % points.length]
    const cross = (next.x - current.x) * (following.y - next.y)
      - (next.y - current.y) * (following.x - next.x)
    if (Math.abs(cross) < 1e-6) return false
    const sign = Math.sign(cross)
    if (orientation && sign !== orientation) return false
    orientation = sign
  }
  return true
}

export function sanitizeDocumentQuad(quad, width, height) {
  if (!Array.isArray(quad) || quad.length !== 4 || width <= 0 || height <= 0) return null
  const points = quad.map((point) => ({
    x: clamp(Number(point?.x), 0, width - 1),
    y: clamp(Number(point?.y), 0, height - 1)
  }))
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  if (!convexQuad(points) || polygonArea(points) < width * height * 0.01) return null
  return points
}

export function defaultDocumentQuad(width, height, margin = 0.025) {
  const insetX = Math.max(1, width * margin)
  const insetY = Math.max(1, height * margin)
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY }
  ]
}

function expandQuad(points, margin, width, height) {
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  )
  return points.map((point) => ({
    x: clamp(center.x + (point.x - center.x) * (1 + margin), 0, width - 1),
    y: clamp(center.y + (point.y - center.y) * (1 + margin), 0, height - 1)
  }))
}

export function detectDocumentQuad(imageData, width, height, options = {}) {
  const settings = { ...DEFAULTS, ...options }
  const histogram = new Uint32Array(256)
  const pixels = imageData.data
  const mask = new Uint8Array(width * height)

  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
    histogram[luminance] += 1
  }

  const adaptiveLuminance = percentile(histogram, width * height, 0.76)
  const minimumLuminance = clamp(adaptiveLuminance - 18, 150, 195)
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
    mask[pixel] = luminance >= minimumLuminance && maximum - minimum <= 85 ? 1 : 0
  }

  const radius = Math.max(2, Math.round(Math.max(width, height) / 160))
  const closed = erode(dilate(mask, width, height, radius), width, height, radius)
  const component = largestComponent(closed, width, height)
  const imageArea = width * height
  if (!component || component.size < imageArea * 0.025) {
    return { quad: null, confidence: 0, reason: 'no-document-component' }
  }

  let topLeft = null
  let topRight = null
  let bottomRight = null
  let bottomLeft = null
  let minimumSum = Infinity
  let maximumSum = -Infinity
  let minimumDifference = Infinity
  let maximumDifference = -Infinity

  for (const index of component.pixels) {
    const y = Math.floor(index / width)
    const x = index - y * width
    const sum = x + y
    const difference = x - y
    if (sum < minimumSum) {
      minimumSum = sum
      topLeft = { x, y }
    }
    if (difference > maximumDifference) {
      maximumDifference = difference
      topRight = { x, y }
    }
    if (sum > maximumSum) {
      maximumSum = sum
      bottomRight = { x, y }
    }
    if (difference < minimumDifference) {
      minimumDifference = difference
      bottomLeft = { x, y }
    }
  }

  let quad = [topLeft, topRight, bottomRight, bottomLeft]
  const area = polygonArea(quad)
  const areaRatio = area / imageArea
  if (areaRatio < 0.02 || areaRatio > 0.985) {
    const { minX, minY, maxX, maxY } = component.bounds
    quad = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ]
  }

  quad = expandQuad(quad, settings.cropMargin, width, height)
  const finalAreaRatio = polygonArea(quad) / imageArea
  const coverageScore = clamp((finalAreaRatio - 0.025) / 0.3, 0, 1)
  const shapeScore = clamp((component.rectangularity - 0.25) / 0.65, 0, 1)
  const borderPenalty = component.touches >= 3 ? 0.45 : component.touches === 2 ? 0.8 : 1
  const confidence = clamp(
    (0.55 * shapeScore + 0.45 * coverageScore) * borderPenalty,
    0,
    1
  )
  return {
    quad,
    confidence,
    reason: confidence >= settings.minimumConfidence ? 'document-detected' : 'low-confidence',
    diagnostics: {
      minimumLuminance,
      areaRatio: finalAreaRatio,
      rectangularity: component.rectangularity,
      touches: component.touches
    }
  }
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function solveLinearSystem(matrix, values) {
  const size = values.length
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-9) throw new Error('Degenerate document quadrilateral')
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const multiplier = augmented[row][column]
      for (let item = column; item <= size; item += 1) {
        augmented[row][item] -= multiplier * augmented[column][item]
      }
    }
  }
  return augmented.map((row) => row[size])
}

function homography(destination, source) {
  const matrix = []
  const values = []
  for (let index = 0; index < 4; index += 1) {
    const { x: u, y: v } = destination[index]
    const { x, y } = source[index]
    matrix.push([u, v, 1, 0, 0, 0, -x * u, -x * v])
    values.push(x)
    matrix.push([0, 0, 0, u, v, 1, -y * u, -y * v])
    values.push(y)
  }
  return solveLinearSystem(matrix, values)
}

function rectifiedGeometry(quad, maximumLongEdge) {
  const naturalWidth = Math.max(distance(quad[0], quad[1]), distance(quad[3], quad[2]))
  const naturalHeight = Math.max(distance(quad[0], quad[3]), distance(quad[1], quad[2]))
  const size = outputSize(naturalWidth, naturalHeight, maximumLongEdge)
  const destination = [
    { x: 0, y: 0 },
    { x: size.width - 1, y: 0 },
    { x: size.width - 1, y: size.height - 1 },
    { x: 0, y: size.height - 1 }
  ]
  return { ...size, transform: homography(destination, quad) }
}

let webGpuDevicePromise = null

async function webGpuDevice() {
  if (!globalThis.navigator?.gpu || typeof globalThis.OffscreenCanvas !== 'function') return null
  if (!webGpuDevicePromise) {
    webGpuDevicePromise = globalThis.navigator.gpu
      .requestAdapter({ powerPreference: 'high-performance' })
      .then((adapter) => adapter?.requestDevice() ?? null)
      .catch(() => null)
    void webGpuDevicePromise.then((device) => {
      if (!device) return
      void device.lost.then(() => { webGpuDevicePromise = null })
    })
  }
  return webGpuDevicePromise
}

const RECTIFY_SHADER = /* wgsl */ `
struct Params {
  h0: vec4<f32>,
  h1: vec4<f32>,
  sourceSize: vec2<f32>,
  rectifiedSize: vec2<f32>,
  rotated: u32,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let outputPixel = position.xy - vec2<f32>(0.5);
  var rectifiedPixel = outputPixel;
  if (params.rotated != 0u) {
    rectifiedPixel = vec2<f32>(params.rectifiedSize.x - outputPixel.y - 1.0, outputPixel.x);
  }
  let x = rectifiedPixel.x;
  let y = rectifiedPixel.y;
  let denominator = params.h1.z * x + params.h1.w * y + 1.0;
  let sourcePixel = vec2<f32>(
    (params.h0.x * x + params.h0.y * y + params.h0.z) / denominator,
    (params.h0.w * x + params.h1.x * y + params.h1.y) / denominator
  );
  let uv = (sourcePixel + vec2<f32>(0.5)) / params.sourceSize;
  let color = textureSample(sourceTexture, sourceSampler, uv);
  return vec4<f32>(color.rgb, 1.0);
}
`

async function rectifyDocumentWebGpu(source, quad, settings) {
  const device = await webGpuDevice()
  if (!device) return null
  if (
    source.width > device.limits.maxTextureDimension2D
    || source.height > device.limits.maxTextureDimension2D
  ) return null

  const geometry = rectifiedGeometry(quad, settings.targetLongEdge)
  const rotated = settings.portraitReceipts && geometry.width > geometry.height * 1.12
  const outputWidth = rotated ? geometry.height : geometry.width
  const outputHeight = rotated ? geometry.width : geometry.height
  if (
    outputWidth > device.limits.maxTextureDimension2D
    || outputHeight > device.limits.maxTextureDimension2D
  ) return null

  const textureUsage = globalThis.GPUTextureUsage
  const bufferUsage = globalThis.GPUBufferUsage
  const mapMode = globalThis.GPUMapMode
  if (!textureUsage || !bufferUsage || !mapMode) return null

  let sourceTexture
  let outputTexture
  let parameterBuffer
  let readbackBuffer
  try {
    sourceTexture = device.createTexture({
      size: [source.width, source.height],
      format: 'rgba8unorm',
      usage: textureUsage.TEXTURE_BINDING
        | textureUsage.COPY_DST
        | textureUsage.RENDER_ATTACHMENT
    })
    device.queue.copyExternalImageToTexture(
      { source },
      { texture: sourceTexture },
      [source.width, source.height]
    )

    const parameterBytes = new ArrayBuffer(64)
    const floats = new Float32Array(parameterBytes)
    floats.set(geometry.transform.slice(0, 4), 0)
    floats.set(geometry.transform.slice(4, 8), 4)
    floats.set([source.width, source.height], 8)
    floats.set([geometry.width, geometry.height], 10)
    new Uint32Array(parameterBytes)[12] = rotated ? 1 : 0
    parameterBuffer = device.createBuffer({
      size: parameterBytes.byteLength,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST
    })
    device.queue.writeBuffer(parameterBuffer, 0, parameterBytes)

    outputTexture = device.createTexture({
      size: [outputWidth, outputHeight],
      format: 'rgba8unorm',
      usage: textureUsage.RENDER_ATTACHMENT | textureUsage.COPY_SRC
    })
    const unpaddedBytesPerRow = outputWidth * 4
    const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256
    readbackBuffer = device.createBuffer({
      size: bytesPerRow * outputHeight,
      usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ
    })

    const shader = device.createShaderModule({ code: RECTIFY_SHADER })
    const pipeline = await device.createRenderPipelineAsync({
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shader,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: { topology: 'triangle-list' }
    })
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sourceTexture.createView() },
        {
          binding: 1,
          resource: device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge'
          })
        },
        { binding: 2, resource: { buffer: parameterBuffer } }
      ]
    })
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: outputTexture.createView(),
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.draw(3)
    pass.end()
    encoder.copyTextureToBuffer(
      { texture: outputTexture },
      { buffer: readbackBuffer, bytesPerRow, rowsPerImage: outputHeight },
      [outputWidth, outputHeight]
    )
    device.queue.submit([encoder.finish()])
    await readbackBuffer.mapAsync(mapMode.READ)
    const mapped = new Uint8Array(readbackBuffer.getMappedRange())
    const pixels = new Uint8ClampedArray(unpaddedBytesPerRow * outputHeight)
    for (let row = 0; row < outputHeight; row += 1) {
      const sourceOffset = row * bytesPerRow
      pixels.set(
        mapped.subarray(sourceOffset, sourceOffset + unpaddedBytesPerRow),
        row * unpaddedBytesPerRow
      )
    }
    readbackBuffer.unmap()
    const canvas = canvasFor(outputWidth, outputHeight)
    canvasContext(canvas).putImageData(
      new globalThis.ImageData(pixels, outputWidth, outputHeight),
      0,
      0
    )
    const output = await encodeCanvasWithFallback(
      canvas,
      settings.preferredMimeType,
      settings.fallbackMimeType,
      settings.imageQuality
    )
    return {
      blob: output.blob,
      mimeType: output.mimeType,
      width: outputWidth,
      height: outputHeight,
      rotated
    }
  } catch {
    return null
  } finally {
    sourceTexture?.destroy()
    outputTexture?.destroy()
    parameterBuffer?.destroy()
    readbackBuffer?.destroy()
  }
}

function sampleBilinear(source, width, height, x, y, output, targetIndex) {
  const left = clamp(Math.floor(x), 0, width - 1)
  const top = clamp(Math.floor(y), 0, height - 1)
  const right = Math.min(width - 1, left + 1)
  const bottom = Math.min(height - 1, top + 1)
  const horizontal = clamp(x - left, 0, 1)
  const vertical = clamp(y - top, 0, 1)
  const topLeft = (top * width + left) * 4
  const topRight = (top * width + right) * 4
  const bottomLeft = (bottom * width + left) * 4
  const bottomRight = (bottom * width + right) * 4
  for (let channel = 0; channel < 3; channel += 1) {
    const upper = source[topLeft + channel] * (1 - horizontal)
      + source[topRight + channel] * horizontal
    const lower = source[bottomLeft + channel] * (1 - horizontal)
      + source[bottomRight + channel] * horizontal
    output[targetIndex + channel] = Math.round(upper * (1 - vertical) + lower * vertical)
  }
  output[targetIndex + 3] = 255
}

export function rectifyDocument(imageData, quad, maximumLongEdge = DEFAULTS.targetLongEdge) {
  const sourceWidth = imageData.width
  const sourceHeight = imageData.height
  const geometry = rectifiedGeometry(quad, maximumLongEdge)
  const { width, height, transform } = geometry
  const output = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = transform[6] * x + transform[7] * y + 1
      const sourceX = (transform[0] * x + transform[1] * y + transform[2]) / denominator
      const sourceY = (transform[3] * x + transform[4] * y + transform[5]) / denominator
      sampleBilinear(
        imageData.data,
        sourceWidth,
        sourceHeight,
        sourceX,
        sourceY,
        output,
        (y * width + x) * 4
      )
    }
  }
  return new globalThis.ImageData(output, width, height)
}

async function rectifyDocumentOffMainThread(imageData, quad, maximumLongEdge, signal) {
  if (typeof globalThis.Worker !== 'function') {
    return rectifyDocument(imageData, quad, maximumLongEdge)
  }
  if (signal?.aborted) throw new DOMException('Image processing was cancelled', 'AbortError')

  const worker = new Worker(
    new URL('./document-preprocess-worker.js', import.meta.url),
    { type: 'module', name: 'bianco-document-preprocess' }
  )
  return new Promise((resolve, reject) => {
    const cancel = () => {
      worker.terminate()
      reject(new DOMException('Image processing was cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onmessage = ({ data }) => {
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      if (data.error) {
        reject(new Error(data.error))
        return
      }
      resolve(new globalThis.ImageData(
        new Uint8ClampedArray(data.pixels),
        data.width,
        data.height
      ))
    }
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      reject(new Error(event.message || 'Image processing worker failed'))
    }
    worker.postMessage({
      pixels: imageData.data.buffer,
      width: imageData.width,
      height: imageData.height,
      quad,
      maximumLongEdge
    }, [imageData.data.buffer])
  })
}

function rotateCounterClockwise(imageData) {
  const sourceWidth = imageData.width
  const sourceHeight = imageData.height
  const output = new Uint8ClampedArray(imageData.data.length)
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceIndex = (y * sourceWidth + x) * 4
      const targetX = y
      const targetY = sourceWidth - x - 1
      const targetIndex = (targetY * sourceHeight + targetX) * 4
      output[targetIndex] = imageData.data[sourceIndex]
      output[targetIndex + 1] = imageData.data[sourceIndex + 1]
      output[targetIndex + 2] = imageData.data[sourceIndex + 2]
      output[targetIndex + 3] = 255
    }
  }
  return new globalThis.ImageData(output, sourceHeight, sourceWidth)
}

function scaleQuad(quad, horizontalScale, verticalScale) {
  return quad.map(({ x, y }) => ({
    x: x * horizontalScale,
    y: y * verticalScale
  }))
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      return createImageBitmap(blob)
    }
  }
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  image.close = () => URL.revokeObjectURL(url)
  return image
}

function detectQuadOnSource(source, settings) {
  const detectionSize = outputSize(source.width, source.height, settings.detectionLongEdge)
  const detectionCanvas = canvasFor(detectionSize.width, detectionSize.height)
  const detectionContext = canvasContext(detectionCanvas)
  detectionContext.fillStyle = '#fff'
  detectionContext.fillRect(0, 0, detectionSize.width, detectionSize.height)
  detectionContext.drawImage(source, 0, 0, detectionSize.width, detectionSize.height)
  const detectionImage = detectionContext.getImageData(
    0,
    0,
    detectionSize.width,
    detectionSize.height
  )
  const detection = detectDocumentQuad(
    detectionImage,
    detectionSize.width,
    detectionSize.height,
    settings
  )
  const scaled = detection.quad
    ? scaleQuad(
        detection.quad,
        source.width / detectionSize.width,
        source.height / detectionSize.height
      )
    : null
  return {
    ...detection,
    quad: sanitizeDocumentQuad(scaled, source.width, source.height)
  }
}

export async function detectReceiptDocument(blob, options = {}) {
  const settings = { ...DEFAULTS, ...options }
  const source = await decodeImage(blob)
  try {
    const detection = detectQuadOnSource(source, settings)
    const detected = detection.quad && detection.confidence >= settings.minimumConfidence
    return {
      width: source.width,
      height: source.height,
      quad: detected
        ? detection.quad
        : defaultDocumentQuad(source.width, source.height),
      detected,
      confidence: detection.confidence,
      reason: detection.reason,
      diagnostics: detection.diagnostics ?? null
    }
  } finally {
    source.close?.()
  }
}

export async function preprocessReceiptDocument(blob, options = {}) {
  const settings = {
    ...DEFAULTS,
    ...options,
    // Keep the benchmark CLI compatible while production uses imageQuality.
    imageQuality: options.imageQuality ?? options.jpegQuality ?? DEFAULTS.imageQuality
  }
  const source = await decodeImage(blob)
  try {
    const requestedQuad = options.sourceQuad == null
      ? null
      : sanitizeDocumentQuad(options.sourceQuad, source.width, source.height)
    if (options.sourceQuad != null && !requestedQuad) {
      throw new Error('Invalid document quadrilateral')
    }
    const detection = requestedQuad
      ? {
          quad: requestedQuad,
          confidence: 1,
          reason: 'user-adjusted',
          diagnostics: null
        }
      : detectQuadOnSource(source, settings)

    let sourceQuad = requestedQuad
    if (!sourceQuad && detection.quad && detection.confidence >= settings.minimumConfidence) {
      sourceQuad = detection.quad
    }
    if (sourceQuad) {
      const gpuOutput = await rectifyDocumentWebGpu(source, sourceQuad, settings)
      if (gpuOutput) {
        return {
          blob: gpuOutput.blob,
          mimeType: gpuOutput.mimeType,
          width: gpuOutput.width,
          height: gpuOutput.height,
          transform: {
            applied: true,
            rotated: gpuOutput.rotated,
            accelerator: 'webgpu',
            confidence: detection.confidence,
            reason: detection.reason,
            quad: sourceQuad,
            diagnostics: detection.diagnostics ?? null
          }
        }
      }
    }

    // The CPU path must never materialize a phone camera's full 12–48 MP frame.
    // Downscale first, then transfer the bounded buffer to a worker for the
    // pixel-by-pixel perspective transform.
    const cpuSize = outputSize(source.width, source.height, settings.targetLongEdge)
    const sourceCanvas = canvasFor(cpuSize.width, cpuSize.height)
    const sourceContext = canvasContext(sourceCanvas)
    sourceContext.fillStyle = '#fff'
    sourceContext.fillRect(0, 0, cpuSize.width, cpuSize.height)
    sourceContext.drawImage(source, 0, 0, cpuSize.width, cpuSize.height)
    const sourceImage = sourceContext.getImageData(0, 0, cpuSize.width, cpuSize.height)
    const cpuQuad = sourceQuad
      ? scaleQuad(
          sourceQuad,
          cpuSize.width / source.width,
          cpuSize.height / source.height
        )
      : null

    let processed
    let applied = false
    let accelerator = 'canvas'
    if (cpuQuad) {
      processed = await rectifyDocumentOffMainThread(
        sourceImage,
        cpuQuad,
        settings.targetLongEdge,
        options.signal
      )
      applied = true
      accelerator = 'cpu'
    } else {
      const size = outputSize(source.width, source.height, settings.targetLongEdge)
      const fallback = canvasFor(size.width, size.height)
      const fallbackContext = canvasContext(fallback)
      fallbackContext.fillStyle = '#fff'
      fallbackContext.fillRect(0, 0, size.width, size.height)
      fallbackContext.drawImage(source, 0, 0, size.width, size.height)
      processed = fallbackContext.getImageData(0, 0, size.width, size.height)
    }

    let rotated = false
    if (
      settings.portraitReceipts
      && processed.width > processed.height * 1.12
    ) {
      processed = rotateCounterClockwise(processed)
      rotated = true
    }

    const outputCanvas = canvasFor(processed.width, processed.height)
    canvasContext(outputCanvas).putImageData(processed, 0, 0)
    const output = await encodeCanvasWithFallback(
      outputCanvas,
      settings.preferredMimeType,
      settings.fallbackMimeType,
      settings.imageQuality
    )
    return {
      blob: output.blob,
      mimeType: output.mimeType,
      width: processed.width,
      height: processed.height,
      transform: {
        applied,
        rotated,
        accelerator,
        confidence: detection.confidence,
        reason: detection.reason,
        quad: sourceQuad,
        diagnostics: detection.diagnostics ?? null
      }
    }
  } finally {
    source.close?.()
  }
}

export { DEFAULTS as RECEIPT_PREPROCESS_DEFAULTS }
