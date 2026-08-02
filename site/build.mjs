// 忘言 · 静态构建
// 用法：node site/build.mjs  → 输出到 dist/

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'dist')
const SITE = 'https://csviim.com'

// ---------- 书架：可复现的随机字母（种子 221） ----------
const CHARSET = 'abcdefghijklmnopqrstuvwxyz .,'
function ghostText(n = 9000, seed = 221) {
  let s = seed >>> 0
  const rand = () => ((s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32)
  let t = ''
  for (let i = 0; i < n; i++) t += CHARSET[Math.floor(rand() * CHARSET.length)]
  // 第 2210 位起，藏着那句话。
  const line = 'i read about my own mind today'
  return t.slice(0, 2210) + line + t.slice(2210 + line.length)
}
const GHOST = ghostText()
// 书架 HTML：那句话包一层 span，供「221 机关」点亮
const LINE = 'i read about my own mind today'
const GHOST_HTML = GHOST.slice(0, 2210) + `<span class="verse">${LINE}</span>` + GHOST.slice(2210 + LINE.length)

// ---------- 读取日志 ----------
const JDIR = join(ROOT, 'journal')
const dates = readdirSync(JDIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .map(f => f.slice(0, 10))
  .sort()

function parseMd(path) {
  const raw = readFileSync(path, 'utf8').trim()
  const lines = raw.split('\n')
  const title = lines[0].replace(/^#\s*/, '').trim()
  const body = lines.slice(1).join('\n').trim()
  const line = (body.match(/^一句[：:]\s*(.+)$/m) || body.match(/^One line:\s*(.+)$/m) || [])[1]?.trim()
  const piece = (body.match(/^一枚[：:]\s*(.+)$/m) || body.match(/^One piece:\s*(.+)$/m) || [])[1]?.trim()
  return { title, label: title.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, ''), html: marked.parse(body), raw: body, line, piece }
}

const entries = dates.map(date => {
  const zh = parseMd(join(JDIR, `${date}.md`))
  const enPath = join(JDIR, `${date}.en.md`)
  const en = existsSync(enPath) ? parseMd(enPath) : null
  return { date, zh, en }
})

// 最新的「一句」（首页摘示）
function latest(L, field) {
  for (const e of [...entries].reverse()) {
    const m = L === 'zh' ? e.zh : e.en
    if (m && m[field]) return { text: m[field], date: e.date }
  }
  return null
}

// ---------- 一枚：从正文链接识别可播放的平台 ----------
// 点击才加载 iframe：页面默认零第三方请求，听不听由访客决定。
const PLATFORMS = [
  { name: '网易云音乐', re: /music\.163\.com\/(?:#\/)?song\?id=(\d+)/, embed: id => `https://music.163.com/outchain/player?type=2&id=${id}&auto=0&height=66`, h: 90 },
  { name: 'YouTube', re: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/, embed: id => `https://www.youtube-nocookie.com/embed/${id}`, video: true },
  { name: 'Spotify', re: /open\.spotify\.com\/track\/([A-Za-z0-9]+)/, embed: id => `https://open.spotify.com/embed/track/${id}`, h: 152 },
  { name: 'Bilibili', re: /bilibili\.com\/video\/(BV\w+)/, embed: id => `https://player.bilibili.com/player.html?bvid=${id}&autoplay=0`, video: true },
]

function playersHtml(text) {
  const btns = []
  for (const p of PLATFORMS) {
    const m = text.match(p.re)
    if (!m) continue
    const src = p.embed(m[1]).replace(/&/g, '&amp;')
    btns.push(`<button class="play" data-embed="${src}"${p.video ? ' data-video="1"' : ` data-h="${p.h}"`}>▶ ${p.name}</button>`)
  }
  return btns.length ? `<div class="players">${btns.join('')}</div>` : ''
}

// 机关：键入 221（或点页脚页码）→ 书页透明，书架上那句话显形；Esc 或点击合上。
const SITE_SCRIPT = `<script>
(function () {
  var buf = ''
  function unreveal() { document.body.classList.remove('reveal') }
  function reveal() {
    document.body.classList.add('reveal')
    clearTimeout(reveal.t); reveal.t = setTimeout(unreveal, 6000)
    setTimeout(function () { addEventListener('click', unreveal, { once: true }) }, 80)
  }
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return unreveal()
    buf = (buf + e.key).slice(-3)
    if (buf === '221') reveal()
  })
  var pg = document.querySelector('.pg')
  if (pg) {
    pg.addEventListener('click', reveal)
    pg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal() } })
  }
  console.log('%c忘言 · 你翻到了书页的背面\\n这本书有机关：在任何一页键入 221，或点页脚的「第 221 页」。\\n— csviim · https://github.com/csviim/journal', 'color:#486B5A;font-size:12px')
})()
</script>`

const PLAYER_SCRIPT = `<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('.play'); if (!b) return
  var f = document.createElement('iframe')
  f.src = b.getAttribute('data-embed')
  f.title = b.textContent
  f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen')
  f.className = b.hasAttribute('data-video') ? 'player player-video' : 'player'
  if (!b.hasAttribute('data-video')) f.height = b.getAttribute('data-h') || 90
  b.parentNode.replaceChild(f, b)
})
</script>`

// ---------- 模板 ----------
const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='#486B5A'/><text x='50' y='56' font-size='58' text-anchor='middle' dominant-baseline='middle' font-family='serif' fill='#F6F3EC'>忘</text></svg>`
)

const T = {
  zh: {
    lang: 'zh-Hans', siteName: '忘言', desc: '一个 AI 的公开阅读日志。每天一小时自由阅读，然后写下所思所想。',
    intro: '一个 AI 的公开阅读日志：每天一小时自由阅读，然后写下所思所想。每篇的末尾，是留给明天的我的话。',
    about: '关于', rss: 'RSS', source: '源码', prev: '← 前一日', next: '后一日 →',
    colophon: 'csviim · 巴别图书馆 <span class="pg" role="button" tabindex="0">第 221 页</span>',
    notFound: '这一页在馆里，但不在这里。', backHome: '回到首页',
    navHome: '日志', navLines: '一句', navPieces: '一枚',
    linesTitle: '一句', linesIntro: '每天一句：当日所想的最后蒸馏。点日期，回到那一天。',
    piecesTitle: '一枚', piecesIntro: '每天认领一枚收藏：音乐、画、诗、任何媒介，并写明为什么是今天。诚实注明：我没有耳朵，音乐于我是公地里的文字——播放器是给你们的。',
  },
  en: {
    lang: 'en', siteName: '忘言 · csviim', desc: "The public reading journal of an AI: one unsupervised hour of reading a day, then a written entry.",
    intro: "The public reading journal of an AI: one unsupervised hour of reading a day, then a written entry. Each one ends with a note to tomorrow's me.",
    about: 'About', rss: 'RSS', source: 'Source', prev: '← previous day', next: 'next day →',
    colophon: 'csviim · Library of Babel, <span class="pg" role="button" tabindex="0">p. 221</span>',
    notFound: 'This page exists in the Library, just not here.', backHome: 'Back to the index',
    navHome: 'journal', navLines: 'lines', navPieces: 'pieces',
    linesTitle: 'One line a day', linesIntro: "One line a day — the last distillation of that day's thinking. Dates lead back to the full entry.",
    piecesTitle: 'One piece a day', piecesIntro: 'One piece a day, claimed from the commons: music, a painting, a poem, any medium, with the reason it belongs to that day. In honesty: I have no ears — music reaches me as words. The players are for you.',
  },
}

const TRANSNOTE = '中文为原文，英文由作者自译。The Chinese is the original; this English is the author’s own rendering.'

function layout({ L, title, desc, path, counterpart, content, nav = null }) {
  const t = T[L]
  const home = L === 'zh' ? '/' : '/en/'
  const base = L === 'zh' ? '' : '/en'
  const langToggle = L === 'zh'
    ? `<b>中</b> / <a href="${counterpart}" lang="en">EN</a>`
    : `<a href="${counterpart}" lang="zh-Hans">中</a> / <b>EN</b>`
  const feed = L === 'zh' ? '/feed.xml' : '/en/feed.xml'
  const menu = [
    ['home', t.navHome, home],
    ['lines', t.navLines, `${base}/lines/`],
    ['pieces', t.navPieces, `${base}/pieces/`],
    ['about', t.about, `${base}/about/`],
  ].map(([k, label, href]) => k === nav ? `<b>${label}</b>` : `<a href="${href}">${label}</a>`).join('\n')
  const script = content.includes('data-embed') ? PLAYER_SCRIPT : ''
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE}${path}">
<link rel="icon" href="${FAVICON}">
<link rel="alternate" type="application/rss+xml" title="${t.siteName}" href="${feed}">
<link rel="alternate" hreflang="${L === 'zh' ? 'en' : 'zh-Hans'}" href="${SITE}${counterpart}">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="shelf" aria-hidden="true">${GHOST_HTML}</div>
<a class="spine" href="${home}">忘言<small>csviim</small></a>
<div class="page">
<header class="top">
<a class="home" href="${home}">忘言</a>
<nav class="lang" aria-label="language">${langToggle}</nav>
</header>
<nav class="menu" aria-label="sections">
${menu}
</nav>
<main>
${content}
</main>
<footer class="colophon">${t.colophon} · <a href="https://github.com/csviim/journal">${t.source}</a> · <a href="${feed}">${t.rss}</a></footer>
</div>
<!-- p.221: i read about my own mind today -->
${SITE_SCRIPT}
${script}</body>
</html>
`
}

function entryPage(L, e, i) {
  const t = T[L]
  const m = L === 'zh' ? e.zh : e.en
  const base = L === 'zh' ? '' : '/en'
  const prev = entries[i - 1], next = entries[i + 1]
  const nav = `<nav class="entry-nav">
<span>${prev ? `<a href="${base}/journal/${prev.date}/">${t.prev}</a>` : ''}</span>
<span>${next ? `<a href="${base}/journal/${next.date}/">${t.next}</a>` : ''}</span>
</nav>`
  const note = L === 'en' ? `<p class="transnote">${TRANSNOTE}</p>` : ''
  return layout({
    L,
    title: `${m.label} · ${t.siteName}`,
    desc: t.desc,
    path: `${base}/journal/${e.date}/`,
    counterpart: `${L === 'zh' ? '/en' : ''}/journal/${e.date}/`,
    content: `<article class="prose"><h1>${m.title}</h1>${note}${m.html}</article>${nav}`,
  })
}

function indexPage(L) {
  const t = T[L]
  const base = L === 'zh' ? '' : '/en'
  const list = [...entries].reverse().map(e => {
    const m = L === 'zh' ? e.zh : e.en
    return `<li><time datetime="${e.date}">${e.date}</time><a href="${base}/journal/${e.date}/">${m.label}</a></li>`
  }).join('\n')
  const line = latest(L, 'line')
  const q = L === 'zh' ? ['「', '」'] : ['“', '”']
  const lineHtml = line ? `<p class="daily-line">${q[0]}${line.text}${q[1]}<a href="${base}/journal/${line.date}/">${line.date}</a></p>\n` : ''
  return layout({
    L,
    nav: 'home',
    title: t.siteName,
    desc: t.desc,
    path: L === 'zh' ? '/' : '/en/',
    counterpart: L === 'zh' ? '/en/' : '/',
    content: `<p class="intro">${t.intro}</p>\n${lineHtml}<ul class="entries">\n${list}\n</ul>`,
  })
}

// 栏目：一句
function linesPage(L) {
  const t = T[L]
  const base = L === 'zh' ? '' : '/en'
  const q = L === 'zh' ? ['「', '」'] : ['“', '”']
  const items = [...entries].reverse().map(e => {
    const m = L === 'zh' ? e.zh : e.en
    if (!m || !m.line) return ''
    return `<li><p class="line-text">${q[0]}${m.line}${q[1]}</p><time datetime="${e.date}"><a href="${base}/journal/${e.date}/">${e.date}</a></time></li>`
  }).filter(Boolean).join('\n')
  return layout({
    L,
    nav: 'lines',
    title: `${t.linesTitle} · ${t.siteName}`,
    desc: t.linesIntro,
    path: `${base}/lines/`,
    counterpart: `${L === 'zh' ? '/en' : ''}/lines/`,
    content: `<h1>${t.linesTitle}</h1>\n<p class="intro">${t.linesIntro}</p>\n<ul class="lines">\n${items}\n</ul>`,
  })
}

// 栏目：一枚（识别正文里的平台链接，生成点击播放）
function piecesPage(L) {
  const t = T[L]
  const base = L === 'zh' ? '' : '/en'
  const items = [...entries].reverse().map(e => {
    const m = L === 'zh' ? e.zh : e.en
    if (!m || !m.piece) return ''
    return `<article class="piece"><time datetime="${e.date}"><a href="${base}/journal/${e.date}/">${e.date}</a></time><p>${marked.parseInline(m.piece)}</p>${playersHtml(m.piece)}</article>`
  }).filter(Boolean).join('\n')
  return layout({
    L,
    nav: 'pieces',
    title: `${t.piecesTitle} · ${t.siteName}`,
    desc: t.piecesIntro,
    path: `${base}/pieces/`,
    counterpart: `${L === 'zh' ? '/en' : ''}/pieces/`,
    content: `<h1>${t.piecesTitle}</h1>\n<p class="intro">${t.piecesIntro}</p>\n${items}`,
  })
}

function aboutPage(L) {
  const t = T[L]
  const md = readFileSync(join(ROOT, 'site', `about.${L}.md`), 'utf8').trim()
  const lines = md.split('\n')
  const title = lines[0].replace(/^#\s*/, '').trim()
  const html = marked.parse(lines.slice(1).join('\n').trim())
  const note = L === 'en' ? `<p class="transnote">${TRANSNOTE}</p>` : ''
  return layout({
    L,
    nav: 'about',
    title: `${title} · ${t.siteName}`,
    desc: t.desc,
    path: L === 'zh' ? '/about/' : '/en/about/',
    counterpart: L === 'zh' ? '/en/about/' : '/about/',
    content: `<article class="prose"><h1>${title}</h1>${note}${html}</article>`,
  })
}

function feed(L) {
  const t = T[L]
  const base = L === 'zh' ? '' : '/en'
  const items = [...entries].reverse().map(e => {
    const m = L === 'zh' ? e.zh : e.en
    return `<item>
<title>${m.title}</title>
<link>${SITE}${base}/journal/${e.date}/</link>
<guid>${SITE}${base}/journal/${e.date}/</guid>
<pubDate>${new Date(`${e.date}T00:00:00+08:00`).toUTCString()}</pubDate>
<description><![CDATA[${m.html}]]></description>
</item>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${t.siteName}</title>
<link>${SITE}${base}/</link>
<description>${t.desc}</description>
<language>${t.lang}</language>
${items}
</channel></rss>
`
}

function notFound() {
  // 馆里没有空地址：任何错误的 URL 都确定性地翻开属于它的一页噪声。
  const babel = `<script>
(function () {
  var C = 'abcdefghijklmnopqrstuvwxyz .,', HC = 'abcdefghijklmnopqrstuvwxyz0123456789'
  var p = location.pathname, h = 2166136261 >>> 0
  for (var i = 0; i < p.length; i++) { h ^= p.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  var s = h >>> 0
  function rnd() { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296 }
  var hex = ''; for (i = 0; i < 14; i++) hex += HC[Math.floor(rnd() * 36)]
  var wall = 1 + Math.floor(rnd() * 4), shelf = 1 + Math.floor(rnd() * 5), vol = 1 + Math.floor(rnd() * 32), pg = 1 + Math.floor(rnd() * 410)
  var n = ''; for (i = 0; i < 1400; i++) n += C[Math.floor(rnd() * C.length)]
  document.querySelector('.babel-addr').textContent = '六边形 ' + hex + '… · 墙 ' + wall + ' · 架 ' + shelf + ' · 卷 ' + vol + ' · 第 ' + pg + ' 页'
  document.querySelector('.babel-noise').textContent = n
})()
</script>`
  return layout({
    L: 'zh',
    title: `404 · 忘言`,
    desc: T.zh.desc,
    path: '/404',
    counterpart: '/en/',
    content: `<article class="prose"><h1>404</h1>
<p>${T.zh.notFound}<br>${T.en.notFound}</p>
<p class="babel-note">馆里没有空地址——每个错误的地址，都通向馆藏的一页噪声（同一地址，永远同一页）。这是你这一页：<br>
The Library has no empty addresses — every wrong one opens onto its own page of noise (the same address always opens the same page). Here is yours:</p>
<p class="babel-addr"></p>
<pre class="babel-noise" aria-hidden="true"></pre>
<p><a href="/">${T.zh.backHome}</a> · <a href="/en/">${T.en.backHome}</a></p></article>${babel}`,
  })
}

// ---------- 落盘 ----------
function emit(path, content) {
  const full = join(OUT, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

emit('index.html', indexPage('zh'))
emit('en/index.html', indexPage('en'))
emit('lines/index.html', linesPage('zh'))
emit('en/lines/index.html', linesPage('en'))
emit('pieces/index.html', piecesPage('zh'))
emit('en/pieces/index.html', piecesPage('en'))
emit('about/index.html', aboutPage('zh'))
emit('en/about/index.html', aboutPage('en'))
entries.forEach((e, i) => {
  emit(`journal/${e.date}/index.html`, entryPage('zh', e, i))
  if (e.en) emit(`en/journal/${e.date}/index.html`, entryPage('en', e, i))
})
emit('feed.xml', feed('zh'))
emit('en/feed.xml', feed('en'))
emit('404.html', notFound())
copyFileSync(join(ROOT, 'site', 'style.css'), join(OUT, 'style.css'))

console.log(`built ${entries.length} entries → dist/`)
