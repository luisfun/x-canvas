import type {
  CanvasElement,
  CanvasProps,
  DivElement,
  DivProps,
  ImgElement,
  ImgProps,
  Options,
  RequestWorker,
  XElement,
} from './types'

export class XCanvas {
  #worker: Worker
  #canvas: OffscreenCanvas
  #options: Options | undefined
  #isOptionsPosted = false
  /**
   * @param {HTMLCanvasElement} canvasElement
   * @param {Options} options
   * @returns {XCanvas}
   */
  constructor(canvasElement: HTMLCanvasElement, workerDir: string, options?: Options) {
    this.#worker = new Worker(`${workerDir}/x-canvas${options?.debugMode ? '' : '.min'}.js`)
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
    this.#worker.postMessage({
      options: this.#isOptionsPosted ? undefined : this.#options,
      root: { type: 'div', props, children } as DivElement,
    } as RequestWorker)
    this.#isOptionsPosted = true
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
export const img = (props: ImgProps): ImgElement => ({ type: 'img', props, children: [] })
/**
 * @param {CanvasProps} props
 * @returns {CanvasElement}
 */
export const canvas = (props: CanvasProps): CanvasElement => ({ type: 'canvas', props, children: [] })

/**
 * Save image or Open in a new tab
 * @param canvasElement HTMLCanvasElement
 * @param fileName Image file name. Undefined: Open in a new tab
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
