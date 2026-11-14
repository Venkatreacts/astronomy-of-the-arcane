// Number formatting shared by every view, so the same value always reads the same way.

// 3 significant figures; scientific notation for very large or tiny magnitudes.
export function fmt(x, signed = false, digits = 3) {
  if (x == null || !Number.isFinite(x)) return '–'
  const a = Math.abs(x)
  const s = a !== 0 && (a >= 1e5 || a < 1e-5) ? x.toExponential(digits - 1) : x.toPrecision(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return signed && x > 0 ? `+${s}` : s
}

export const pct = (x, digits = 0) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`)

// p-values: never print 0; very small values become "< 0.0001".
export function pval(p) {
  if (p == null || !Number.isFinite(p)) return '–'
  if (p < 1e-4) return '< 0.0001'
  return p < 0.01 ? p.toFixed(4) : p.toFixed(3)
}

// "p = 0.031" or "p < 0.0001"
export const peq = (p) => { const s = pval(p); return s.startsWith('<') ? `p ${s}` : `p = ${s}` }

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
