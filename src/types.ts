export type Options = {
  canvasWidth?: number
  canvasHeight?: number
  fontFace?: ConstructorParameters<typeof FontFace>
  //fontFamily?: string
  fontSize?: number
  fontColor?: string
  //renderDelay?: number
  debugMode?: boolean
}

export type RequestWorker = { canvas: OffscreenCanvas | undefined; options: Options | undefined; root: DivElement }

export type SxSize = number | (string & {}) | 'auto'
export type SxBorder = { width: number; color: string; offset?: number }
type Props = {
  display?: 'block' | 'flex'
  z?: number
  w?: SxSize
  h?: SxSize
  //aspectRatio?: number // 実装が面倒そう
  m?: SxSize // 1パラメータのみ（一旦）
  mt?: SxSize
  mr?: SxSize
  mb?: SxSize
  ml?: SxSize
  p?: SxSize // 1パラメータのみ（一旦）
  pt?: SxSize
  pr?: SxSize
  pb?: SxSize
  pl?: SxSize
  position?: 'absolute'
  fontSize?: SxSize
  color?: string
  backgroundColor?: string
  backgroundImage?: string
  backgroundBlendMode?: GlobalCompositeOperation
  //backgroundRadialGradient?: string[]
  overflow?: 'hidden'
  borderRadius?: SxSize // 1パラメータのみ（一旦）
  border?: SxBorder | SxBorder[]
  shadow?: { size: number; color?: string; for?: number } // img, text only
  clipPathLine?: SxSize[]
  opacity?: number // 0-1 img, text
  objectFit?: 'contain' | 'cover' // imgタグ と bgImage要素
}
export type DivProps = Props & {
  textAlign?: 'left' | 'right' | 'center'
}
export type ImgProps = Props & {
  id?: string // 画像の識別ID
  clipImgRect?: [SxSize, SxSize, SxSize, SxSize]
  opacityGradient?: ['to right' | 'to bottom', ...[SxSize, 0 | 1][]]
  unsharpMask?: [amount: number, radius: number, threshold: number]
}

export type DivElement = {
  type: 'div'
  props: DivProps
  children: XElement[]
}
export type ImgElement = {
  type: 'img'
  props: ImgProps
  children: (string | ImageBitmap)[]
}
export type XElement = DivElement | ImgElement | ImageBitmap | string | number | undefined

export type Position = {
  x: number
  y: number
  z: number
  w: number
  h: number
}
export type Structure = {
  pos: Position
  elem: XElement
  inner: Structure[] | undefined
}

export type CalcOuter = Position & { pt: number; pr: number; pb: number; pl: number }
export type CalcInner = Required<Pick<Props, 'z' | 'w' | 'h' | 'mt' | 'mr' | 'mb' | 'ml'>> & Pick<Props, 'position'>
export type CalcUniInner = { len: SxSize; ms: SxSize; me: SxSize; pos: 'absolute' | undefined }

export type FirstElement<T extends unknown[]> = T extends [infer F, ...unknown[]] ? F : never
