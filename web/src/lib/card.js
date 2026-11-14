// A shareable verdict card (1200 x 630 PNG) for one atlas sample point: the three tests, the rate with its
// range, and the yearly record. Drawn on a canvas from the same published files the page uses.
import { deg, fmt, pval } from './format'

const C = { ground: '#05070a', ink: '#e9eef2', ink2: '#b8c2cc', meta: '#8b96a2', line: '#1c2630',
  usual: '#f0894a', honest: '#56b4e9', up: '#009e73', down: '#cc79a7' }

function yearly(v) {
  const out = []
  for (let y = 0; y < v.values.length / 12; y++) {
    const a = []
    for (let m = 0; m < 12; m++) { const x = v.values[y * 12 + m]; if (x != null) a.push(x - v.clim[m]) }
    out.push(a.length >= 9 ? a.reduce((s, x) => s + x, 0) / a.length : null)
  }
  return out
}

export async function verdictCard({ atlas, cell, record, link }) {
  await document.fonts?.ready
  const W = 1200
  const H = 630
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const g = cv.getContext('2d')
  const font = (w, px, fam = 'Barlow') => `${w} ${px}px "${fam}", system-ui, sans-serif`
  g.fillStyle = C.ground
  g.fillRect(0, 0, W, H)
  g.fillStyle = cell.honest ? '#0072b2' : '#2b3947'
  g.fillRect(0, 0, 10, H)

  g.fillStyle = C.meta
  g.font = font(600, 18, 'Barlow Semi Condensed')
  g.fillText('NOISE TRAP  ·  IS THIS TREND REAL?', 56, 64)
  g.fillStyle = C.ink
  g.font = font(700, 46, 'Barlow Semi Condensed')
  g.fillText(`${atlas.name} at ${deg(cell.lat, cell.lon)}`, 56, 122)

  g.font = font(700, 76, 'Barlow Semi Condensed')
  g.fillStyle = cell.honest ? C.honest : C.ink2
  g.fillText(cell.honest ? 'The trend is real' : 'Not proven', 56, 214)

  const rows = [
    ['Usual test', cell.naive ? 'trend' : 'no trend', `p ${pval(cell.p_naive)}`, C.usual],
    ['Stickiness removed', cell.pw ? 'trend' : 'no trend', `p ${pval(cell.p_honest)}`, C.ink2],
    ['Honest test (FDR 10%)', cell.honest ? 'trend is real' : 'not proven', `needs p ≤ ${pval(atlas.fdr_threshold)}`, C.honest],
  ]
  rows.forEach(([name, verdict, p, color], i) => {
    const y = 286 + i * 52
    g.fillStyle = C.line
    g.fillRect(56, y + 16, 560, 1)
    g.font = font(400, 22)
    g.fillStyle = C.meta
    g.fillText(name, 56, y)
    g.font = font(600, 24)
    g.fillStyle = color
    g.fillText(verdict, 300, y)
    g.font = font(400, 20)
    g.fillStyle = C.meta
    g.fillText(p, 470, y)
  })

  g.font = font(400, 24)
  g.fillStyle = C.ink
  const word = cell.rate > 0 ? atlas.rising : atlas.falling
  g.fillText(`${word} ${fmt(cell.rate, true)} ${atlas.units} per decade`, 56, 470)
  g.font = font(400, 20)
  g.fillStyle = C.meta
  g.fillText(`95% range ${fmt(cell.rate_lo, true)} to ${fmt(cell.rate_hi, true)} · stickiness φ ${fmt(cell.phi, false, 2)}`, 56, 502)
  if (!cell.honest && cell.more_years > 0) {
    g.fillStyle = C.ink2
    g.fillText(`At this rate and stickiness, about ${Math.ceil(cell.more_years)} more years of data are needed.`, 56, 534)
  }

  const ys = record ? yearly(record) : []
  const box = { x: 680, y: 260, w: 464, h: 230 }
  if (ys.some((v) => v != null)) {
    const max = Math.max(...ys.filter((v) => v != null).map(Math.abs)) || 1
    const bw = box.w / ys.length
    const mid = box.y + box.h / 2
    g.fillStyle = C.line
    g.fillRect(box.x, mid, box.w, 1)
    ys.forEach((v, i) => {
      if (v == null) return
      const hgt = (v / max) * (box.h / 2)
      g.fillStyle = v >= 0 ? C.up : C.down
      g.fillRect(box.x + i * bw + 1, hgt >= 0 ? mid - hgt : mid, Math.max(1, bw - 2), Math.abs(hgt))
    })
    g.font = font(400, 18)
    g.fillStyle = C.meta
    g.fillText('Each year minus its 1981–2025 normal', box.x, box.y - 22)
    g.fillText(String(atlas.years[0]), box.x, box.y + box.h + 28)
    const end = String(atlas.years[1])
    g.fillText(end, box.x + box.w - g.measureText(end).width, box.y + box.h + 28)
  }

  g.fillStyle = C.line
  g.fillRect(56, 566, W - 112, 1)
  g.font = font(400, 16)
  g.fillStyle = C.meta
  g.fillText(`NASA POWER monthly data ${atlas.years.join('–')}, value at the centre of a 5° cell. Usual = Mann-Kendall p < 0.05;`, 56, 594)
  g.fillText(`honest = pre-whitened Mann-Kendall with a 10% false discovery rate across all ${atlas.n_cells.toLocaleString()} points.  ${link ?? ''}`.slice(0, 150), 56, 616)

  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `noise-trap_${atlas.id}_${cell.lat}_${cell.lon}.png` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
