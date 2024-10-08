import type { DivProps, Position, Structure, XElement } from './types'

export class XCanvas {
  #canvas: HTMLCanvasElement
  #offscreen: OffscreenCanvas
  #structure: Structure | undefined
  constructor(
    canvasElement: HTMLCanvasElement,
    options?: {
      canvasWidth?: number
      canvasHeight?: number
      fontFamily?: string
      fontSize?: number
      fontColor?: string
    },
  ) {
    this.#canvas = canvasElement
    this.#offscreen = canvasElement.transferControlToOffscreen()
    this.#structure = undefined
  }

  /**
   * Analysis of structure
   */
  root(props: DivProps, ...children: XElement[]) {
    const pos = { x: 0, y: 0, z: 0, w: this.#canvas.width, h: this.#canvas.height }
    const elem = { type: 'div', props, children } as const
    const inner = recuStructure(pos, elem)
    this.#structure = { pos, elem, inner }
  }
}

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
const calcPos = (outer: CalcOuter, innerArr: CalcInner[], direction?: `column` | `row`) => [
  { x: 1, y: 1, w: 1, h: 1, z: 1 },
]
