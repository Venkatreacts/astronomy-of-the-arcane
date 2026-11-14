// Number formatting shared by every view, so the same value always reads the same way.

// 3 significant figures; scientific notation for very large or tiny magnitudes.
export function fmt(x, signed = false, digits = 3) {
  if (x == null || !Number.isFinite(x)) return '–'
  const a = Math.abs(x)
  const s = a !== 0 && (a >= 1e5 || a < 1e-5) ? x.toExponential(digits - 1) : x.toPrecision(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return signed && x > 0 ? `+${s}` : s
}

export const pct = (x, digits = 0) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`)

// p-values: never print 0. Below 0.001 reads "< 0.001"; a value just under 0.05 never rounds up to "0.050".
export function pval(p) {
  if (p == null || !Number.isFinite(p)) return '–'
  if (p < 0.001) return '< 0.001'
  let s = p < 0.01 ? p.toPrecision(2) : p.toFixed(3)
  for (let d = 3; p < 0.05 && Number(s) >= 0.05 && d < 8; d++) s = p.toPrecision(d)
  return s
}

// "p = 0.031" or "p < 0.001"
export const peq = (p) => { const s = pval(p); return s.startsWith('<') ? `p ${s}` : `p = ${s}` }

// Rates of change: 2 significant figures, sign always shown, a non-zero rate never rounds to "0".
export function rate(x) {
  if (x == null || !Number.isFinite(x)) return '–'
  const a = Math.abs(x)
  if (a === 0) return '0'
  if (a >= 1e5 || a < 1e-5) return fmt(x, true, 2)
  // keep the trailing zero of 2 significant figures ("+0.30"); 100 and up never goes to exponent form
  return `${x > 0 ? '+' : ''}${a >= 100 ? Number(x.toPrecision(2)) : x.toPrecision(2)}`
}

// Signed percentage at 2 significant figures ("+4.1%", "-12%").
const spct = (x) => `${x > 0 ? '+' : ''}${Number((x * 100).toPrecision(2))}%`

// Decades from the first to the last month of a record ("1981-01" to "2025-12" is 4.5).
export const decades = (first, last) =>
  ((Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5, 7)) - Number(first.slice(5, 7)) + 1) / 120

// 1981-2010 mean as the mean of the 12 calendar-month means, so a gap in one season cannot bias it.
// null when any calendar month has no data in that window.
export function baseMean(dates, values) {
  const sum = Array(12).fill(0)
  const n = Array(12).fill(0)
  dates.forEach((d, k) => {
    const y = Number(d.slice(0, 4))
    if (y < 1981 || y > 2010 || values[k] == null) return
    const m = Number(d.slice(5, 7)) - 1
    sum[m] += values[k]
    n[m] += 1
  })
  return n.every(Boolean) ? sum.reduce((s, x, m) => s + x / n[m], 0) / 12 : null
}

// A % of normal only means something on a scale with a true zero: rainfall, soil wetness, humidity, wind.
const RATIO_UNITS = new Set(['mm/day', '0-1', '%', 'm/s'])

// "+0.16 mm/day per decade, +0.73 mm/day since 1981, about +4.1% of the 1981-2010 mean"
export function howMuch(perDecade, units, first, last, mean) {
  if (perDecade == null || !Number.isFinite(perDecade)) return '–'
  const total = perDecade * decades(first, last)
  const out = [`${rate(perDecade)} ${units} per decade`, `${rate(total)} ${units} since ${first.slice(0, 4)}`]
  if (RATIO_UNITS.has(units) && mean > 0) out.push(`about ${spct(total / mean)} of the 1981–2010 mean`)
  return out.join(', ')
}

export const deg =(lat, lon) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`

// Great-circle distance in km (for "nearest sampled point is N km away").
export function km(a, b) {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Atlas sample points are cell centres every 5°: lat -57.5..77.5, lon -177.5..177.5.
export function nearestAtlasPoint(lat, lon) {
  const snap = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(v / 5) * 5 + 2.5))
  return { lat: snap(lat, -57.5, 77.5), lon: snap(((lon + 540) % 360) - 180, -177.5, 177.5) }
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
