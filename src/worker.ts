import type { DivElement, Options, Position, Structure, XElement, DivProps } from './types'

const fetchImage = (url: string) =>
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
  #ctx: OffscreenCanvasRenderingContext2D
  #fontFace: FontFace | undefined
  #fontFamily: string
  #fontSize: number
  #fontColor: string
  //#renderDelay: number | undefined
  #structure: Structure | undefined = undefined
  #isFontLoad = true
  #imageMap = new Map<string, ImageBitmap>()
  #imageSrcList: string[] = [] // 重複回避用
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
        this.#draw(this.#structure)
        this.#isFontLoad = true
      })
  }

  #loadAndDraw(structure?: Structure, recursive?: boolean) {
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    if (s.elem.type === 'img') this.#loadImageAndDraw(s.elem.props.src)
    if (s.elem.props.backgroundImage) this.#loadImageAndDraw(s.elem.props.backgroundImage)
    if (s.elem.type === 'canvas') this.#loadCanvasAndDraw(s.elem.props.id || 'canvas', s.elem.props.func, s.pos)
    for (const e of s.inner || []) this.#loadAndDraw(e, true)
  }

  #loadImageAndDraw(src: string) {
    if (this.#imageSrcList.includes(src)) return
    this.#imageSrcList.push(src)
    fetchImage(src).then(image => {
      this.#imageMap.set(src, image)
      this.#draw()
    })
  }

  #loadCanvasAndDraw(id: string, func: (ctx: OffscreenCanvasRenderingContext2D) => Promise<void>, pos: Position, refresh = true) {
    if (refresh) this.#imageMap.delete(id)
    else if (this.#imageSrcList.includes(id)) return
    if (!this.#imageSrcList.includes(id)) this.#imageSrcList.push(id)
    const canvas = new OffscreenCanvas(Math.round(pos.w), Math.round(pos.h))
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      new Error('web worker: loadCanvasAndDraw OffscreenCanvas.getContext("2d")')
      return
    }
    func(ctx).then(() => {
      createImageBitmap(canvas).then(image => {
        this.#imageMap.set(id, image)
        this.#draw()
      })
    })
  }

  #draw(structure?: Structure, recursive?: boolean) {
    if(!structure && this.#imageSrcList.length !== this.#imageMap.keys.length) return
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    const h = s.elem.props?.overflow === 'hidden' ? { pos: s.pos, radius: s.elem.props.borderRadius } : undefined
    if (h) this.ctxClip(h)
    const clipPath = s.elem.props?.clipPathLine ? { pos: s.pos, path: s.elem.props.clipPathLine } : undefined
    if (clipPath) this.ctxClipPath(clipPath)
    if (s.elem.props) this.backgroundDraw(s.pos, s.elem.props)
    if (s.elem.type === 'img') this.imageDraw(s.pos, s.elem.props?.src || '', s.elem.props)
    if (s.elem.type === 'canvas') this.imageDraw(s.pos, s.elem.props?.id || 'canvas', s.elem.props)
    if (s.elem.type === 'div') {
      if (typeof s.elem.children[0] === 'string' || typeof s.elem.children[0] === 'number') {
        this.#drawText(s.pos, s.elem.children[0], s.elem.props)
      }
    }
    for (const e of s.inner || []) this.#draw(e, true)
    if (clipPath) this.#ctx.restore()
    if (h) this.#ctx.restore()
  }

  #drawText(pos: Position, text: string | number, props: DivProps) {
    const size = !props?.fontSize
      ? this.#fontSize
      : typeof props.fontSize === 'number'
        ? props.fontSize
        : props.fontSize.slice(-3) === 'rem'
          ? this.#fontSize * Number(props.fontSize.slice(0, -3))
          : this.#fontSize // 実質エラー
    const align = props?.textAlign || 'left'
    const x = align === 'left' ? pos.x : align === 'right' ? pos.x + pos.w : pos.x + pos.w / 2
    this.#ctx.fillStyle = props?.color || this.#fontColor
    this.#ctx.font = `${size}px ${this.#fontFamily}`
    this.#ctx.textAlign = align
    this.#ctx.textBaseline = 'middle'
    if (props?.opacity) this.#ctx.globalAlpha = props.opacity
    if (props?.shadow) {
      this.#ctx.shadowBlur = props.shadow.size
      this.#ctx.shadowColor = props.shadow.color || '#000'
      for (let i = 0; i < (props.shadow?.for || 1); i++) {
        this.#ctx.fillText(text.toString(), x, pos.y + pos.h / 2)
      }
      this.#ctx.shadowBlur = 0
    } else {
      this.#ctx.fillText(text.toString(), x, pos.y + pos.h / 2)
    }
    if (props?.opacity) this.#ctx.globalAlpha = 1
  }
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
