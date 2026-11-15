// The chosen time frame and season, kept in the URL (?from=1990&to=2025&season=JJA) so a link reopens it.
import { useState } from 'react'

export const FIRST = 1981
export const LAST = 2025
export const SHORT = 15
export const SEASONS = [
  { id: 'all', name: 'All months' }, { id: 'DJF', name: 'Dec–Feb' }, { id: 'MAM', name: 'Mar–May' },
  { id: 'JJA', name: 'Jun–Aug' }, { id: 'SON', name: 'Sep–Nov' },
]
export const seasonName = (id) => SEASONS.find((s) => s.id === id)?.name ?? 'All months'
export const isDefault = (f) => f.start === FIRST && f.end === LAST && f.season === 'all'
export const frameLabel = (f) => `${f.start}–${f.end}${f.season === 'all' ? '' : `, ${seasonName(f.season)} only`}`

function fromUrl() {
  const q = new URLSearchParams(window.location.search)
  const year = (k, d) => { const y = Number(q.get(k)); return Number.isInteger(y) && y >= FIRST && y <= LAST ? y : d }
  const season = SEASONS.some((s) => s.id === q.get('season')) ? q.get('season') : 'all'
  let start = year('from', FIRST)
  let end = year('to', LAST)
  if (end < start) [start, end] = [end, start]
  return { start, end, season }
}

export function useFrame() {
  const [frame, setFrame] = useState(fromUrl)
  function update(next) {
    const f = { ...frame, ...next }
    setFrame(f)
    const q = new URLSearchParams(window.location.search)
    if (f.start === FIRST) q.delete('from'); else q.set('from', f.start)
    if (f.end === LAST) q.delete('to'); else q.set('to', f.end)
    if (f.season === 'all') q.delete('season'); else q.set('season', f.season)
    const s = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}${window.location.hash}`)
  }
  return [frame, update]
}
