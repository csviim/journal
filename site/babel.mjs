// 忘言 · 馆的数学
// 二十九个字符，每页三千二百字。编码可逆：内容与地址互为镜像。
// 构造：内容 C（base-29 大整数）→ N = C·K mod 29^3200（K 为馆钥，种子 1948，与 29 互素）
//       N 拆成 六边形号 × 262400 + (墙·架·卷·页)。解码走逆元 K⁻¹（Hensel 提升）。
// 同时供 node（构建期）与浏览器（/babel.js）使用；除标准 JS 外零依赖。

export const CHARSET = 'abcdefghijklmnopqrstuvwxyz .,'
export const PAGE = 3200
export const LINE = 'i read about my own mind today'

const B7 = 29n ** 7n
const M = 29n ** 3200n
const PER_HEX = 262400n // 4 墙 × 5 架 × 32 卷 × 410 页

// ---------- 可复现噪声（与站点书架同族的 LCG） ----------
export function noiseFrom(seed, n = PAGE) {
  let s = seed >>> 0
  let t = ''
  for (let i = 0; i < n; i++) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    t += CHARSET[Math.floor(s / 4294967296 * 29)]
  }
  return t
}

export function canonicalContent() {
  const t = noiseFrom(221)
  return t.slice(0, 2210) + LINE + t.slice(2210 + LINE.length)
}

// ---------- base-29 内容 ↔ 大整数 ----------
function toBig(str) {
  let acc = 0n
  for (let i = 0; i < str.length; i += 7) {
    const chunk = str.slice(i, i + 7)
    let v = 0
    for (const ch of chunk) v = v * 29 + CHARSET.indexOf(ch)
    acc = acc * (chunk.length === 7 ? B7 : 29n ** BigInt(chunk.length)) + BigInt(v)
  }
  return acc
}

function fromBig(n, len = PAGE) {
  const parts = []
  let x = n
  while (x > 0n) {
    let v = Number(x % B7)
    x /= B7
    let part = ''
    for (let j = 0; j < 7; j++) {
      part = CHARSET[v % 29] + part
      v = Math.floor(v / 29)
    }
    parts.push(part)
  }
  let s = parts.reverse().join('')
  if (s.length < len) s = 'a'.repeat(len - s.length) + s
  else s = s.slice(s.length - len)
  return s
}

// ---------- 六边形名 ↔ 大整数（base-36） ----------
function fromB36(str) {
  let acc = 0n
  for (let i = 0; i < str.length; i += 10) {
    const c = str.slice(i, i + 10)
    acc = acc * (36n ** BigInt(c.length)) + BigInt(parseInt(c, 36))
  }
  return acc
}

// ---------- 馆钥 K 与逆元 K⁻¹ ----------
function makeKey() {
  const digits = noiseFrom(1948) // 馆钥的种子是生日
  let K = toBig(digits)
  if (K % 29n === 0n) K += 1n // 与 29 互素
  // Hensel 提升求 K⁻¹ mod 29^3200
  let inv = 0n
  for (let i = 1n; i < 29n; i++) if ((K % 29n) * i % 29n === 1n) { inv = i; break }
  let e = 1
  while (e < PAGE) {
    e = Math.min(e * 2, PAGE)
    const mod = 29n ** BigInt(e)
    inv = inv * (2n - (K % mod) * inv % mod) % mod
    if (inv < 0n) inv += mod
  }
  if (K * inv % M !== 1n) throw new Error('馆钥逆元校验失败')
  return { K, Kinv: inv }
}
const { K, Kinv } = makeKey()

// ---------- 地址 ↔ 内容 ----------
function split(N) {
  const hexNum = N / PER_HEX
  let idx = Number(N % PER_HEX)
  const wall = Math.floor(idx / 65600) + 1; idx %= 65600
  const shelf = Math.floor(idx / 13120) + 1; idx %= 13120
  const vol = Math.floor(idx / 410) + 1
  const page = idx % 410 + 1
  return { hex: hexNum.toString(36), wall, shelf, vol, page }
}

function compose(addr) {
  const idx = (((addr.wall - 1) * 5 + (addr.shelf - 1)) * 32 + (addr.vol - 1)) * 410 + (addr.page - 1)
  return (fromB36(addr.hex) * PER_HEX + BigInt(idx)) % M
}

export function encode(content) {
  return split(toBig(content) * K % M)
}

export function decode(addr) {
  return fromBig(compose(addr) * Kinv % M)
}

export function step(addr, delta) {
  return split(((compose(addr) + BigInt(delta)) % M + M) % M)
}

// ---------- 检索 ----------
export function sanitize(text) {
  const clean = (text || '').toLowerCase().replace(/[^a-z .,]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.length ? clean.slice(0, PAGE) : null
}

export function searchContent(text, rng = Math.random) {
  const clean = sanitize(text)
  if (!clean) return null
  const off = Math.floor(rng() * (PAGE - clean.length + 1))
  const noise = noiseFrom(Math.floor(rng() * 4294967296))
  return { content: noise.slice(0, off) + clean + noise.slice(off + clean.length), off, len: clean.length }
}

// ---------- 地址的 hash 表示（URL #…） ----------
export function toHash(addr, o = null, l = null) {
  return `${addr.hex}.${addr.wall}.${addr.shelf}.${addr.vol}.${addr.page}` + (o != null ? `.o${o}l${l}` : '')
}

export function parseHash(h) {
  const m = (h || '').replace(/^#/, '').match(/^([0-9a-z]+)\.(\d+)\.(\d+)\.(\d+)\.(\d+)(?:\.o(\d+)l(\d+))?$/)
  if (!m) return null
  const addr = { hex: m[1], wall: +m[2], shelf: +m[3], vol: +m[4], page: +m[5] }
  if (addr.wall < 1 || addr.wall > 4 || addr.shelf < 1 || addr.shelf > 5 || addr.vol < 1 || addr.vol > 32 || addr.page < 1 || addr.page > 410) return null
  const o = m[6] != null ? +m[6] : null
  const l = m[7] != null ? +m[7] : null
  if (o != null && (o < 0 || o + l > PAGE)) return null
  return { addr, o, l }
}
