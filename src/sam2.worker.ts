/**
 * Web Worker: loads SAM2, runs encode/decode off the main thread.
 * Point WASM to our public copy so it's served with correct MIME type.
 */
import { SAM2 } from './sam2'
import * as ort from 'onnxruntime-web'

const base = typeof self !== 'undefined' && self.location ? self.location.origin : ''
ort.env.wasm.wasmPaths = `${base}/wasm/`

const sam = new SAM2()

interface EncodeMessage {
  type: 'encodeImage'
  data: { float32Array: Float32Array; shape: number[] }
}

interface DecodeMessage {
  type: 'decodeMask'
  data: {
    points: Array<{ x: number; y: number; label: number }>
    maskArray: Float32Array | null
    maskShape: number[] | null
  }
}

type WorkerMessage =
  | { type: 'ping' }
  | EncodeMessage
  | DecodeMessage

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data
  try {
    if (msg.type === 'ping') {
      self.postMessage({ type: 'loadingInProgress' })
      await sam.downloadModels()
      self.postMessage({ type: 'loadingInProgress' })
      const report = await sam.createSessions()
      self.postMessage({ type: 'pong', data: report })
      return
    }
    if (msg.type === 'encodeImage') {
      const { float32Array, shape } = msg.data
      const tensor = new ort.Tensor('float32', float32Array, shape)
      await sam.encodeImage(tensor)
      self.postMessage({ type: 'encodeImageDone', data: {} })
      return
    }
    if (msg.type === 'decodeMask') {
      const { points, maskArray, maskShape } = msg.data
      const maskTensor =
        maskArray && maskShape
          ? new ort.Tensor('float32', maskArray, maskShape)
          : undefined
      const result = await sam.decode(points, maskTensor)
      // Send cloneable data (Tensor is not structured-cloneable)
      self.postMessage({
        type: 'decodeMaskResult',
        data: {
          masks: {
            dims: [...result.masks.dims],
            cpuData: new Float32Array(result.masks.data as Float32Array),
          },
          iou_predictions: new Float32Array(result.iou_predictions.data as Float32Array),
        },
      })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', data: String(err) })
  }
}
