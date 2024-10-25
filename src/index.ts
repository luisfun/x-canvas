import pkg from '../package.json' assert { type: 'json' }
import type { DivElement, DivProps, ImgElement, ImgProps, Options, RequestWorker, XElement } from './types'

const isNonElement = (elem: XElement) =>
  typeof elem !== 'object' || elem instanceof ImageBitmap || elem instanceof OffscreenCanvas

export class XCanvas {
  #worker: Worker
  #canvas: OffscreenCanvas
  #options: Options | undefined
  #isOptionsPosted = false
  #transfer: Transferable[] = []
  /**
   * @param {HTMLCanvasElement} canvasElement
   * @param {Options} options
   * @returns {XCanvas}
   */
  constructor(canvasElement: HTMLCanvasElement, workerDir: string, options?: Options) {
    this.#worker = new Worker(`${workerDir}/x-canvas@${pkg.version}${options?.debugMode ? '' : '.min'}.js`)
    this.#canvas = canvasElement.transferControlToOffscreen()
    this.#options = options
    //worker.onmessage = (event: MessageEvent) => {
    //  console.log('Result from worker:', event.data)
    //}
    this.#worker.postMessage(
      {
        canvas: this.#canvas,
        options: this.#isOptionsPosted ? undefined : this.#options,
        root: { type: 'div', props: {}, children: [] } as DivElement,
      } as RequestWorker,
      [this.#canvas],
    )
  }

  /**
   * Overwrite options set in init. If nothing is written, it is undefined and overwritten.
   * @param {Options} options
   */
  options(options?: Options) {
    this.#options = options ?? {}
    this.#isOptionsPosted = false
  }

  /**
   * @param {DivProps} props
   * @param {...XElement} children
   */
  render(props: DivProps, ...children: XElement[]) {
    this.#transfer = []
    const root: DivElement = { type: 'div', props, children }
    this.#getTransferable(root)
    this.#worker.postMessage(
      { root, options: this.#isOptionsPosted ? undefined : this.#options } as RequestWorker,
      this.#transfer,
    )
    this.#isOptionsPosted = true
  }

  #getTransferable(elem: DivElement | ImgElement) {
    for (const child of elem.children) {
      if (child instanceof OffscreenCanvas || child instanceof ImageBitmap) this.#transfer.push(child)
      if (!isNonElement(child)) this.#getTransferable(child)
    }
  }
}

/**
 * @param {DivProps} props
 * @param {...XElement} children
 * @returns {DivElement}
 */
export const div = (props: DivProps, ...children: XElement[]): DivElement => ({ type: 'div', props, children })
/**
 * @param {ImgProps} props
 * @returns {ImgElement}
 */
export const img = (props: ImgProps, src: ImgElement['children'][number]): ImgElement => ({
  type: 'img',
  props,
  children: [src],
})

/**
 * Save image or Open in a new tab
 * @param {HTMLCanvasElement} canvasElement
 * @param {string} fileName Image file name. Undefined: Open in a new tab
 */
export const imageDownload = async (canvasElement: HTMLCanvasElement | undefined, fileName?: string) => {
  const a = document.createElement('a')
  const blob: Blob | null = await new Promise(resolve => canvasElement?.toBlob(resolve, 'image/jpeg', 0.99))
  if (blob) a.href = URL.createObjectURL(blob)
  else a.href = '' // error
  if (fileName)
    a.download = `${fileName}.jpg` // download
  else a.target = '_blank' // new tab
  a.click()
}

/**
 * @param {string} url
 * @returns {Promise<ImageBitmap>}
 */
export const fetchImage = (url: string) =>
  fetch(self.location.origin + url)
    .then(res => res.blob())
    .then(blob => createImageBitmap(blob))

/**
 * @param {OffscreenCanvas} canvas
 * @param {number} amount シャープ化の強度
 * @param {number} radius ぼかしの強度
 * @param {number} threshold 差分を適用する際のしきい値
 */
export const unsharpMask = (canvas: OffscreenCanvas, amount: number, radius: number, threshold: number) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = canvas.width
  const height = canvas.height
  const originalData = ctx.getImageData(0, 0, width, height)
  const blurredData = ctx.getImageData(0, 0, width, height)

  // ガウスぼかしを適用
  gaussianBlur(blurredData, radius)

  const originalPixels = originalData.data
  const blurredPixels = blurredData.data

  for (let i = 0; i < originalPixels.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      // RGBのみ処理
      const diff = originalPixels[i + j] - blurredPixels[i + j]
      if (Math.abs(diff) > threshold) {
        originalPixels[i + j] = Math.min(Math.max(originalPixels[i + j] + diff * amount, 0), 255)
      }
    }
  }

  ctx.putImageData(originalData, 0, 0)
}

const gaussianBlur = (imageData: ImageData, radius: number) => {
  const width = imageData.width
  const height = imageData.height
  const pixels = imageData.data
  const tmpPixels = new Uint8ClampedArray(pixels)

  // 標準偏差を計算
  const sigma = radius / 3
  const twoSigmaSquare = 2 * sigma * sigma
  const piTwoSigmaSquare = Math.PI * twoSigmaSquare

  // ガウス関数の重みを計算
  const weights: number[] = []
  let weightSum = 0
  for (let i = -radius; i <= radius; i++) {
    const weight = Math.exp(-(i * i) / twoSigmaSquare) / piTwoSigmaSquare
    weights.push(weight)
    weightSum += weight
  }

  // 重みを正規化
  for (let i = 0; i < weights.length; i++) {
    weights[i] /= weightSum
  }

  // 水平方向のぼかし
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let i = -radius; i <= radius; i++) {
        const xi = Math.min(Math.max(x + i, 0), width - 1)
        const index = (y * width + xi) * 4
        const weight = weights[i + radius]
        r += tmpPixels[index] * weight
        g += tmpPixels[index + 1] * weight
        b += tmpPixels[index + 2] * weight
      }
      const index = (y * width + x) * 4
      pixels[index] = r
      pixels[index + 1] = g
      pixels[index + 2] = b
    }
  }

  // 垂直方向のぼかし
  tmpPixels.set(pixels)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let r = 0
      let g = 0
      let b = 0
      for (let i = -radius; i <= radius; i++) {
        const yi = Math.min(Math.max(y + i, 0), height - 1)
        const index = (yi * width + x) * 4
        const weight = weights[i + radius]
        r += tmpPixels[index] * weight
        g += tmpPixels[index + 1] * weight
        b += tmpPixels[index + 2] * weight
      }
      const index = (y * width + x) * 4
      pixels[index] = r
      pixels[index + 1] = g
      pixels[index + 2] = b
    }
  }
}
