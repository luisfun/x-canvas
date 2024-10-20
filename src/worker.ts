import type {
  CanvasProps,
  DivElement,
  DivProps,
  ImgProps,
  Options,
  Position,
  Structure,
  SxBorder,
  SxSize,
  XElement,
} from './types'

const fixFontFaceConstructor = (
  parameters: ConstructorParameters<typeof FontFace>,
): ConstructorParameters<typeof FontFace> => {
  let [family, source, descriptors] = parameters
  if (typeof source === 'string' && !source.startsWith('url(')) source = `url(${self.location.origin + source})`
  return [family, source, descriptors]
}

const fetchImage = (url: string) =>
  fetch(self.location.origin + url)
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
  { x: 0, y: 0, w: 300, h: 150, z: 0 },
  { x: 0, y: 0, w: 300, h: 150, z: 0 },
]

const drawImageArea = (image: ImageBitmap | OffscreenCanvas, pos: Position, props: ImgProps | CanvasProps) => {
  const w = image.width
  const h = image.height
  const posRatio = pos.w / pos.h
  const imgRatio = w / h
  let fit: 'x' | 'y' | undefined = undefined
  if ('objectFit' in props && props.objectFit === 'cover') {
    // 領域いっぱい（アスペクト比を維持）
    if (posRatio < imgRatio) fit = 'y'
    if (imgRatio < posRatio) fit = 'x'
  } else {
    // 領域内（アスペクト比を維持）
    if (posRatio < imgRatio) fit = 'x'
    if (imgRatio < posRatio) fit = 'y'
  }
  if (fit === 'x') {
    const img = { w: pos.w, h: (h * pos.w) / w }
    const posY = pos.y + pos.h / 2 - img.h / 2
    return [0, 0, w, h, pos.x, posY, img.w, img.h] as const
  }
  const img = { w: (w * pos.h) / h, h: pos.h }
  const posX = pos.x + pos.w / 2 - img.w / 2
  return [0, 0, w, h, posX, pos.y, img.w, img.h] as const
}

const num2num = (num: unknown) => (typeof num === 'number' ? num : undefined)
const per2num = (per: unknown) =>
  typeof per === 'string' && per.at(-1) === '%' ? Number(per.slice(0, -1)) / 100 : undefined

/*
 * render
 * ├ recuStructure ↻
 * │
 * ├ #load ↻
 * │ ├ #loadImage
 * │ │ └ #draw
 * │ └ #loadCanvas
 * │   └ #draw
 * └ #draw
 * #draw ↻
 * ├ #drawBackground
 * │ └ #drawImage
 * ├ #drawImage
 * └ #drawText
 */
class XCanvas {
  #canvas: OffscreenCanvas
  #ctx: OffscreenCanvasRenderingContext2D
  #fontFace: FontFace | undefined
  #fontFamily: string
  #fontSize: number
  #fontColor: string
  #log: Options['log']
  //#renderDelay: number | undefined
  #structure: Structure | undefined = undefined
  #isFontLoad = true
  #imageMap = new Map<string, ImageBitmap | OffscreenCanvas>()
  #imageSrcList: string[] = [] // 重複回避用
  constructor(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, options?: Options) {
    this.#canvas = canvas
    this.#ctx = ctx
    if (options?.canvasWidth) this.#canvas.width = options.canvasWidth
    if (options?.canvasHeight) this.#canvas.height = options.canvasHeight
    if (options?.fontFace) {
      this.#fontFace = new FontFace(...fixFontFaceConstructor(options.fontFace))
      // @ts-expect-error
      self.fonts.add(this.#fontFace)
    }
    this.#fontFamily = options?.fontFace?.[0] || 'sans-serif'
    this.#fontSize = options?.fontSize || 16
    this.#fontColor = options?.fontColor || '#000000'
    this.#log = options?.log
    //this.#renderDelay = options?.renderDelay
    if (options?.fontFace) this.#isFontLoad = false
  }

  options = (options: Options | undefined) => {
    if (options?.canvasWidth) this.#canvas.width = options.canvasWidth
    if (options?.canvasHeight) this.#canvas.height = options.canvasHeight
    if (options?.fontFace) {
      this.#fontFace = new FontFace(...fixFontFaceConstructor(options.fontFace))
      // @ts-expect-error
      self.fonts.add(this.#fontFace)
    }
    this.#fontFamily = options?.fontFace?.[0] || 'sans-serif'
    this.#fontSize = options?.fontSize || 16
    this.#fontColor = options?.fontColor || '#000000'
    this.#log = options?.log
    //this.#renderDelay = options?.renderDelay
    if (options?.fontFace) this.#isFontLoad = false
  }

  render(root: DivElement) {
    // analysis of structure
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    const inner = recuStructure(pos, root)
    this.#structure = { pos, elem: root, inner }
    // main rendering
    this.#load()
    // non images
    if (this.#imageSrcList.length === 0) this.#draw()
    // load font
    if (!this.#isFontLoad)
      this.#fontFace?.load().then(() => {
        this.#draw()
        this.#isFontLoad = true
      })
  }

  #load(structure?: Structure, recursive?: boolean) {
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    if (s.elem.type === 'img') this.#loadImage(s.elem.props.src)
    if (s.elem.props.backgroundImage) this.#loadImage(s.elem.props.backgroundImage)
    if (s.elem.type === 'canvas')
      this.#loadCanvas(s.elem.props.id || 'canvas', s.elem.props.func, s.pos, s.elem.props.refresh)
    for (const e of s.inner || []) this.#load(e, true)
  }

  #loadImage(src: string) {
    if (this.#imageSrcList.includes(src)) return
    this.#imageSrcList.push(src)
    fetchImage(src).then(image => {
      this.#imageMap.set(src, image)
      this.#draw()
    })
  }

  #loadCanvas(id: string, func: (canvas: OffscreenCanvas) => Promise<void>, pos: Position, refresh = true) {
    if (!refresh && this.#imageSrcList.includes(id)) return
    if (!this.#imageSrcList.includes(id)) this.#imageSrcList.push(id)
    let canvas = this.#imageMap.get(id)
    if (canvas instanceof OffscreenCanvas) {
      canvas.width = Math.round(pos.w)
      canvas.height = Math.round(pos.h)
    } else {
      canvas = new OffscreenCanvas(Math.round(pos.w), Math.round(pos.h))
    }
    func(canvas).then(() => {
      this.#imageMap.set(id, canvas)
      this.#draw()
    })
  }

  #draw(structure?: Structure, recursive?: boolean) {
    if (!recursive && this.#log === 'render') console.log('OffscreenCanvas Rendering')
    if (!structure && this.#imageSrcList.length !== this.#imageMap.size) return
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (typeof s.elem !== 'object' || !s.elem) return
    const h = s.elem.props?.overflow === 'hidden' ? { pos: s.pos, radius: s.elem.props.borderRadius } : undefined
    if (h) this.#ctxClipBox(h.pos, h.radius)
    const clipPath = s.elem.props?.clipPathLine ? { pos: s.pos, path: s.elem.props.clipPathLine } : undefined
    if (clipPath) this.#ctxClipPath(clipPath.pos, clipPath.path)
    if (s.elem.props) this.#drawBackground(s.pos, s.elem.props)
    if (s.elem.type === 'img') this.#drawImage(s.pos, s.elem.props?.src || '', s.elem.props)
    if (s.elem.type === 'canvas') this.#drawImage(s.pos, s.elem.props?.id || 'canvas', s.elem.props)
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

  #drawImage(pos: Position, src: string, props: ImgProps | CanvasProps) {
    const image = this.#imageMap.get(src)
    if (!image) return // ts: not loading
    if (props.opacity) this.#ctx.globalAlpha = props.opacity
    if (props.shadow) {
      this.#ctx.shadowBlur = props.shadow.size
      this.#ctx.shadowColor = props.shadow.color || '#000'
      for (let i = 0; i < (props.shadow?.for || 1); i++) {
        this.#ctx.drawImage(image, ...drawImageArea(image, pos, props))
      }
      this.#ctx.shadowBlur = 0
    } else {
      this.#ctx.drawImage(image, ...drawImageArea(image, pos, props))
    }
    if (props.opacity) this.#ctx.globalAlpha = 1
  }

  #drawBackground(pos: Position, props: DivProps | ImgProps | CanvasProps) {
    if (props.backgroundColor) {
      this.#ctx.fillStyle = props.backgroundColor
      this.#ctx.fillRect(pos.x, pos.y, pos.w, pos.h)
    }
    /*
    if(sx.backgroundRadialGradient) {
      const sxGrad = sx.backgroundRadialGradient
      const sxLen = sxGrad.length - 1
      if(sxLen===0) return
      const cx = pos.x + pos.w/2, cy = pos.y + pos.h/2
      const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, pos.w<pos.h?pos.w:pos.h)
      sxGrad.forEach((color,i)=>{
        grad.addColorStop(i/sxLen/2, color) // 2で割らないとなぜかオーバーシュートする
      })
      this.ctx.fillStyle = grad
      this.ctx.fillRect(pos.x, pos.y, pos.w, pos.h)
    }
    */
    if (props.backgroundBlendMode) this.#ctx.globalCompositeOperation = props.backgroundBlendMode
    if (props.backgroundImage)
      this.#drawImage(pos, props.backgroundImage, { objectFit: (props as ImgProps).objectFit } as ImgProps)
    if (props.backgroundBlendMode) this.#ctx.globalCompositeOperation = 'source-over'
    if (props.border) this.#drawBorder(pos, props.borderRadius, props.border)
  }

  #drawBorder(pos: Position, radius: SxSize | undefined, border: SxBorder | SxBorder[]) {
    const borderArr = Array.isArray(border) ? border : [border]
    const rad = num2num(radius) || (per2num(radius) || 0) * (pos.w < pos.h ? pos.w : pos.h)
    for (const b of borderArr) {
      const bo = b.offset || 0
      const bw = b.width / 2
      const p = {
        x: pos.x + bo + bw,
        y: pos.y + bo + bw,
        w: pos.w - bo * 2 - bw * 2,
        h: pos.h - bo * 2 - bw * 2,
        z: pos.z,
      }
      const tmpRad = rad - bo - bw
      const r = 0 < tmpRad ? tmpRad : 0
      this.#ctx.lineWidth = b.width
      this.#ctx.strokeStyle = b.color
      this.#ctxPathBox(p, r)
      this.#ctx.stroke()
    }
  }

  #ctxPathBox(pos: Position, rad: number) {
    this.#ctx.beginPath() // 左上から時計回り
    this.#ctx.moveTo(pos.x + rad, pos.y)
    this.#ctx.lineTo(pos.x + pos.w - rad, pos.y)
    this.#ctx.arcTo(pos.x + pos.w, pos.y, pos.x + pos.w, pos.y + pos.h, rad)
    this.#ctx.lineTo(pos.x + pos.w, pos.y + pos.h - rad)
    this.#ctx.arcTo(pos.x + pos.w, pos.y + pos.h, pos.x, pos.y + pos.h, rad)
    this.#ctx.lineTo(pos.x + rad, pos.y + pos.h)
    this.#ctx.arcTo(pos.x, pos.y + pos.h, pos.x, pos.y, rad)
    this.#ctx.lineTo(pos.x, pos.y + rad)
    this.#ctx.arcTo(pos.x, pos.y, pos.x + pos.w, pos.y, rad)
    this.#ctx.closePath()
  }

  #ctxClipBox(pos: Position, radius: SxSize | undefined) {
    const rad = num2num(radius) || (per2num(radius) || 0) * (pos.w < pos.h ? pos.w : pos.h)
    this.#ctx.save()
    this.#ctxPathBox(pos, rad)
    this.#ctx.clip()
  }

  #ctxClipPath(pos: Position, clipPath: SxSize[]) {
    const fixPer = (p: SxSize, x: number, w: number) => {
      if (typeof p === 'number') return x + p
      const perNum = per2num(p)
      if (perNum) return x + w * perNum
      return x
    }
    const path = clipPath.map((p, i) => (i % 2 === 0 ? fixPer(p, pos.x, pos.w) : fixPer(p, pos.y, pos.h)))
    this.#ctx.save()
    this.#ctx.beginPath()
    this.#ctx.moveTo(path[0], path[1])
    for (let i = 2; i < path.length; i += 2) {
      this.#ctx.lineTo(path[i], path[i + 1])
    }
    this.#ctx.lineTo(path[0], path[1])
    this.#ctx.closePath()
    this.#ctx.clip()
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
    if (options) xc.options(options)
    xc.render(root)
  }
  //postMessage("render completed")
}
