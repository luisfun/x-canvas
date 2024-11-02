#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import pkg from '../package.json' assert { type: 'json' }

const args = process.argv.slice(2)
const destPath = args[0]

const sourcePaths = [
  './node_modules/@luisfun/x-canvas/dist/worker.js',
  './node_modules/@luisfun/x-canvas/dist/worker.min.js',
]

if (!destPath) {
  console.error('usage: worker-copy <path>')
  process.exit(1)
}
try {
  if (args.includes('--clean')) fs.rmSync(destPath, { recursive: true, force: true })
} catch (error) {
  console.log('no delete')
}
try {
  if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) {
      console.error('Not found:', sourcePath)
    } else {
      fs.copyFileSync(
        sourcePath,
        path.join(destPath, path.basename(sourcePath).replace('worker', `x-canvas@${pkg.version}`)),
      )
    }
  }
  console.log('worker files copied')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
