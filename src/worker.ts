import type { DivElement, Options, Position, Structure, XElement } from './types'
// @ts-expect-error
const loadImage = (url: string) =>
  fetch(url)
    .then(res => res.blob())
    .then(blob => createImageBitmap(blob))

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

class XCanvas {
  #canvas: OffscreenCanvas
  // @ts-expect-error
  #ctx: OffscreenCanvasRenderingContext2D
  #fontFace: FontFace | undefined
  // @ts-expect-error
  #fontFamily: string
  // @ts-expect-error
  #fontSize: number
  // @ts-expect-error
  #fontColor: string
  //#renderDelay: number | undefined
  #structure: Structure | undefined = undefined
  #isFontLoad = true
  constructor(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, options?: Options) {
    this.#canvas = canvas
    this.#ctx = ctx
    if (options?.canvasWidth) this.#canvas.width = options.canvasWidth
    if (options?.canvasHeight) this.#canvas.height = options.canvasHeight
    this.#fontFace = options?.fontFace
    // @ts-expect-error
    if (options?.fontFace) self.fonts.add(options?.fontFace)
    this.#fontFamily = options?.fontFace?.family || 'sans-serif'
    this.#fontSize = options?.fontSize || 16
    this.#fontColor = options?.fontColor || '#000000'
    //this.#renderDelay = options?.renderDelay
    if (options?.fontFace) this.#isFontLoad = false
  }

  options = (options: Options | undefined) => {
    if (options?.canvasWidth) this.#canvas.width = options.canvasWidth
    if (options?.canvasHeight) this.#canvas.height = options.canvasHeight
    this.#fontFace = options?.fontFace
    // @ts-expect-error
    if (options?.fontFace) self.fonts.add(options?.fontFace)
    this.#fontFamily = options?.fontFace?.family || 'sans-serif'
    this.#fontSize = options?.fontSize || 16
    this.#fontColor = options?.fontColor || '#000000'
    //this.#renderDelay = options?.renderDelay
    if (options?.fontFace) this.#isFontLoad = false
  }

  render(root: DivElement) {
    // Analysis of structure
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    const inner = recuStructure(pos, root)
    this.#structure = { pos, elem: root, inner }
    // Canvas Rendering
    this.#loadAndDraw()
    // fontLoadAndDraw
    if (!this.#isFontLoad)
      this.#fontFace?.load().then(() => {
        this.#draw('force')
        this.#isFontLoad = true
      })
  }

  #loadAndDraw(structure?: Structure, recursive?: boolean) {
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    if (s.elem.type === 'img') this.#imageLoadAndDraw(s.elem.props.src)
    if (s.elem.props.backgroundImage) this.#imageLoadAndDraw(s.elem.props.backgroundImage)
    if (s.elem.type === 'canvas') this.#canvasLoadAndDraw(s.elem.props.id || 'canvas', s.elem.props.func, s.pos)
    for (const e of s.inner || []) this.#loadAndDraw(e, true)
  }

  // @ts-expect-error
  #imageLoadAndDraw(e: any) {}
  // @ts-expect-error
  #canvasLoadAndDraw(e: any, f: any, a: any) {}
  // @ts-expect-error
  #draw(type?: 'force') {}
}

let xc: XCanvas | undefined
self.onmessage = (event: MessageEvent<{ canvas: OffscreenCanvas; options: Options | undefined; root: DivElement }>) => {
  const { canvas, options, root } = event.data
  if (!xc) {
    const ctx = canvas.getContext('2d')
    if (ctx) xc ??= new XCanvas(canvas, ctx, options)
    else new Error('web worker: OffscreenCanvas.getContext("2d")')
  }
  if (xc) {
    xc.options(options)
    xc.render(root)
  }
  const result = (options?.fontSize || 0) * 2
  postMessage(result)
}
