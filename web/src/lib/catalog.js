// The variable catalog (web/public/data/catalog.json, built and checked by backend/scripts/build_catalog.py),
// suggestions by place type and theme (same rule as trendlab/sweep.py suggest), and place search.
import { useEffect, useState } from 'react'
import { api } from '../api'

export const PLACE_TYPES = ['coast', 'farm', 'city', 'forest', 'desert', 'mountain', 'snow']
export const THEMES = ['heat', 'water', 'air', 'wind', 'sunlight']

let cached = null
export function useCatalog() {
  const [cat, setCat] = useState(cached)
  useEffect(() => {
    if (cached) return
    api.catalog().then((c) => { cached = c.variables; setCat(cached) }).catch(() => setCat([]))
  }, [])
  return cat
}

// Variables tagged with both first, then the theme, then the place type; 3 to k of them.
export function suggest(cat, placeType, theme = 'any', k = 5) {
  const score = (v) => 2 * (theme === 'any' || v.themes.includes(theme)) + (v.places.includes(placeType) ? 1 : 0)
  const ranked = cat.filter((v) => score(v) > 0).map((v, i) => [v, i]).sort((a, b) => score(b[0]) - score(a[0]) || a[1] - b[1]).map(([v]) => v)
  const picked = ranked.filter((v) => score(v) >= 2).slice(0, k)
  for (const v of ranked) {
    if (picked.length >= 3) break
    if (!picked.includes(v)) picked.push(v)
  }
  return picked
}

// Place names to coordinates with the Open-Meteo geocoding service (free, no key). Needs internet.
export async function geocode(name) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`)
  const data = await res.json()
  return (data.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    short: r.name, lat: Number(r.latitude.toFixed(2)), lon: Number(r.longitude.toFixed(2)),
  }))
}
