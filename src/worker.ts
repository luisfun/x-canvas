import type {
  CalcInner,
  CalcOuter,
  CalcUniInner,
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

const per2num = (per: unknown) =>
  typeof per === 'string' && per.at(-1) === '%' ? Number(per.slice(0, -1)) / 100 : undefined

/*
 * render
 * ├ #recuStructure ↻
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
class XCanvasWorker {
  #canvas: OffscreenCanvas
  #ctx: OffscreenCanvasRenderingContext2D
  #fontFace: FontFace | undefined
  #fontFamily: string
  #fontSize: number
  #fontColor: string
  #log: Options['log']
  //#renderDelay: number | undefined
  #structure: Structure | undefined = undefined
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
  }

  render(root: DivElement) {
    // analysis of structure
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    const inner = this.#recuStructure(pos, root)
    this.#structure = { pos, elem: root, inner }
    // main rendering
    this.#load()
    // load font
    // @ts-expect-error
    self.fonts.ready.then(() => this.#draw())
  }

  /*
   * Analysis of Structure
   */

  #recuStructure(pos: Position, elem: XElement) {
    const posArr = this.#calcChildrenPos(pos, elem)
    if (typeof elem !== 'object' || !posArr) return undefined // end elem
    const re: Structure[] = elem.children?.map((child, i) => ({
      pos: posArr[i],
      elem: child,
      inner: undefined,
    }))
    for (const e of re) e.inner = this.#recuStructure(e.pos, e.elem)
    return re
  }

  #calcChildrenPos(pos: Position, elem: XElement) {
    if (typeof elem !== 'object') return undefined // end elem
    const px = this.#fixSize(elem.props.p, pos.w, 0)
    const py = this.#fixSize(elem.props.p, pos.h, 0)
    const pt = this.#fixSize(elem.props.pt, pos.h, py)
    const pr = this.#fixSize(elem.props.pr, pos.w, px)
    const pb = this.#fixSize(elem.props.pb, pos.h, py)
    const pl = this.#fixSize(elem.props.pl, pos.w, px)
    const sxArr = elem.children.map(child => {
      if (typeof child !== 'object')
        return { z: 0, w: 'auto', h: 'auto', mt: 'auto', mr: 'auto', mb: 'auto', ml: 'auto', position: undefined }
      const m = child.props?.m != null ? Number(child.props.m) : 'auto'
      const textWidth = this.#getTextWidth(child.children[0])
      return {
        z: child.props?.z ?? 0,
        w: textWidth ? textWidth : (child.props?.w ?? 'auto'),
        h: textWidth ? this.#fixSize(child.props.fontSize, this.#fontSize, this.#fontSize) : (child.props?.h ?? 'auto'),
        mt: child.props?.mt ?? m,
        mr: child.props?.mr ?? m,
        mb: child.props?.mb ?? m,
        ml: child.props?.ml ?? m,
        position: child.props?.position,
      }
    })
    if (elem.props?.display === 'flex')
      // 横並び
      return this.#calcPos({ ...pos, pt, pr, pb, pl }, sxArr, 'row')
    // 縦並び
    return this.#calcPos({ ...pos, pt, pr, pb, pl }, sxArr)
  }

  #calcPos(outer: CalcOuter, innerArr: CalcInner[], direction?: `column` | `row`) {
    const isRow = direction === 'row'
    const x = outer.x + outer.pl
    const y = outer.y + outer.pt
    const w = outer.w - outer.pl - outer.pr
    const h = outer.h - outer.pt - outer.pb
    const xPos = this.#calcPosUni(
      x,
      w,
      innerArr.map(e => ({ len: e.w, ms: e.ml, me: e.mr, pos: isRow ? e.position : 'absolute' })),
    )
    const yPos = this.#calcPosUni(
      y,
      h,
      innerArr.map(e => ({ len: e.h, ms: e.mt, me: e.mb, pos: isRow ? 'absolute' : e.position })),
    )
    return innerArr.map((e, i) => ({
      x: xPos[i].start,
      y: yPos[i].start,
      z: e.z,
      w: xPos[i].len,
      h: yPos[i].len,
    }))
  }

  #calcPosUni(x: number, w: number, innerArr: CalcUniInner[]) {
    let sumNum = 0
    let sumPer = 0
    for (const inner of innerArr) {
      if (inner.pos === 'absolute') continue
      for (const size of [inner.len, inner.ms, inner.me]) {
        sumNum += this.#fixSize(size, undefined, 0)
        sumPer += per2num(size) || 0
      }
    }
    let tmp = x

    // over
    if (w < sumNum || (w === sumNum && 0 < sumPer)) {
      return innerArr.map(inner => {
        if (inner.pos === 'absolute') return this.#calcPosAbsolute(tmp, w, inner)
        const { start, len, next } = this.#calcPosStatic(tmp, w, inner)
        tmp = next
        return { start, len }
      })
    }

    // compress
    const remainRate = (w - sumNum) / w
    if (remainRate < sumPer) {
      return innerArr.map(inner => {
        if (inner.pos === 'absolute') return this.#calcPosAbsolute(tmp, w, inner)
        const { start, len, next } = this.#calcPosStatic(tmp, (w * remainRate) / sumPer, inner)
        tmp = next
        return { start, len }
      })
    }

    // keep
    let lenAutoCount = 0
    let mAutoCount = 0
    for (const inner of innerArr) {
      if (inner.pos === 'absolute') continue
      if (inner.len === 'auto') lenAutoCount++
      if (inner.ms === 'auto') mAutoCount++
      if (inner.me === 'auto') mAutoCount++
    }
    return innerArr.map(inner => {
      if (inner.pos === 'absolute') return this.#calcPosAbsolute(tmp, w, inner)
      // len auto
      if (lenAutoCount > 0) {
        const { start, len, next } = this.#calcPosStatic(tmp, w, inner, (w - sumNum - sumPer * w) / lenAutoCount)
        tmp = next
        return { start, len }
      }
      // m auto
      if (mAutoCount > 0) {
        const { start, len, next } = this.#calcPosStatic(tmp, w, inner, w, (w - sumNum - sumPer * w) / mAutoCount)
        tmp = next
        return { start, len }
      }
      // non auto
      const { start, len, next } = this.#calcPosStatic(tmp, w, inner)
      tmp = next
      return { start, len }
    })
  }

  #calcPosStatic(x: number, w: number, inner: CalcUniInner, defaultW?: number, defaultM?: number) {
    const len = this.#fixSize(inner.len, w, defaultW ?? w)
    const ms = this.#fixSize(inner.ms, w, defaultM ?? 0)
    const me = this.#fixSize(inner.me, w, defaultM ?? 0)
    return { len, start: x + ms, next: x + len + ms + me }
  }

  #calcPosAbsolute(x: number, w: number, inner: CalcUniInner) {
    if (inner.len === 'auto') {
      const ms = this.#fixSize(inner.ms, w, 0)
      const me = this.#fixSize(inner.me, w, 0)
      const start = x + ms
      const len = w - ms - me
      return { start, len }
    }
    const len = this.#fixSize(inner.len, w, w)
    const mAutoCount = (inner.ms === 'auto' ? 1 : 0) + (inner.me === 'auto' ? 1 : 0) // 0,1,2
    const me = this.#fixSize(inner.me, w, 0)
    const ms = this.#fixSize(inner.ms, w, (w - len - me) / mAutoCount)
    const start = x + ms
    return { start, len }
  }

  /*
   * Load
   */

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

  /*
   * Draw
   */

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
    const align = props?.textAlign || 'left'
    const x = align === 'left' ? pos.x : align === 'right' ? pos.x + pos.w : pos.x + pos.w / 2
    this.#ctx.fillStyle = props?.color || this.#fontColor
    this.#ctx.font = `${this.#fixSize(props?.fontSize, this.#fontSize, this.#fontSize)}px ${this.#fontFamily}`
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
    const rad = this.#fixSize(radius, pos.w < pos.h ? pos.w : pos.h, 0)
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
    const rad = this.#fixSize(radius, pos.w < pos.h ? pos.w : pos.h, 0)
    this.#ctx.save()
    this.#ctxPathBox(pos, rad)
    this.#ctx.clip()
  }

  #ctxClipPath(pos: Position, clipPath: SxSize[]) {
    const path = clipPath.map((p, i) =>
      i % 2 === 0 ? pos.x + this.#fixSize(p, pos.w, 0) : pos.y + this.#fixSize(p, pos.h, 0),
    )
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

  /*
   * Utils
   */

  #fixSize<T extends number | undefined>(size: SxSize | undefined, length?: number, defaultValue?: T) {
    if (size !== undefined) {
      if (typeof size === 'number') return size
      if (size.endsWith('rem')) {
        const sizeNum = Number(size.slice(0, -3))
        if (!Number.isNaN(sizeNum)) return sizeNum * this.#fontSize
      }
      if (length && size.endsWith('%')) {
        const sizeNum = Number(size.slice(0, -1))
        if (!Number.isNaN(sizeNum)) return sizeNum * length
      }
    }
    return defaultValue ?? ('auto' as T extends number ? number : number | 'auto')
  }

  #getTextWidth(text: unknown, fontSize?: SxSize | undefined) {
    if (typeof text !== 'string' && typeof text !== 'number') return undefined
    this.#ctx.font = `${this.#fixSize(fontSize, this.#fontSize, this.#fontSize)}px ${this.#fontFamily}`
    return this.#ctx.measureText(text.toString()).width
  }
}

let xc: XCanvasWorker | undefined
self.onmessage = (event: MessageEvent<{ canvas: OffscreenCanvas; options: Options | undefined; root: DivElement }>) => {
  const { canvas, options, root } = event.data
  if (!xc) {
    const ctx = canvas.getContext('2d')
    if (ctx) xc ??= new XCanvasWorker(canvas, ctx, options)
    else new Error('web worker: OffscreenCanvas.getContext("2d")')
  }
  if (xc) {
    if (options) xc.options(options)
    xc.render(root)
  }
  //postMessage("render completed")
}
