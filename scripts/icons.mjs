// Генерация PNG-иконок PWA из public/favicon.svg.
// Запуск: npm run icons. Результат коммитится, на сборке не выполняется.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const bg = '#16181d'
const source = await readFile(join(publicDir, 'favicon.svg'))

const render = (size) => sharp(source, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

// Обычные иконки: рисунок во весь квадрат.
for (const size of [192, 512]) {
  await writeFile(join(publicDir, `icon-${size}.png`), await render(size))
}

// apple-touch-icon: без прозрачности, углы скругляет сама iOS.
await writeFile(
  join(publicDir, 'apple-touch-icon.png'),
  await sharp({ create: { width: 180, height: 180, channels: 4, background: bg } })
    .composite([{ input: await render(180) }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
)

// Maskable: рисунок ужат в безопасную зону, фон во весь квадрат.
const inner = 336
await writeFile(
  join(publicDir, 'icon-maskable-512.png'),
  await sharp({ create: { width: 512, height: 512, channels: 4, background: bg } })
    .composite([{ input: await render(inner), left: (512 - inner) / 2, top: (512 - inner) / 2 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
)

console.log('иконки готовы: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png')
