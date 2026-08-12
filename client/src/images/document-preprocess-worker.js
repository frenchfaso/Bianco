import { rectifyDocument } from './document-preprocess.js'

self.onmessage = ({ data }) => {
  try {
    const source = new ImageData(
      new Uint8ClampedArray(data.pixels),
      data.width,
      data.height
    )
    const output = rectifyDocument(source, data.quad, data.maximumLongEdge)
    self.postMessage({
      pixels: output.data.buffer,
      width: output.width,
      height: output.height
    }, [output.data.buffer])
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) })
  }
}
