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

function copyFile(source, destination) {
  const fileName = path.basename(source)
  const destFile = path.join(destination, fileName)

  fs.copyFileSync(source, destFile)
  console.log(`copy: ${fileName}`)
}

try {
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true })
  }

  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) {
      console.error('Not found:', sourcePath)
    } else {
      copyFile(sourcePath, destPath)
    }
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
