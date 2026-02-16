/**
 * Load an image (TIFF, PNG, JPEG, etc.) from URL or File and return a canvas.
 * TIFF uses UTIF; PNG/JPEG/WebP/GIF use the browser's native Image decoding.
 */
// @ts-expect-error utif has no type definitions
import UTIF from 'utif'

const TIFF_EXT = /\.(tif|tiff)$/i

export async function loadTiffAsCanvas(source: string | File): Promise<HTMLCanvasElement> {
  const buffer = await (typeof source === 'string'
    ? fetch(source).then((r) => r.arrayBuffer())
    : source.arrayBuffer())
  const ifds = UTIF.decode(buffer)
  if (!ifds.length) throw new Error('No TIFF pages found')
  const ifd = ifds[0]
  UTIF.decodeImage(buffer, ifd)
  const rgba = UTIF.toRGBA8(ifd)
  const w = ifd.width
  const h = ifd.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const imageData = new ImageData(new Uint8ClampedArray(rgba), w, h)
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/** Load PNG/JPEG/WebP/GIF via Image, draw to canvas. */
function loadRasterImageAsCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Load any supported image (TIFF or browser raster formats) as a canvas.
 * Use for URLs or File objects. For File, format is inferred from name or type.
 */
export async function loadImageAsCanvas(source: string | File): Promise<HTMLCanvasElement> {
  if (typeof source === 'string') {
    if (TIFF_EXT.test(source)) return loadTiffAsCanvas(source)
    return loadRasterImageAsCanvas(source)
  }
  const name = source.name.toLowerCase()
  if (TIFF_EXT.test(name)) return loadTiffAsCanvas(source)
  const url = URL.createObjectURL(source)
  try {
    return await loadRasterImageAsCanvas(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}
