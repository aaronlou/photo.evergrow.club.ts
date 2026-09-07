/**
 * 生成胶卷商品封面 SVG（品牌风格插画，输出到 assets/films/）。
 * 将来拿到真实产品图时，用同名文件替换即可（如 kodak-gold-200-135.jpg）。
 * 用法：node scripts/generate-film-covers.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "films")

const films = [
  {
    file: "kodak-gold-200-135.svg",
    brand: "KODAK",
    name: "Gold 200",
    format: "135",
    iso: "ISO 200",
    process: "C-41 彩色负片",
    bg: "#f5c542",
    fg: "#241c08",
    accent: "#d62828",
  },
  {
    file: "kodak-portra-400-135.svg",
    brand: "KODAK",
    name: "Portra 400",
    format: "135",
    iso: "ISO 400",
    process: "C-41 彩色负片",
    bg: "#ecdfc8",
    fg: "#3a2a20",
    accent: "#7b4fa6",
  },
  {
    file: "kodak-ektar-100-135.svg",
    brand: "KODAK",
    name: "Ektar 100",
    format: "135",
    iso: "ISO 100",
    process: "C-41 彩色负片",
    bg: "#c1121f",
    fg: "#fff7e8",
    accent: "#ffd23f",
  },
  {
    file: "fujifilm-c200-135.svg",
    brand: "FUJIFILM",
    name: "C200",
    format: "135",
    iso: "ISO 200",
    process: "C-41 彩色负片",
    bg: "#1f7a44",
    fg: "#ffffff",
    accent: "#9fd356",
  },
  {
    file: "ilford-hp5-135.svg",
    brand: "ILFORD",
    name: "HP5 PLUS",
    format: "135",
    iso: "ISO 400",
    process: "黑白 (D-76)",
    bg: "#262626",
    fg: "#f2f2f2",
    accent: "#e63946",
  },
  {
    file: "kodak-gold-200-120.svg",
    brand: "KODAK",
    name: "Gold 200",
    format: "120",
    iso: "ISO 200",
    process: "C-41 彩色负片",
    bg: "#f5c542",
    fg: "#241c08",
    accent: "#d62828",
  },
  {
    file: "kodak-portra-400-120.svg",
    brand: "KODAK",
    name: "Portra 400",
    format: "120",
    iso: "ISO 400",
    process: "C-41 彩色负片",
    bg: "#ecdfc8",
    fg: "#3a2a20",
    accent: "#7b4fa6",
  },
  {
    file: "fujifilm-pro400h-120.svg",
    brand: "FUJIFILM",
    name: "PRO 400H",
    format: "120",
    iso: "ISO 400",
    process: "C-41 彩色负片",
    bg: "#0e7c66",
    fg: "#ffffff",
    accent: "#f4a259",
  },
  {
    file: "ilford-hp5-120.svg",
    brand: "ILFORD",
    name: "HP5 PLUS",
    format: "120",
    iso: "ISO 400",
    process: "黑白 (D-76)",
    bg: "#262626",
    fg: "#f2f2f2",
    accent: "#e63946",
  },
]

/** 胶卷齿孔 */
const sprockets = (y) => {
  const holes = []
  for (let i = 0; i < 9; i++) {
    holes.push(`<rect x="${14 + i * 42}" y="${y}" width="18" height="26" rx="5"/>`)
  }
  return holes.join("\n    ")
}

/** 光圈叶片（正六边形） */
const hexagon = (cx, cy, r) => {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(" ")
}

const cover = (f) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
  <defs>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.2" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.82" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="400" height="500" rx="16" fill="${f.bg}"/>
  <rect width="400" height="500" rx="16" fill="url(#sheen)"/>
  <g fill="${f.fg}" opacity="0.28">
    ${sprockets(30)}
    ${sprockets(444)}
  </g>
  <text x="200" y="108" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="700" letter-spacing="8" fill="${f.fg}" text-anchor="middle">${f.brand}</text>
  <line x1="56" y1="130" x2="344" y2="130" stroke="${f.fg}" stroke-opacity="0.45" stroke-width="2"/>
  <text x="200" y="190" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="700" fill="${f.fg}" text-anchor="middle">${f.name}</text>
  <rect x="118" y="218" width="164" height="40" rx="20" fill="${f.accent}"/>
  <text x="200" y="244" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#ffffff" text-anchor="middle">${f.format} 画幅 · ${f.iso}</text>
  <circle cx="200" cy="362" r="74" fill="none" stroke="${f.fg}" stroke-width="7" opacity="0.9"/>
  <polygon points="${hexagon(200, 362, 52)}" fill="none" stroke="${f.fg}" stroke-width="5" opacity="0.9"/>
  <circle cx="200" cy="362" r="14" fill="${f.fg}" opacity="0.9"/>
  <text x="200" y="470" font-family="Helvetica, Arial, sans-serif" font-size="17" letter-spacing="3" fill="${f.fg}" text-anchor="middle">${f.process}</text>
</svg>
`

mkdirSync(outDir, { recursive: true })
for (const f of films) {
  writeFileSync(join(outDir, f.file), cover(f))
  console.log("generated", f.file)
}
