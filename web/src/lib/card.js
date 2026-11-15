// A shareable verdict card (1200 x 630 PNG) for one atlas sample point: the three tests, the rate with its
// range, and the yearly record. Drawn on a canvas from the same published files the page uses.
import { deg, fmt, howMuch, pval, rate } from './format'
import { RULE, STAGE } from './stages'

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

// Greedy word wrap to a pixel width with the current canvas font.
function wrap(g, text, width) {
  const lines = ['']
  for (const w of text.split(' ')) {
    const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w
    if (g.measureText(next).width > width && lines[lines.length - 1]) lines.push(w)
    else lines[lines.length - 1] = next
  }
  return lines
}

async function save(cv, name) {
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The card for one place or one region average over the chosen time frame and season (an /api/explore result).
export async function seriesCard({ title, file, res, units, label, link }) {
  await document.fonts?.ready
  const W = 1200
  const H = 630
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const g = cv.getContext('2d')
  const font = (w, px, fam = 'Barlow') => `${w} ${px}px "${fam}", system-ui, sans-serif`
  const st = res.stages
  const real = st.honest.significant
  g.fillStyle = C.ground
  g.fillRect(0, 0, W, H)
  g.fillStyle = real ? '#0072b2' : '#2b3947'
  g.fillRect(0, 0, 10, H)
  g.fillStyle = C.meta
  g.font = font(600, 18, 'Barlow Semi Condensed')
  g.fillText(`NOISE TRAP  ·  ${label.toUpperCase()}`, 56, 64)
  g.fillStyle = C.ink
  g.font = font(700, 40, 'Barlow Semi Condensed')
  wrap(g, title, W - 112).slice(0, 2).forEach((line, i) => g.fillText(line, 56, 116 + i * 44))
  g.font = font(700, 72, 'Barlow Semi Condensed')
  g.fillStyle = real ? C.honest : C.ink2
  g.fillText(real ? 'The trend is real' : 'Not proven', 56, 236)
  const ols = res.ols
  const rows = [
    [STAGE.usual, st.naive.significant ? 'trend' : 'no trend', `p ${pval(st.naive.p)}`, C.usual],
    [STAGE.pw, (st.pw ?? st.honest).significant ? 'trend' : 'no trend', `p ${pval((st.pw ?? st.honest).p)}`, C.ink2],
    [STAGE.honest, real ? 'trend is real' : 'not proven', res.rule === 'season' ? 'four-season rule' : 'single-place rule', C.honest],
    ...(ols ? [['Classroom t-test', ols.significant ? 'trend' : 'no trend', `p ${pval(ols.p)}`, C.meta]] : []),
  ]
  rows.forEach(([name, verdict, p, color], i) => {
    const y = 300 + i * 44
    g.fillStyle = C.line
    g.fillRect(56, y + 14, 700, 1)
    g.font = font(400, 22)
    g.fillStyle = C.meta
    g.fillText(name, 56, y)
    g.font = font(600, 24)
    g.fillStyle = color
    g.fillText(verdict, 330, y)
    g.font = font(400, 20)
    g.fillStyle = C.meta
    g.fillText(p, 530, y)
  })
  g.font = font(400, 22)
  g.fillStyle = C.ink
  const ci = st.honest.slope_ci_per_year
  g.fillText(`${rate(st.honest.slope_per_year * 10)} ${units} per decade${ci ? ` (95% range ${rate(ci[0] * 10)} to ${rate(ci[1] * 10)})` : ''}, Sen's slope`, 56, 494)
  const pr = res.provable
  if (pr) {
    g.fillStyle = C.ink2
    g.fillText(pr.first_year ? `Provable from ${pr.first_year} (record starting ${res.frame.start}).`
      : `Not provable yet${pr.years_more_needed > 0 ? `, about ${Math.ceil(pr.years_more_needed)} more years` : ''}.`, 56, 526)
  }
  g.fillStyle = C.line
  g.fillRect(56, 546, W - 112, 1)
  g.font = font(400, 16)
  g.fillStyle = C.meta
  wrap(g, res.rule === 'season' ? RULE.season : RULE.place, W - 112).slice(0, 2).forEach((line, i) => g.fillText(line, 56, 572 + i * 20))
  g.fillText(`NASA POWER monthly data, ${label}.  ${link ?? ''}`.slice(0, 150), 56, 616)
  await save(cv, `noise-trap_${file}_${res.frame.start}-${res.frame.end}_${res.season}.png`)
}

export async function verdictCard({ atlas, cell, record, mean = null, link }) {
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
    [STAGE.usual, cell.naive ? 'trend' : 'no trend', `p ${pval(cell.p_naive)}`, C.usual],
    [STAGE.pw, cell.pw ? 'trend' : 'no trend', `p ${pval(cell.p_honest)}`, C.ink2],
    [STAGE.honest, cell.honest ? 'trend is real' : 'not proven', `needs p ≤ ${pval(atlas.fdr_threshold)}`, C.honest],
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
  g.fillText(`${word} ${howMuch(cell.rate, atlas.units, `${atlas.years[0]}-01`, `${atlas.years[1]}-12`, mean)}`, 56, 462)
  g.font = font(400, 20)
  g.fillStyle = C.meta
  g.fillText(`95% range ${rate(cell.rate_lo)} to ${rate(cell.rate_hi)} per decade · stickiness φ ${fmt(cell.phi, false, 2)}`, 56, 492)
  if (!cell.honest && cell.more_years > 0) {
    g.fillStyle = C.ink2
    g.fillText(`At this rate and stickiness, about ${Math.ceil(cell.more_years)} more years of data are needed.`, 56, 520)
  }

  const ys = record ? yearly(record) : []
  const box = { x: 680, y: 262, w: 464, h: 128 }
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
  g.fillRect(56, 536, W - 112, 1)
  g.font = font(400, 16)
  g.fillStyle = C.meta
  wrap(g, `${RULE.map} Here: ${atlas.n_cells.toLocaleString()} points.`, W - 112).slice(0, 2)
    .forEach((line, i) => g.fillText(line, 56, 560 + i * 22))
  g.fillText(`NASA POWER monthly data ${atlas.years.join('–')}, value at the centre of a 5° cell.  ${link ?? ''}`.slice(0, 150), 56, 610)

  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `noise-trap_${atlas.id}_${cell.lat}_${cell.lon}.png` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
