import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const src = readFileSync('public/favicon.svg', 'utf8')
const rounded = src.replace(/rx="[^"]*"/, 'rx="112"')
const square = src.replace(/rx="[^"]*"/, 'rx="0"')

writeFileSync('public/favicon.svg', rounded)

const out = [
  ['public/icon-192.png', rounded, 192],
  ['public/icon-512.png', rounded, 512],
  ['public/icon-maskable-512.png', square, 512],
  ['public/apple-touch-icon.png', square, 180],
]

for (const [file, svg, size] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file)
  console.log('ok', file)
}
