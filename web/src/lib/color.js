// Colour helpers for canvas drawing: scales as [[stop, '#rrggbb'], ...] like Plotly's.
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

export function scale(stops) {
  const s = stops.map(([t, c]) => [t, rgb(c)])
  return (t) => {
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5))
    let i = 1
    while (i < s.length - 1 && x > s[i][0]) i++
    const [t0, a] = s[i - 1]
    const [t1, b] = s[i]
    const f = t1 > t0 ? (x - t0) / (t1 - t0) : 0
    return a.map((v, k) => v + (b[k] - v) * f)
  }
}
