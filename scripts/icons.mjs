// Generates the PWA PNG icons from public/favicon.svg.
// Run: npm run icons. The result is committed, the build does not run this.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const bg = '#16181d'
const source = await readFile(join(publicDir, 'favicon.svg'))

const render = (size) => sharp(source, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

// Plain icons: the drawing fills the whole square.
for (const size of [192, 512]) {
  await writeFile(join(publicDir, `icon-${size}.png`), await render(size))
}

// apple-touch-icon: no transparency, iOS rounds the corners itself.
await writeFile(
  join(publicDir, 'apple-touch-icon.png'),
  await sharp({ create: { width: 180, height: 180, channels: 4, background: bg } })
    .composite([{ input: await render(180) }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
)

// Maskable: the drawing is squeezed into the safe zone, the background fills the square.
const inner = 336
await writeFile(
  join(publicDir, 'icon-maskable-512.png'),
  await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } })
    .composite([{ input: await render(inner), left: (512 - inner) / 2, top: (512 - inner) / 2 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
)

console.log('icons generated: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png')
