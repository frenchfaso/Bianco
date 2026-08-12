#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromClient = createRequire(join(ROOT, 'client', 'package.json'))
const { chromium } = requireFromClient('playwright')

function parseArguments(argv) {
  const options = {
    dataset: join(ROOT, 'dataset'),
    labels: join(ROOT, 'dataset', 'labels.json'),
    output: join(ROOT, 'dataset', 'processed', 'geometry-3200'),
    report: join(ROOT, 'dataset', 'results', 'preprocessing-geometry-3200.json'),
    targetLongEdge: 3200,
    detectionLongEdge: 960,
    jpegQuality: 0.9,
    imageFilters: []
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (argument === '--dataset') options.dataset = resolve(value), index += 1
    else if (argument === '--labels') options.labels = resolve(value), index += 1
    else if (argument === '--output') options.output = resolve(value), index += 1
    else if (argument === '--report') options.report = resolve(value), index += 1
    else if (argument === '--target-long-edge') options.targetLongEdge = Number(value), index += 1
    else if (argument === '--detection-long-edge') options.detectionLongEdge = Number(value), index += 1
    else if (argument === '--jpeg-quality') options.jpegQuality = Number(value), index += 1
    else if (argument === '--image-filter') options.imageFilters.push(value), index += 1
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!Number.isInteger(options.targetLongEdge) || options.targetLongEdge < 1000) {
    throw new Error('--target-long-edge must be an integer of at least 1000')
  }
  if (!Number.isInteger(options.detectionLongEdge) || options.detectionLongEdge < 320) {
    throw new Error('--detection-long-edge must be an integer of at least 320')
  }
  if (!(options.jpegQuality > 0 && options.jpegQuality <= 1)) {
    throw new Error('--jpeg-quality must be between 0 and 1')
  }
  return options
}

function contentType(path) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function pageHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<script type="module">
  import { preprocessReceiptDocument } from '/client/src/images/document-preprocess.js'

  function bytesToBase64(bytes) {
    const chunkSize = 0x8000
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
  }

  window.preprocessReceipt = async (imageUrl, options) => {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error('Cannot load source image: ' + response.status)
    const result = await preprocessReceiptDocument(await response.blob(), options)
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    return {
      base64: bytesToBase64(bytes),
      width: result.width,
      height: result.height,
      mimeType: result.mimeType,
      transform: result.transform
    }
  }
  window.preprocessingReady = true
</script>`
}

function safeWorkspacePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0])
  const path = resolve(ROOT, `.${decoded}`)
  const inside = path === ROOT || relative(ROOT, path).split(sep)[0] !== '..'
  return inside ? path : null
}

async function startServer() {
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(pageHtml())
      return
    }
    const path = safeWorkspacePath(request.url)
    if (!path) {
      response.writeHead(403)
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': contentType(path), 'Cache-Control': 'no-store' })
    createReadStream(path)
      .on('error', () => {
        if (!response.headersSent) response.writeHead(404)
        response.end()
      })
      .pipe(response)
  })
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  return server
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const labels = JSON.parse(await readFile(options.labels, 'utf8'))
  const selected = labels.filter(({ image }) => (
    options.imageFilters.length === 0
    || options.imageFilters.some((filter) => image.includes(filter))
  ))
  if (selected.length === 0) throw new Error('No labeled receipt matched the filters')

  await mkdir(options.output, { recursive: true })
  await mkdir(dirname(options.report), { recursive: true })
  const server = await startServer()
  const address = server.address()
  const browserPaths = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean)
  const executablePath = browserPaths.find((path) => existsSync(path))
  let browser = null
  const results = []

  try {
    browser = await chromium.launch({ headless: true, executablePath })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/`)
    await page.waitForFunction(() => window.preprocessingReady === true)
    for (const { image } of selected) {
      const sourcePath = resolve(options.dataset, image)
      const workspacePath = relative(ROOT, sourcePath).split(sep).map(encodeURIComponent).join('/')
      const started = performance.now()
      const result = await page.evaluate(
        ({ url, processingOptions }) => window.preprocessReceipt(url, processingOptions),
        {
          url: `/${workspacePath}`,
          processingOptions: {
            targetLongEdge: options.targetLongEdge,
            detectionLongEdge: options.detectionLongEdge,
            jpegQuality: options.jpegQuality,
            preferredMimeType: 'image/jpeg',
            fallbackMimeType: 'image/jpeg'
          }
        }
      )
      const bytes = Buffer.from(result.base64, 'base64')
      await writeFile(join(options.output, image), bytes)
      const entry = {
        image,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        durationMilliseconds: Math.round(performance.now() - started),
        transform: result.transform
      }
      results.push(entry)
      console.log(
        `${image}: ${entry.width}x${entry.height} `
        + `crop=${entry.transform.applied} rotate=${entry.transform.rotated} `
        + `confidence=${entry.transform.confidence.toFixed(3)} `
        + `${entry.durationMilliseconds}ms`
      )
    }
  } finally {
    await browser?.close()
    await new Promise((resolvePromise) => server.close(resolvePromise))
  }

  const report = {
    createdAt: new Date().toISOString(),
    sourceDataset: options.dataset,
    outputDataset: options.output,
    settings: {
      targetLongEdge: options.targetLongEdge,
      detectionLongEdge: options.detectionLongEdge,
      jpegQuality: options.jpegQuality
    },
    receipts: results
  }
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`report: ${options.report}`)
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`)
  process.exitCode = 1
})
