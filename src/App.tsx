import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canvasToFloat32Array,
  float32ArrayToCanvas,
  grayscaleToRgbCanvas,
  maskImageCanvas,
  resizeAndPadBox,
  resizeCanvas,
  sliceTensorMask,
  type Size,
} from './imageUtils'
import { loadImageAsCanvas } from './tiffLoader'
import assetList from 'virtual:asset-list'

const IMAGE_SIZE: Size = { w: 1024, h: 1024 }
const MASK_SIZE: Size = { w: 256, h: 256 }
const IMAGE_URLS = assetList.length > 0 ? assetList : ['/assets/LSP33352.png']

type WorkerMessage =
  | { type: 'pong'; data: { success: boolean; device: string | null } }
  | { type: 'loadingInProgress' }
  | { type: 'encodeImageDone'; data: object }
  | { type: 'decodeMaskResult'; data: { masks: { dims: number[]; cpuData: Float32Array }; iou_predictions: Float32Array } }
  | { type: 'error'; data: string }

export default function App() {
  const [device, setDevice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageEncoded, setImageEncoded] = useState(false)
  const [status, setStatus] = useState('Loading…')
  const [image, setImage] = useState<HTMLCanvasElement | null>(null)
  const [imageIndex, setImageIndex] = useState(0)
  const [mask, setMask] = useState<HTMLCanvasElement | null>(null)
  const [prevMaskArray, setPrevMaskArray] = useState<Float32Array | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Array<{ x: number; y: number; label: number }>>([])

  const onWorkerMessage = useCallback((event: MessageEvent<WorkerMessage>) => {
    const msg = event.data
    if (msg.type === 'pong') {
      setLoading(false)
      setDevice(msg.data.device ?? null)
      setStatus(msg.data.success ? 'Encode image' : 'Error loading model')
      return
    }
    if (msg.type === 'loadingInProgress') {
      setLoading(true)
      setStatus('Loading model…')
      return
    }
    if (msg.type === 'encodeImageDone') {
      setImageEncoded(true)
      setLoading(false)
      setStatus('Ready. Click on image to segment')
      return
    }
    if (msg.type === 'decodeMaskResult') {
      const { masks, iou_predictions } = msg.data
      const scores = Array.from(iou_predictions)
      const bestIdx = scores.indexOf(Math.max(...scores))
      const bestMaskArray = sliceTensorMask(masks, bestIdx)
      let maskCanvas = float32ArrayToCanvas(
        bestMaskArray,
        masks.dims[2],
        masks.dims[3]
      )
      maskCanvas = resizeCanvas(maskCanvas, IMAGE_SIZE)
      setMask(maskCanvas)
      setPrevMaskArray(bestMaskArray)
      setLoading(false)
      setStatus('Ready. Click on image to segment')
      return
    }
    if (msg.type === 'error') {
      setLoading(false)
      setStatus(`Error: ${msg.data}`)
    }
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('./sam2.worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = onWorkerMessage
    workerRef.current = worker
    worker.postMessage({ type: 'ping' })
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [onWorkerMessage])

  useEffect(() => {
    setImageError(null)
    const index = IMAGE_URLS.length ? Math.min(imageIndex, IMAGE_URLS.length - 1) : 0
    const url = IMAGE_URLS[index]
    if (!url) {
      setImage(null)
      return
    }
    loadImageAsCanvas(url)
      .then((imgCanvas) => {
        setImageError(null)
        grayscaleToRgbCanvas(imgCanvas)
        const w = imgCanvas.width
        const h = imgCanvas.height
        const largest = Math.max(w, h)
        const box = resizeAndPadBox({ w, h }, { w: largest, h: largest })
        const padded = document.createElement('canvas')
        padded.width = largest
        padded.height = largest
        const ctx = padded.getContext('2d')!
        ctx.drawImage(imgCanvas, 0, 0, w, h, box.x, box.y, box.w, box.h)
        setImage(padded)
      })
      .catch(() => {
        setImageError(`Could not load ${url}. Add images (.tif, .png, .jpg, etc.) to public/assets/`)
        setImage(null)
      })
  }, [imageIndex])

  const switchImage = (direction: 'prev' | 'next') => {
    const next =
      direction === 'next'
        ? (imageIndex + 1) % IMAGE_URLS.length
        : (imageIndex - 1 + IMAGE_URLS.length) % IMAGE_URLS.length
    setImageIndex(next)
    pointsRef.current = []
    setMask(null)
    setPrevMaskArray(null)
    setImageEncoded(false)
    setStatus(device ? 'Encode image' : status)
  }

  useEffect(() => {
    if (!image || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height)
  }, [image])

  useEffect(() => {
    if (!image || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    if (!mask) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height)
      return
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 0.5
    ctx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1
  }, [mask, image])

  const encodeImage = () => {
    if (!image || !workerRef.current) return
    setLoading(true)
    setStatus('Encoding…')
    const resized = resizeCanvas(image, IMAGE_SIZE)
    const { float32Array, shape } = canvasToFloat32Array(resized)
    workerRef.current.postMessage({
      type: 'encodeImage',
      data: { float32Array, shape },
    })
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageEncoded || !image || !workerRef.current || !canvasRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / canvas.width) * 1024
    const y = ((e.clientY - rect.top) / canvas.height) * 1024
    const label = e.button === 0 ? 1 : 0
    pointsRef.current.push({ x, y, label })
    setLoading(true)
    setStatus('Decoding…')
    workerRef.current.postMessage({
      type: 'decodeMask',
      data: {
        points: [...pointsRef.current],
        maskArray: prevMaskArray ?? null,
        maskShape: prevMaskArray ? [1, 1, MASK_SIZE.w, MASK_SIZE.h] : null,
      },
    })
  }

  const crop = () => {
    if (!image || !mask) return
    const cropped = maskImageCanvas(image, mask)
    const link = document.createElement('a')
    link.href = cropped.toDataURL('image/png')
    link.download = 'crop.png'
    link.click()
  }

  const reset = () => {
    pointsRef.current = []
    setMask(null)
    setPrevMaskArray(null)
    setStatus('Ready. Click on image to segment')
  }

  if (imageError && !image) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 900 }}>
        <h1>SAM 2 segmentation</h1>
        <p style={{ color: 'crimson' }}>{imageError}</p>
        {IMAGE_URLS.length > 1 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => switchImage('prev')}>
              ← Prev image
            </button>
            <span style={{ color: '#666' }}>
              Image {imageIndex + 1} / {IMAGE_URLS.length}
            </span>
            <button type="button" onClick={() => switchImage('next')}>
              Next image →
            </button>
          </div>
        )}
        <p style={{ marginTop: 16 }}>Add images (.tif, .png, .jpg, etc.) to <code>public/assets/</code>.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 900 }}>
      <h1>SAM 2 segmentation</h1>
      {device && <p style={{ color: '#666' }}>Running on {device}</p>}
      <p>
        {loading && <span style={{ marginRight: 8 }}>⏳</span>}
        {status}
      </p>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {IMAGE_URLS.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => switchImage('prev')}
              disabled={loading}
              title="Previous image"
            >
              ← Prev
            </button>
            <span style={{ color: '#666', fontSize: 14 }}>
              Image {imageIndex + 1} / {IMAGE_URLS.length}
            </span>
            <button
              type="button"
              onClick={() => switchImage('next')}
              disabled={loading}
              title="Next image"
            >
              Next →
            </button>
            <span style={{ width: 8 }} />
          </>
        )}
        <button
          type="button"
          onClick={encodeImage}
          disabled={loading || !image}
        >
          Encode image
        </button>
        <button
          type="button"
          onClick={crop}
          disabled={!mask}
        >
          Crop
        </button>
        <button type="button" onClick={reset} disabled={loading}>
          Reset points
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        style={{ maxWidth: '100%', height: 'auto', cursor: imageEncoded ? 'crosshair' : 'default', border: '1px solid #ccc' }}
        onMouseDown={onCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
