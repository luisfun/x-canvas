import type { DivProps, ImgProps, XElement } from './types'

export const div = (props: DivProps, ...children: XElement[]): XElement => ({ type: 'div', props, children })
export const img = (props: ImgProps): XElement => ({ type: 'img', props, children: [] })
