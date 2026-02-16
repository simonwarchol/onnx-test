/**
 * SAM 2 (Segment Anything Model 2) client-side via onnxruntime-web.
 * WebGPU first, CPU fallback. Encoder (ORT) + Decoder (ONNX).
 */
import * as ort from 'onnxruntime-web'

const ENCODER_URL =
  'https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/sam2_hiera_tiny_encoder.with_runtime_opt.ort'
const DECODER_URL =
  'https://huggingface.co/g-ronimo/sam2-tiny/resolve/main/sam2_hiera_tiny_decoder_pr1.onnx'

function basename(url: string): string {
  return url.split('/').pop() ?? url
}

export type ExecutionProvider = 'webgpu' | 'cpu'

export interface SAM2SessionReport {
  success: boolean
  device: ExecutionProvider | null
}

export class SAM2 {
  private bufferEncoder: ArrayBuffer | null = null
  private bufferDecoder: ArrayBuffer | null = null
  private sessionEncoder: [ort.InferenceSession, ExecutionProvider] | null = null
  private sessionDecoder: [ort.InferenceSession, ExecutionProvider] | null = null
  private imageEncoded: {
    high_res_feats_0: ort.Tensor
    high_res_feats_1: ort.Tensor
    image_embed: ort.Tensor
  } | null = null

  async downloadModels(): Promise<void> {
    this.bufferEncoder = await this.downloadModel(ENCODER_URL)
    this.bufferDecoder = await this.downloadModel(DECODER_URL)
  }

  private async downloadModel(url: string): Promise<ArrayBuffer> {
    const filename = basename(url)
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(filename, { create: false })
      const file = await fileHandle.getFile()
      if (file.size > 0) return await file.arrayBuffer()
    } catch {
      // not cached
    }
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) throw new Error(`Failed to fetch ${filename}: ${response.status}`)
    const buffer = await response.arrayBuffer()
    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(buffer)
      await writable.close()
    } catch (e) {
      // QuotaExceededError or other storage errors: use model in memory without caching
      if (e instanceof Error && e.name !== 'QuotaExceededError') {
        console.warn('Failed to cache model:', e)
      }
    }
    return buffer
  }

  /** Try webgpu then cpu; return [session, provider]. */
  private async createSession(model: ArrayBuffer): Promise<[ort.InferenceSession, ExecutionProvider]> {
    const providers: ExecutionProvider[] = ['webgpu', 'cpu']
    for (const ep of providers) {
      try {
        const session = await ort.InferenceSession.create(model, {
          executionProviders: [ep],
        })
        return [session, ep]
      } catch (e) {
        console.warn(`Session create failed for ${ep}:`, e)
        continue
      }
    }
    throw new Error('Could not create session with webgpu or cpu')
  }

  async createSessions(): Promise<SAM2SessionReport> {
    if (!this.bufferEncoder || !this.bufferDecoder) {
      return { success: false, device: null }
    }
    this.sessionEncoder = await this.createSession(this.bufferEncoder)
    this.sessionDecoder = await this.createSession(this.bufferDecoder)
    return {
      success: true,
      device: this.sessionEncoder[1],
    }
  }

  async encodeImage(inputTensor: ort.Tensor): Promise<void> {
    const [session] = await this.getEncoderSession()
    const results = await session.run({ image: inputTensor })
    const names = session.outputNames
    this.imageEncoded = {
      high_res_feats_0: results[names[0]] as ort.Tensor,
      high_res_feats_1: results[names[1]] as ort.Tensor,
      image_embed: results[names[2]] as ort.Tensor,
    }
  }

  private async getEncoderSession(): Promise<[ort.InferenceSession, ExecutionProvider]> {
    if (!this.sessionEncoder) throw new Error('Encoder session not created')
    return this.sessionEncoder
  }

  private async getDecoderSession(): Promise<[ort.InferenceSession, ExecutionProvider]> {
    if (!this.sessionDecoder) throw new Error('Decoder session not created')
    return this.sessionDecoder
  }

  async decode(
    points: Array<{ x: number; y: number; label: number }>,
    maskInput?: ort.Tensor
  ): Promise<{ masks: ort.Tensor; iou_predictions: ort.Tensor }> {
    const [session] = await this.getDecoderSession()
    if (!this.imageEncoded) throw new Error('Image not encoded')

    const flatPoints = points.flatMap((p) => [p.x, p.y])
    const flatLabels = points.map((p) => p.label)

    const maskInputTensor =
      maskInput ??
      new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256])
    const hasMaskInput = new ort.Tensor(
      'float32',
      maskInput ? [1] : [0],
      [1]
    )

    const inputs: Record<string, ort.Tensor> = {
      image_embed: this.imageEncoded.image_embed,
      high_res_feats_0: this.imageEncoded.high_res_feats_0,
      high_res_feats_1: this.imageEncoded.high_res_feats_1,
      point_coords: new ort.Tensor('float32', flatPoints, [1, points.length, 2]),
      point_labels: new ort.Tensor('float32', flatLabels, [1, points.length]),
      mask_input: maskInputTensor,
      has_mask_input: hasMaskInput,
    }

    const results = await session.run(inputs)
    const masks = results[session.outputNames[0]] as ort.Tensor
    const iou_predictions = results[session.outputNames[1]] as ort.Tensor
    return { masks, iou_predictions }
  }
}
