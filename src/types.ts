type NodeName = 'div' | 'img'

type SxSize = number | (string & {}) | 'auto'
type SxBorder = { width: number; color: string; offset?: number }
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
}
export type DivProps = Props & {
  textAlign?: 'left' | 'right' | 'center'
}
export type ImgProps = Props & {
  objectFit?: 'contain' | 'cover' // imgタグ と bgImage要素
}
//export type Props = DivProps | ImgProps

export type XElement =
  | {
      type: NodeName
      props: DivProps | ImgProps
      children: XElement[]
    }
  | string
  | number
  | undefined

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
