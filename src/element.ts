import type { DivElement, DivProps, ImgElement, ImgProps, XElement } from './types'

export const div = (props: DivProps, ...children: XElement[]): DivElement => ({ type: 'div', props, children })
export const img = (props: ImgProps): ImgElement => ({ type: 'img', props, children: [] })
