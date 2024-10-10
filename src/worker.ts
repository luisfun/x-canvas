import type { Options } from './types'

const loadImage = (url: string) =>
  fetch(url)
    .then(res => res.blob())
    .then(blob => createImageBitmap(blob))

class XCanvas {
  
}

onmessage = (event: MessageEvent<{ canvas: OffscreenCanvas; options: Options | undefined }>) => {
  const { canvas, options } = event.data
  const result = (options?.fontSize || 0) * 2
  postMessage(result)
}
