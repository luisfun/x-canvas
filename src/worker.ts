import type {
  CalcInner,
  CalcOuter,
  CalcUniInner,
  DivElement,
  DivProps,
  FirstElement,
  ImgElement,
  ImgProps,
  Options,
  Position,
  RequestWorker,
  Structure,
  SxBorder,
  SxSize,
  XElement,
} from './types'

const defaultFont = 'Helvetica Neue, Arial, Hiragino Kaku Gothic ProN, Hiragino Sans, Meiryo, sans-serif'

const isNonElement = (elem: XElement) => typeof elem !== 'object' || elem instanceof ImageBitmap

const fetchImage = (url: string) =>
  fetch(self.location.origin + url)
    .then(res => res.blob())
    .then(blob => createImageBitmap(blob))

const fixFontFaceConstructor = (
  parameters: ConstructorParameters<typeof FontFace>,
): ConstructorParameters<typeof FontFace> => {
  let [family, source, descriptors] = parameters
  if (typeof source === 'string' && !source.startsWith('url(')) source = `url(${self.location.origin + source})`
  if (!descriptors) descriptors = { display: 'swap' }
  return [family, source, descriptors]
}

const drawImageArea = (
  image: ImageBitmap | OffscreenCanvas,
  pos: Position,
  props: ImgProps,
  crip?: [number, number, number, number],
) => {
  const w = image.width - (crip ? crip[1] + crip[3] : 0)
  const h = image.height - (crip ? crip[0] + crip[2] : 0)
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
  const sx = crip?.[3] ?? 0
  const sy = crip?.[0] ?? 0
  if (crip) console.log(sx, sy, w, h)
  if (fit === 'x') {
    const img = { w: pos.w, h: (h * pos.w) / w }
    const posY = pos.y + pos.h / 2 - img.h / 2
    return [sx, sy, w, h, pos.x, posY, img.w, img.h] as const
  }
  const img = { w: (w * pos.h) / h, h: pos.h }
  const posX = pos.x + pos.w / 2 - img.w / 2
  return [sx, sy, w, h, posX, pos.y, img.w, img.h] as const
}

const per2num = (per: unknown) =>
  typeof per === 'string' && per.at(-1) === '%' ? Number(per.slice(0, -1)) / 100 : undefined

/**
 * @param {OffscreenCanvas} canvas
 * @param {number} amount シャープ化の強度
 * @param {number} radius ぼかしの強度
 * @param {number} threshold 差分を適用する際のしきい値
 */
const unsharpMask = (canvas: OffscreenCanvas, amount: number, radius: number, threshold: number) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const originalData = new ImageData(new Uint8ClampedArray(imageData.data), width, height)
  const blurredData = new ImageData(new Uint8ClampedArray(imageData.data), width, height)

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

const opacityGradient = (
  canvas: OffscreenCanvas,
  direction: FirstElement<Required<ImgProps>['opacityGradient']>,
  params: [number, 0 | 1][],
) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  // 元の画像データを保存
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 1; i < params.length; i++) {
    const start = params[i - 1][0]
    const end = params[i][0]
    const startOpacity = params[i - 1][1]
    const endOpacity = params[i][1]

    if (startOpacity === 1 && endOpacity === 1) continue

    const isHorizontal = direction === 'to right'
    const length = isHorizontal ? canvas.height : canvas.width

    for (let j = start; j < end; j++) {
      const progress = (j - start) / (end - start)
      const opacity = startOpacity + (endOpacity - startOpacity) * progress

      for (let k = 0; k < length; k++) {
        const x = isHorizontal ? j : k
        const y = isHorizontal ? k : j
        const index = (y * canvas.width + x) * 4

        // アルファ値のみを変更
        data[index + 3] = Math.round(data[index + 3] * opacity)
      }
    }
  }

  // 修正した画像データを描画
  ctx.putImageData(imageData, 0, 0)
}

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
  #fontFamily: string = defaultFont
  #fontSize = 16
  #fontColor = '#000'
  #debugMode: Options['debugMode']
  //#renderDelay: number | undefined
  #structure: Structure | undefined = undefined
  #imageMap = new Map<string, ImageBitmap>()
  #imageSrcList: string[] = [] // 重複回避用
  #isFontReady = false
  constructor(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D) {
    this.#canvas = canvas
    this.#ctx = ctx
  }

  options = (options: Options | undefined) => {
    if (options?.canvasWidth) this.#canvas.width = options.canvasWidth
    if (options?.canvasHeight) this.#canvas.height = options.canvasHeight
    if (options?.fontFace) {
      this.#fontFace = new FontFace(...fixFontFaceConstructor(options.fontFace))
      this.#fontFamily = `${options.fontFace[0]}, ${defaultFont}`
      this.#isFontReady = false
      // @ts-expect-error
      self.fonts.add(this.#fontFace)
    }
    if (options?.fontSize) this.#fontSize = options.fontSize
    if (options?.fontColor) this.#fontColor = options.fontColor
    if (options?.debugMode) this.#debugMode = options.debugMode
    //if (options?.renderDelay) this.#renderDelay = options.renderDelay
  }

  render(root: DivElement) {
    // analysis of structure
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    this.#structure = { pos, elem: root, inner: this.#recuStructure(pos, root) }
    // quick render
    if (this.#isFontReady) this.#draw()
    // load font
    else
      this.#fontFace?.load().then(() => {
        if (self.fonts.check(`${this.#fontSize}px ${this.#fontFamily}`)) {
          this.#isFontReady = true
          this.#structure = { pos, elem: root, inner: this.#recuStructure(pos, root) }
          this.#draw()
        }
      })
    // load image
    this.#load()
  }

  /*
   * Analysis of Structure
   */

  #recuStructure(pos: Position, elem: XElement) {
    if (isNonElement(elem)) return undefined // end elem
    const posArr = this.#calcChildrenPos(pos, elem)
    const re: Structure[] = elem.children?.map((child, i) => ({
      pos: posArr[i],
      elem: child,
      inner: undefined,
    }))
    for (const e of re) e.inner = this.#recuStructure(e.pos, e.elem)
    return re
  }

  #calcChildrenPos(pos: Position, elem: DivElement | ImgElement) {
    const px = this.#fixSize(elem.props.p, pos.w, 0)
    const py = this.#fixSize(elem.props.p, pos.h, 0)
    const pt = this.#fixSize(elem.props.pt, pos.h, py)
    const pr = this.#fixSize(elem.props.pr, pos.w, px)
    const pb = this.#fixSize(elem.props.pb, pos.h, py)
    const pl = this.#fixSize(elem.props.pl, pos.w, px)
    const sxArr = elem.children.map(child => {
      if (isNonElement(child))
        return { z: 0, w: 'auto', h: 'auto', mt: 'auto', mr: 'auto', mb: 'auto', ml: 'auto', position: undefined }
      const m = this.#fixSize(child.props?.m, this.#fontSize)
      return {
        z: child.props?.z ?? 0,
        w:
          child.props?.w ??
          (child.type !== 'img' ? (this.#getTextWidth(child.children[0], child.props.fontSize) ?? 'auto') : 'auto'),
        h:
          child.props?.h ??
          (child.type !== 'img' && (typeof child.children[0] === 'string' || typeof child.children[0] === 'number')
            ? this.#fixSize(child.props.fontSize, this.#fontSize, this.#fontSize) * 1.5
            : 'auto'),
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
        if (inner.pos === 'absolute') return this.#calcPosAbsolute(x, w, inner)
        const { start, len, next } = this.#calcPosStatic(tmp, w, inner)
        tmp = next
        return { start, len }
      })
    }

    // compress
    const remainRate = (w - sumNum) / w
    if (remainRate < sumPer) {
      return innerArr.map(inner => {
        if (inner.pos === 'absolute') return this.#calcPosAbsolute(x, w, inner)
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
      if (inner.pos === 'absolute') return this.#calcPosAbsolute(x, w, inner)
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
    if (isNonElement(s.elem)) return
    if (s.elem.type === 'img') this.#loadImage(s.elem.children[0], s.elem.props.id)
    if (s.elem.props.backgroundImage) this.#loadImage(s.elem.props.backgroundImage)
    for (const e of s.inner || []) this.#load(e, true)
  }

  #loadImage(src: ImgElement['children'][number], id?: string | undefined) {
    const index = id ?? (typeof src === 'string' ? src : 'image')
    if (typeof src !== 'string') this.#imageMap.set(index, src)
    if (this.#imageSrcList.includes(index)) return
    this.#imageSrcList.push(index)
    if (typeof src === 'string')
      fetchImage(src).then(image => {
        this.#imageMap.set(index, image)
        this.#draw()
      })
  }

  /*
   * Draw
   */

  #draw(structure?: Structure, recursive?: boolean) {
    if (!structure && (this.#imageSrcList.length !== this.#imageMap.size || !this.#structure?.inner?.[0])) return
    const s = recursive ? structure : this.#structure
    if (!s) return
    if (isNonElement(s.elem)) return
    if (!recursive && this.#debugMode) console.log('Canvas Render', this.#structure)
    const h = s.elem.props?.overflow === 'hidden' ? { pos: s.pos, radius: s.elem.props.borderRadius } : undefined
    if (h) this.#ctxClipBox(h.pos, h.radius)
    const clipPath = s.elem.props?.clipPathLine ? { pos: s.pos, path: s.elem.props.clipPathLine } : undefined
    if (clipPath) this.#ctxClipPath(clipPath.pos, clipPath.path)
    if (s.elem.props) this.#drawBackground(s.pos, s.elem.props)
    if (s.elem.type === 'img') this.#drawImage(s.pos, s.elem.children[0], s.elem.props)
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
    this.#ctxFont(props?.fontSize)
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

  #drawImage(pos: Position, src: ImgElement['children'][number], props: ImgProps) {
    const index = props.id ?? (typeof src === 'string' ? src : 'image')
    let image: ImageBitmap | OffscreenCanvas | undefined = this.#imageMap.get(index)
    if (!image) return // ts: not loading
    if (props.clipImgRect || props.opacityGradient || props.unsharpMask) {
      const canvas = new OffscreenCanvas(pos.w, pos.h)
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(
        image,
        ...drawImageArea(
          image,
          { ...pos, x: 0, y: 0 },
          props,
          // @ts-expect-error
          props?.clipImgRect?.map((e, i) => this.#fixSize(e, i % 2 === 0 ? image?.height : image?.width, 0)),
        ),
      )
      if (props.opacityGradient) {
        const direction = props.opacityGradient[0]
        const rawParams = props.opacityGradient.slice(1) as Required<ImgProps>['opacityGradient'][1][]
        let params: [number, 0 | 1][] = []
        if (direction === 'to right')
          params = rawParams.map(e => [Math.round(this.#fixSize(e[0], canvas.width, 0)), e[1]])
        else if (direction === 'to bottom')
          params = rawParams.map(e => [Math.round(this.#fixSize(e[0], canvas.height, 0)), e[1]])
        opacityGradient(canvas, direction, params)
      }
      if (props.unsharpMask) unsharpMask(canvas, ...props.unsharpMask)
      image = canvas
    }
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

  #drawBackground(pos: Position, props: DivProps | ImgProps) {
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
        if (!Number.isNaN(sizeNum)) return (sizeNum * length) / 100
      }
    }
    return defaultValue ?? ('auto' as T extends number ? number : number | 'auto')
  }

  #getTextWidth(text: XElement, fontSize: SxSize | undefined) {
    if (typeof text !== 'string' && typeof text !== 'number') return undefined
    this.#ctxFont(fontSize)
    return this.#ctx.measureText(text.toString()).width
  }

  #ctxFont(fontSize: SxSize | undefined) {
    this.#ctx.font = `${this.#fixSize(fontSize, this.#fontSize, this.#fontSize)}px ${this.#isFontReady ? this.#fontFamily : defaultFont}`
  }
}

let xc: XCanvasWorker | undefined
self.onmessage = (event: MessageEvent<RequestWorker>) => {
  const { canvas, options, root } = event.data
  if (!xc && canvas) {
    const ctx = canvas.getContext('2d')
    if (ctx) xc ??= new XCanvasWorker(canvas, ctx)
    else new Error('web worker: OffscreenCanvas.getContext("2d")')
  }
  if (xc) {
    if (options) xc.options(options)
    xc.render(root)
  }
  //postMessage("render completed")
}
