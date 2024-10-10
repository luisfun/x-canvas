import type { DivProps, Options, Position, Structure, XElement } from './types'

export class XCanvas {
  #worker: Worker
  #canvas: OffscreenCanvas
  #options: Options | undefined
  /**
   * Initialization without using 'new'
   * @example
   * ```ts
   * const xc = await XCanvas.init(...)
   * ```
   */
  constructor(worker: Worker, canvasElement: HTMLCanvasElement, options: Options | undefined) {
    this.#worker = worker
    this.#canvas = canvasElement.transferControlToOffscreen()
    this.#options = options
  }
  static async init(canvasElement: HTMLCanvasElement, options?: Options) {
    const code = await fetch(new URL('./worker.js', import.meta.url)).then(res => res.text())
    const blob = new Blob([code], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url, { type: 'module' })
    worker.onmessage = (event: MessageEvent) => {
      console.log('Result from worker:', event.data)
    }
    return new XCanvas(worker, canvasElement, options)
  }

  render(props: DivProps, ...children: XElement[]) {
    this.#worker.postMessage({ canvas: this.#canvas, options: this.#options, root: { type: 'div', props, children } }, [
      this.#canvas,
    ])
  }

  options(options: Options) {
    this.#options = options
  }
}

/*
export class XCanvas {
  #canvas: HTMLCanvasElement
  #offscreen: OffscreenCanvas
  // @ts-expect-erro
  #fontFace: FontFace | undefined
  // @ts-expect-erro
  #fontFamily: string
  // @ts-expect-erro
  #fontSize: number
  // @ts-expect-erro
  #fontColor: string
  // @ts-expect-erro
  #structure: Structure | undefined = undefined
  #worker: Worker | undefined = undefined
  constructor(
    canvasElement: HTMLCanvasElement,
    options?: {
      canvasWidth?: number
      canvasHeight?: number
      fontFace?: FontFace
      //fontFamily?: string
      fontSize?: number
      fontColor?: string
    },
  ) {
    this.#canvas = canvasElement
    this.#offscreen = canvasElement.transferControlToOffscreen()
    this.#fontFace = options?.fontFace
    this.#fontFamily = options?.fontFace?.family || 'sans-serif'
    this.#fontSize = options?.fontSize || 16
    this.#fontColor = options?.fontColor || '#000000'
  }

  /
   * dev code
   /
  dev() {
    if (!this.#worker) fetch(new URL('./worker.js', import.meta.url))
      .then(res => res.text())
      .then(code => {
        const blob = new Blob([code], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        this.#worker = new Worker(url, { type: 'module' })
        this.#worker.onmessage = (event: MessageEvent) => {
          console.log('Result from worker:', event.data)
        }
        this.#worker.postMessage({ num: 5, canvas: this.#offscreen }, [this.#offscreen])
      })
    else this.#worker.postMessage({ num: 3, canvas: this.#offscreen }, [this.#offscreen])
  }

  /
   * Analysis of structure
   /
  root(props: DivProps, ...children: XElement[]) {
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    const elem = { type: 'div', props, children } as const
    const inner = recuStructure(pos, elem)
    this.#structure = { pos, elem, inner }
  }

  /
   * Canvas Rendering
   * @param fonts Font Check.
   * @param delay Delay Render. Recommend: iOS: 10~100.
   /
  /
  render(fonts: FontFaceSet, delay?: boolean | number) {
    const renderFunc = () => {
      if (!delay) this.#imageLoader()
      else setTimeout(() => this.#imageLoader(), typeof delay === 'number' ? delay : 0)
      fonts.load(`${this.#fontSize}px ${this.#fontFamily}`).then(() => this.#draw())
    }
    if (!delay) renderFunc()
    else setTimeout(() => renderFunc(), typeof delay === 'number' ? delay : 0)
  }

  #imageLoader(structure?: Structure, recursive?: boolean) {
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    if (s.elem.type === 'img') this.#imageLoad(s.elem.props.src)
    if (s.elem.props.backgroundImage) this.#imageLoad(s.elem.props.backgroundImage)
    //if (s.elem.type === 'canvas' && s.elem.props.canvasFunc)
    //  this.#innerCanvasLoad(s.elem.props.canvasId || 'canvas', s.elem.props.canvasFunc, s.pos)
    for (const e of s.inner || []) this.#imageLoader(e, true)
  }
  /
}*/

const recuStructure = (pos: Position, elem: XElement) => {
  const posArr = calcChildrenPos(pos, elem)
  if (typeof elem !== 'object' || !elem || !posArr) return undefined // end elem
  const re: Structure[] = elem.children?.map((child, i) => ({
    pos: posArr[i],
    elem: child,
    inner: undefined,
  }))
  for (const e of re) e.inner = recuStructure(e.pos, e.elem)
  return re
}

const calcChildrenPos = (pos: Position, elem: XElement) => {
  if (typeof elem !== 'object' || !elem) return undefined // end elem
  const p = elem.props?.p ? Number(elem.props.p) : undefined
  const pt = elem.props?.pt ?? p ?? 0
  const pr = elem.props?.pr ?? p ?? 0
  const pb = elem.props?.pb ?? p ?? 0
  const pl = elem.props?.pl ?? p ?? 0
  const sxArr = elem.children.map(child => {
    if (typeof child !== 'object' || !child)
      return { z: 0, w: 'auto', h: 'auto', mt: 'auto', mr: 'auto', mb: 'auto', ml: 'auto', pos: undefined } as const
    const m = child.props?.m != null ? Number(child.props.m) : 'auto'
    return {
      z: child.props?.z ?? 0,
      w: child.props?.w ?? 'auto',
      h: child.props?.h ?? 'auto',
      mt: child.props?.mt ?? m,
      mr: child.props?.mr ?? m,
      mb: child.props?.mb ?? m,
      ml: child.props?.ml ?? m,
      pos: child.props?.position,
    }
  })
  if (elem.props?.display === 'flex')
    // 横並び
    return calcPos({ ...pos, pt, pr, pb, pl }, sxArr, 'row')
  // 縦並び
  return calcPos({ ...pos, pt, pr, pb, pl }, sxArr)
}

type CalcOuter = any //Position & { pt: number; pr: number; pb: number; pl: number }
type CalcInner = any /*{
  z: number
  w: SxSize
  h: SxSize
  mt: MarginSize
  mr: MarginSize
  mb: MarginSize
  ml: MarginSize
  pos: 'absolute' | undefined
}*/
// @ts-expect-error
const calcPos = (outer: CalcOuter, innerArr: CalcInner[], direction?: `column` | `row`) => [
  { x: 1, y: 1, w: 1, h: 1, z: 1 },
]
