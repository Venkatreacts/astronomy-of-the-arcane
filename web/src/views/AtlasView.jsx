import { useEffect, useMemo, useRef, useState } from 'react'
import Plot from '../components/Plot'
import { api } from '../api'

const USUAL = '#d55e00'
const HONEST = '#0072b2'
const FADE_MS = 700
// shortcut: size read once at load, not on resize; fine for a one-screen demo
const GLOBE_H = Math.round(Math.min(window.innerHeight - 56, 900, Math.max(360, window.innerWidth * 0.92)))
const K = GLOBE_H / 720 // squares shrink with the globe so the 5° grid never overlaps
const pct = (x) => `${Math.round(x * 100)}%`
const signed = (x) => `${x > 0 ? '+' : ''}${Number(x.toPrecision(2))}`

// Cells split by what each test says, so the switch can fade the ones the honest test rejects.
function groups(cells) {
  const g = { quiet: [], lost: [], kept: [], gained: [] }
  for (const c of cells) {
    const key = c.naive ? (c.honest ? 'kept' : 'lost') : (c.honest ? 'gained' : 'quiet')
    g[key].push(c)
  }
  return g
}

function trace(cells, atlas, marker, name) {
  const word = (c) => (c.rate > 0 ? atlas.rising : atlas.falling)
  return {
    type: 'scattergeo', mode: 'markers', name,
    lat: cells.map((c) => c.lat), lon: cells.map((c) => c.lon), customdata: cells,
    text: cells.map((c) => `${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°<br>${word(c)} ${signed(c.rate)} ${atlas.units}/decade<br>`
      + `usual test: ${c.naive ? 'trend' : 'no trend'} · honest test: ${c.honest ? 'trend' : 'not proven'}`),
    hovertemplate: '%{text}<extra></extra>',
    // a 5° cell narrows toward the poles; shrink its square to match so high latitudes don't merge into arcs
    marker: { symbol: 'square', line: { width: 0 }, ...marker,
      size: cells.map((c) => (marker.size ?? 9 * K) * Math.max(0.35, Math.cos((c.lat * Math.PI) / 180))) },
  }
}

export default function AtlasView({ onPick }) {
  const [index, setIndex] = useState([])
  const [varId, setVarId] = useState(null)
  const [atlas, setAtlas] = useState(null)
  // ?test=honest opens on the honest verdict, for shareable demo links
  const [honest, setHonest] = useState(() => new URLSearchParams(window.location.search).get('test') === 'honest')
  const [fade, setFade] = useState(honest ? 1 : 0) // 0 = usual verdict shown, 1 = honest verdict shown
  const [picked, setPicked] = useState(null)
  const [error, setError] = useState('')
  const frame = useRef(0)
  const fadeNow = useRef(fade)
  useEffect(() => { fadeNow.current = fade }, [fade])

  useEffect(() => {
    api.atlasIndex().then((idx) => {
      setIndex(idx)
      // open on the variable where the usual test is most wrong: the trap at its clearest
      const gap = (v) => v.naive_fraction - v.honest_fraction
      setVarId(idx.reduce((a, b) => (gap(b) > gap(a) ? b : a)).id)
    }).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    if (varId) api.atlas(varId).then(setAtlas).catch((e) => setError(e.message))
  }, [varId])

  // The signature moment: rejected cells fade out instead of snapping off.
  useEffect(() => {
    const target = honest ? 1 : 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    cancelAnimationFrame(frame.current)
    if (reduce) { setFade(target); return }
    const start = performance.now()
    const from = fadeNow.current
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS)
      const ease = 1 - Math.pow(1 - t, 4)
      setFade(from + (target - from) * ease)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [honest])

  const g = useMemo(() => (atlas ? groups(atlas.cells) : null), [atlas])

  const data = useMemo(() => {
    if (!g) return []
    return [
      trace(g.quiet, atlas, { color: '#1f2b36', size: 7 * K }, 'no trend'),
      trace(g.lost, atlas, { color: USUAL, opacity: 1 - 0.85 * fade }, 'usual test only'),
      trace(g.kept, atlas, { color: fade > 0.5 ? HONEST : USUAL }, 'both tests'),
      trace(g.gained, atlas, { color: HONEST, opacity: fade }, 'honest test only'),
      ...(picked ? [{ type: 'scattergeo', mode: 'markers', lat: [picked.lat], lon: [picked.lon], hoverinfo: 'skip',
        marker: { symbol: 'square-open', size: 16 * K, color: '#e9eef2', line: { width: 2 } } }] : []),
    ]
  }, [g, atlas, fade, picked])

  const survivors = atlas ? atlas.cells.filter((c) => c.honest) : []
  // soil moisture has no value over the ocean, so it covers fewer cells than the full grid
  const land = atlas && atlas.n_cells < Math.max(...index.map((v) => v.n_cells))
  const up = survivors.filter((c) => c.rate > 0).length

  return (
    <div className="atlas">
      <div className="globe" aria-label="Globe of trend test results, drag to rotate">
        {atlas && (
          <Plot
            data={data}
            layout={{
              height: GLOBE_H,
              margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, dragmode: 'pan',
              paper_bgcolor: 'rgba(0,0,0,0)', hoverlabel: { bgcolor: '#0b1016', bordercolor: '#33414f',
                font: { family: 'Barlow, sans-serif', color: '#e9eef2', size: 14 } },
              geo: {
                projection: { type: 'orthographic', rotation: { lon: 40, lat: 12 } },
                bgcolor: 'rgba(0,0,0,0)', showocean: true, oceancolor: '#070b10', showland: true, landcolor: '#0f161e',
                showcoastlines: true, coastlinecolor: '#2b3947', coastlinewidth: 0.6, showcountries: false,
                showframe: false, lonaxis: { showgrid: true, gridcolor: '#121a23', dtick: 30 },
                lataxis: { showgrid: true, gridcolor: '#121a23', dtick: 30 },
              },
            }}
            config={{ displayModeBar: false, responsive: true, scrollZoom: false }}
            style={{ width: '100%' }}
            useResizeHandler
            onClick={(e) => {
              const c = e?.points?.[0]?.customdata
              if (!c) return
              setPicked(c)
            }}
          />
        )}
      </div>

      <div className="caption">
        <h1>Is this trend real?</h1>
        {atlas ? (
          <p className="claim">
            By the usual test, <strong className="u">{pct(atlas.naive_fraction)}</strong> of the
            {' '}{atlas.n_cells.toLocaleString()} {land ? 'land ' : ''}squares on our {atlas.step_deg}° grid show a
            trend in {atlas.name.toLowerCase()} since {atlas.years[0]}. Take away the month-to-month
            stickiness and correct for testing them all at once:
            {' '}<strong className="h">{pct(atlas.honest_fraction)}</strong> survive.
          </p>
        ) : <p className="claim">{error || 'Loading the world…'}</p>}

        <div className="switch" role="group" aria-label="Which test to show">
          <button className={honest ? '' : 'on u'} aria-pressed={!honest} onClick={() => setHonest(false)}>Usual test</button>
          <button className={honest ? 'on h' : ''} aria-pressed={honest} onClick={() => setHonest(true)}>Honest test</button>
        </div>

        <div className="vars" role="group" aria-label="Variable">
          {index.map((v) => (
            <button key={v.id} className={v.id === varId ? 'on' : ''} aria-pressed={v.id === varId}
              onClick={() => { setVarId(v.id); setPicked(null) }}>{v.name}</button>
          ))}
        </div>

        {atlas && honest && survivors.length > 0 && (
          <p className="note">Of the places that survive: {up} {atlas.rising}, {survivors.length - up} {atlas.falling}.</p>
        )}
        {picked && (
          <p className="note pinned">
            <span className="leader" aria-hidden="true" />
            {picked.lat.toFixed(1)}°, {picked.lon.toFixed(1)}°: {picked.rate > 0 ? atlas.rising : atlas.falling}
            {' '}{signed(picked.rate)} {atlas.units} per decade. Usual test: {picked.naive ? 'trend' : 'no trend'}.
            Honest test: {picked.honest ? 'trend is real' : 'not proven'}
            {!picked.honest && picked.more_years > 0 && `, about ${Math.ceil(picked.more_years)} more years of data needed`}.
            {' '}<button className="link" onClick={() => onPick?.({ lat: picked.lat, lon: picked.lon, param: atlas.id })}>
              Open the full record
            </button>
          </p>
        )}
        <p className="credit">
          Drag to turn the globe · click a square to read it · NASA POWER monthly data, {atlas?.years.join('–')},
          {' '}5° grid · honest test: pre-whitened Mann-Kendall, false discovery rate 10%
        </p>
      </div>
    </div>
  )
}
