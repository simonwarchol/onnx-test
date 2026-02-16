/** Image helpers for SAM2: resize, pad, canvas ↔ float32 tensor, mask overlay. */

export interface Size {
  w: number
  h: number
}

/** { x, y, w, h } to fit source into target preserving aspect (pad to square). */
export function resizeAndPadBox(
  sourceDim: Size,
  targetDim: Size
): { x: number; y: number; w: number; h: number } {
  if (sourceDim.h === sourceDim.w) {
    return { x: 0, y: 0, w: targetDim.w, h: targetDim.h }
  }
  if (sourceDim.h > sourceDim.w) {
    const newW = (sourceDim.w / sourceDim.h) * targetDim.w
    const padLeft = Math.floor((targetDim.w - newW) / 2)
    return { x: padLeft, y: 0, w: newW, h: targetDim.h }
  }
  const newH = (sourceDim.h / sourceDim.w) * targetDim.h
  const padTop = Math.floor((targetDim.h - newH) / 2)
  return { x: 0, y: padTop, w: targetDim.w, h: newH }
}

export function resizeCanvas(canvasOrig: HTMLCanvasElement, size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = size.w
  canvas.height = size.h
  ctx.drawImage(canvasOrig, 0, 0, canvasOrig.width, canvasOrig.height, 0, 0, size.w, size.h)
  return canvas
}

/** Canvas RGB → Float32Array + shape [1, 3, W, H] for encoder (values 0–1). */
export function canvasToFloat32Array(canvas: HTMLCanvasElement): {
  float32Array: Float32Array
  shape: number[]
} {
  const imageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
  const shape = [1, 3, canvas.width, canvas.height]
  const red: number[] = []
  const green: number[] = []
  const blue: number[] = []
  for (let i = 0; i < imageData.length; i += 4) {
    red.push(imageData[i])
    green.push(imageData[i + 1])
    blue.push(imageData[i + 2])
  }
  const transposed = [...red, ...green, ...blue]
  const float32Array = new Float32Array(transposed.length)
  for (let i = 0; i < transposed.length; i++) {
    float32Array[i] = transposed[i] / 255
  }
  return { float32Array, shape }
}

/** Slice one mask from decoder output [1, numMasks, W, H] at index. */
export function sliceTensorMask(tensor: { dims: number[]; cpuData: Float32Array }, maskIdx: number): Float32Array {
  const [, , width, height] = tensor.dims
  const stride = width * height
  const start = stride * maskIdx
  return tensor.cpuData.slice(start, start + stride)
}

/** Float32 mask array (W*H) → canvas RGBA for overlay. */
export function float32ArrayToCanvas(
  array: Float32Array,
  width: number,
  height: number
): HTMLCanvasElement {
  const C = 4
  const imageData = new Uint8ClampedArray(array.length * C)
  for (let i = 0; i < array.length; i++) {
    const masked = array[i] > 0
    imageData[i * C] = masked ? 0x32 : 0
    imageData[i * C + 1] = masked ? 0xcd : 0
    imageData[i * C + 2] = masked ? 0x32 : 0
    imageData[i * C + 3] = masked ? 255 : 0
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(imageData, width, height), 0, 0)
  return canvas
}

/** Crop image to mask: result shows image only where mask is non-zero. */
export function maskImageCanvas(
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = imageCanvas.width
  canvas.height = imageCanvas.height
  ctx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(imageCanvas, 0, 0, imageCanvas.width, imageCanvas.height, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** If canvas is grayscale (R≈G≈B or single-channel), duplicate to RGB for SAM; otherwise leave color as-is. */
export function grayscaleToRgbCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  const tolerance = 2
  let grayCount = 0
  const step = Math.max(1, Math.floor((d.length / 4) / 1000))
  for (let i = 0; i < d.length; i += 4 * step) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const sameChannels = Math.abs(r - g) <= tolerance && Math.abs(g - b) <= tolerance
    const singleChannel = Math.abs(g) <= tolerance && Math.abs(b) <= tolerance
    if (sameChannels || singleChannel) grayCount++
  }
  const samples = Math.ceil((d.length / 4) / step)
  const isGrayscale = grayCount >= 0.95 * samples
  if (!isGrayscale) return canvas
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i]
    d[i] = g
    d[i + 1] = g
    d[i + 2] = g
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}
