// 依存なしでアイコンPNGを生成する。ビルド前に1度走らせるだけ。
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const off = y * (size * 4 + 1)
    raw[off] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size)
      raw.writeUInt8(r, off + 1 + x * 4)
      raw.writeUInt8(g, off + 2 + x * 4)
      raw.writeUInt8(b, off + 3 + x * 4)
      raw.writeUInt8(a, off + 4 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// 背景 + バーベル1本（中央の棒と左右のプレート）
const BG = [16, 18, 20, 255]
const FG = [232, 234, 237, 255]
const AC = [77, 163, 255, 255]
const draw = (x, y, s) => {
  const u = x / s, v = y / s
  const bar = Math.abs(v - 0.5) < 0.045 && u > 0.17 && u < 0.83
  const plateL = Math.abs(v - 0.5) < 0.2 && u > 0.2 && u < 0.3
  const plateR = Math.abs(v - 0.5) < 0.2 && u > 0.7 && u < 0.8
  const innerL = Math.abs(v - 0.5) < 0.13 && u > 0.33 && u < 0.39
  const innerR = Math.abs(v - 0.5) < 0.13 && u > 0.61 && u < 0.67
  if (plateL || plateR) return AC
  if (bar || innerL || innerR) return FG
  return BG
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, draw))
  console.log(name, size)
}
