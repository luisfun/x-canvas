#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const destPath = args[0]

const sourcePaths = [
  './node_modules/@luisfun/x-canvas/dist/x-canvas.js',
  './node_modules/@luisfun/x-canvas/dist/x-canvas.min.js',
]

if (!destPath) {
  console.error('usage: worker-copy <path>')
  process.exit(1)
}
try {
  if (args.includes('--clean')) fs.unlinkSync(destPath)
} catch (error) {
  console.log('no delete')
}
try {
  if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) {
      console.error('Not found:', sourcePath)
    } else {
      fs.copyFileSync(sourcePath, path.join(destPath, path.basename(sourcePath)))
    }
  }
  console.log('worker files copied')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
