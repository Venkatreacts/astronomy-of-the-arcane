import { useEffect, useMemo, useRef, useState } from 'react'
import Plot from '../components/Plot'
import FingerprintTable from '../components/Fingerprint'
import { api } from '../api'
import { deg, fmt, pct, pval } from '../lib/format'

const USUAL = '#d55e00'
const HONEST = '#0072b2'
const FADE_MS = 700
// shortcut: size read once at load, not on resize; fine for a one-screen demo
const GLOBE_H = Math.round(Math.min(window.innerHeight - 56, 900, Math.max(360, window.innerWidth * 0.92)))
const K = GLOBE_H / 720 // squares shrink with the globe so the 5° grid never overlaps

// The three stages of the same question, each at p < 0.05 per test.
const STAGES = [
  { id: 'naive', label: 'Usual test', flag: 'naive', frac: 'naive_fraction', color: USUAL },
  { id: 'pw', label: 'Remove stickiness', flag: 'pw', frac: 'pw_fraction', color: '#56b4e9' },
  { id: 'fdr', label: 'Honest test', flag: 'honest', frac: 'honest_fraction', color: HONEST },
]
const LAYERS = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'rate', label: 'Trend size' },
  { id: 'phi', label: 'Stickiness' },
  { id: 'coverage', label: 'Data coverage' },
]
const DIVERGING = [[0, '#cc79a7'], [0.5, '#2a3540'], [1, '#009e73']]
const STICKY = [[0, '#1f2b36'], [1, '#f0e442']]
const COVER = [[0, '#f0e442'], [1, '#2a3540']]

function readHistory() {
  try { return JSON.parse(localStorage.getItem('nt-history') || '[]').slice(0, 6) } catch { return [] }
}
function saveHistory(h) {
  try { localStorage.setItem('nt-history', JSON.stringify(h)) } catch { /* private mode: history lasts this visit */ }
}

const sizes = (cells, base) => cells.map((c) => base * Math.max(0.35, Math.cos((c.lat * Math.PI) / 180)))

function hover(atlas) {
  const word = (c) => (c.rate > 0 ? atlas.rising : atlas.falling)
  return (c) => `${deg(c.lat, c.lon)} · sampled point<br>${word(c)} ${fmt(c.rate, true)} ${atlas.units}/decade `
    + `(95% ${fmt(c.rate_lo, true)} to ${fmt(c.rate_hi, true)})<br>`
    + `usual p ${pval(c.p_naive)} · without stickiness p ${pval(c.p_honest)} · φ ${fmt(c.phi, false, 2)}<br>`
    + `usual: ${c.naive ? 'trend' : 'no'} · stickiness removed: ${c.pw ? 'trend' : 'no'} · honest (FDR): ${c.honest ? 'trend' : 'not proven'}`
}

function trace(cells, atlas, marker, extra = {}) {
  const text = hover(atlas)
  return {
    type: 'scattergeo', mode: 'markers', lat: cells.map((c) => c.lat), lon: cells.map((c) => c.lon),
    customdata: cells, text: cells.map(text), hovertemplate: '%{text}<extra></extra>',
    marker: { symbol: 'square', line: { width: 0 }, ...marker, size: sizes(cells, marker.size ?? 9 * K) },
    ...extra,
  }
}

function Legend({ layer, stage, atlas, rateMax }) {
  if (layer === 'verdict') {
    const s = STAGES.find((x) => x.id === stage)
    return (
      <ul className="legend-row" aria-label="Legend">
        <li><span className="swatch" style={{ background: s.color }} />{s.label}: trend at p &lt; 0.05{stage === 'fdr' ? ', after false-discovery control (10%)' : ''}</li>
        <li><span className="swatch" style={{ background: '#1f2b36' }} />no trend shown by this test</li>
      </ul>
    )
  }
  const spec = {
    rate: { bg: 'linear-gradient(90deg,#cc79a7,#2a3540,#009e73)', lo: `${fmt(-rateMax, true)}`, hi: `${fmt(rateMax, true)} ${atlas.units}/decade`, note: `Faint squares: no trend by the ${STAGES.find((x) => x.id === stage).label.toLowerCase()}.` },
    phi: { bg: 'linear-gradient(90deg,#1f2b36,#f0e442)', lo: 'φ 0', hi: 'φ 1', note: 'How much each month resembles the last (lag-1 autocorrelation of the detrended anomalies).' },
    coverage: { bg: 'linear-gradient(90deg,#f0e442,#2a3540)', lo: '80% of months', hi: '100%', note: 'Share of months with data. Points under 80% are not tested.' },
  }[layer]
  return (
    <div className="ramp" aria-label="Legend">
      <span className="ramp-bar" style={{ background: spec.bg }} />
      <span className="ramp-ends"><span>{spec.lo}</span><span>{spec.hi}</span></span>
      <span className="ramp-note">{spec.note}</span>
    </div>
  )
}

function Fingerprint({ point, current }) {
  const [cell, setCell] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    setCell(null)
    setErr('')
    api.cell(point.lat, point.lon).then((c) => live && setCell(c)).catch((e) => live && setErr(e.message))
    return () => { live = false }
  }, [point.lat, point.lon])
  if (err) return <p className="small">{err}</p>
  if (!cell) return <p className="small">Loading the other variables at this point…</p>
  return <FingerprintTable cell={cell} current={current} />
}

export default function AtlasView({ onPick }) {
  const [index, setIndex] = useState([])
  const [varId, setVarId] = useState(null)
  const [atlas, setAtlas] = useState(null)
  // ?test=honest opens on the honest verdict, for shareable demo links
  const [stage, setStage] = useState(() => (new URLSearchParams(window.location.search).get('test') === 'honest' ? 'fdr' : 'naive'))
  const [from, setFrom] = useState(stage)
  const [fade, setFade] = useState(1) // 0 = `from` stage shown, 1 = `stage` shown
  const [layer, setLayer] = useState('verdict')
  const [picked, setPicked] = useState(null)
  const [history, setHistory] = useState(readHistory)
  const [coord, setCoord] = useState({ lat: '', lon: '' })
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const frame = useRef(0)

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
  // keep the picked point in sync with the variable shown (soil wetness has no ocean points)
  useEffect(() => {
    if (!atlas || !picked) return
    const same = atlas.cells.find((c) => c.lat === picked.lat && c.lon === picked.lon)
    setPicked(same || null)
    if (!same) setNote(`${atlas.name} has no value at ${deg(picked.lat, picked.lon)} (ocean or ice).`)
  }, [atlas]) // eslint-disable-line react-hooks/exhaustive-deps

  function go(next) {
    if (next === stage) return
    setFrom(stage)
    setStage(next)
    setFade(0)
    cancelAnimationFrame(frame.current)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setFade(1); return }
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / FADE_MS)
      setFade(1 - Math.pow(1 - t, 4))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  function pick(c) {
    setPicked(c)
    setNote('')
    const h = [{ lat: c.lat, lon: c.lon, id: atlas.id }, ...history.filter((p) => p.lat !== c.lat || p.lon !== c.lon)].slice(0, 6)
    setHistory(h)
    saveHistory(h)
  }

  function pickCoords(e) {
    e.preventDefault()
    const lat = Number(coord.lat)
    const lon = Number(coord.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setNote('Enter a latitude between -90 and 90 and a longitude between -180 and 180.')
      return
    }
    const best = atlas.cells.reduce((a, c) => {
      const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2
      return d < a.d ? { c, d } : a
    }, { c: null, d: Infinity })
    if (best.c) pick(best.c)
  }

  const rateMax = useMemo(() => {
    if (!atlas) return 1
    const r = atlas.cells.map((c) => Math.abs(c.rate)).sort((a, b) => a - b)
    return r[Math.floor(r.length * 0.95)] || 1
  }, [atlas])

  const data = useMemo(() => {
    if (!atlas) return []
    const now = STAGES.find((s) => s.id === stage)
    const before = STAGES.find((s) => s.id === from)
    const cells = atlas.cells
    let traces
    if (layer === 'verdict') {
      const g = { quiet: [], gone: [], both: [], come: [] }
      for (const c of cells) {
        const a = c[before.flag]
        const b = c[now.flag]
        g[a ? (b ? 'both' : 'gone') : (b ? 'come' : 'quiet')].push(c)
      }
      traces = [
        trace(g.quiet, atlas, { color: '#1f2b36', size: 7 * K }),
        trace(g.gone, atlas, { color: before.color, opacity: 1 - 0.85 * fade }),
        trace(g.both, atlas, { color: fade > 0.5 ? now.color : before.color }),
        trace(g.come, atlas, { color: now.color, opacity: fade }),
      ]
    } else if (layer === 'rate') {
      traces = [trace(cells, atlas, { color: cells.map((c) => c.rate), colorscale: DIVERGING, cmin: -rateMax, cmax: rateMax,
        opacity: cells.map((c) => (c[now.flag] ? 1 : 0.3)) })]
    } else if (layer === 'phi') {
      traces = [trace(cells, atlas, { color: cells.map((c) => c.phi), colorscale: STICKY, cmin: 0, cmax: 1 })]
    } else {
      traces = [trace(cells, atlas, { color: cells.map((c) => c.coverage ?? 1), colorscale: COVER, cmin: 0.8, cmax: 1 })]
    }
    if (picked) {
      traces.push({ type: 'scattergeo', mode: 'markers', lat: [picked.lat], lon: [picked.lon], hoverinfo: 'skip',
        marker: { symbol: 'square-open', size: 16 * K, color: '#e9eef2', line: { width: 2 } } })
    }
    return traces
  }, [atlas, stage, from, fade, layer, picked, rateMax])

  const now = STAGES.find((s) => s.id === stage)
  const flagged = atlas ? atlas.cells.filter((c) => c[now.flag]) : []
  const up = flagged.filter((c) => c.rate > 0).length
  const land = atlas && atlas.n_cells < Math.max(...index.map((v) => v.n_cells))
  const full = atlas && atlas.cells.every((c) => (c.coverage ?? 1) === 1)

  return (
    <div className="atlas">
      <div className="globe" aria-label="Globe of trend test results at sampled points; drag to rotate, click a square to read it">
        {atlas ? (
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
            onClick={(e) => { const c = e?.points?.[0]?.customdata; if (c?.lat != null) pick(c) }}
          />
        ) : <div className="globe-wait" style={{ height: GLOBE_H }}>{error ? '' : 'Loading the world…'}</div>}
      </div>

      <div className="caption">
        <h1>Is this trend real?</h1>
        {atlas ? (
          <p className="claim">
            We sampled {atlas.name.toLowerCase()} at {atlas.n_cells.toLocaleString()} {land ? 'land ' : ''}points, one
            every {atlas.step_deg}°. By the usual test, <strong className="u">{pct(atlas.naive_fraction)}</strong> of
            them have changed since {atlas.years[0]}. Remove month-to-month stickiness and correct for testing them
            all at once: <strong className="h">{pct(atlas.honest_fraction)}</strong> hold up.
          </p>
        ) : <p className="claim">{error || 'Loading the world…'}</p>}

        <div className="switch three" role="group" aria-label="Which test to show">
          {STAGES.map((s) => (
            <button key={s.id} className={stage === s.id ? `on ${s.id}` : ''} aria-pressed={stage === s.id} onClick={() => go(s.id)}>
              <span>{s.label}</span>
              {atlas && <span className="n">{pct(atlas[s.frac] ?? (s.id === 'pw' ? null : 0))}</span>}
            </button>
          ))}
        </div>

        <div className="vars" role="group" aria-label="Variable">
          {index.map((v) => (
            <button key={v.id} className={v.id === varId ? 'on' : ''} aria-pressed={v.id === varId}
              onClick={() => setVarId(v.id)}>{v.name}</button>
          ))}
        </div>
        <div className="layers" role="group" aria-label="What the colours show">
          {LAYERS.map((l) => (
            <button key={l.id} className={l.id === layer ? 'on' : ''} aria-pressed={l.id === layer} onClick={() => setLayer(l.id)}>{l.label}</button>
          ))}
        </div>
        {atlas && <Legend layer={layer} stage={stage} atlas={atlas} rateMax={rateMax} />}
        {atlas && layer === 'coverage' && full && (
          <p className="note">Every one of the {atlas.n_cells.toLocaleString()} points has all {(atlas.years[1] - atlas.years[0] + 1) * 12} months: no gaps to fill.</p>
        )}
        {atlas && layer === 'verdict' && flagged.length > 0 && (
          <p className="note">Of the {flagged.length.toLocaleString()} points this test flags: {up} {atlas.rising}, {flagged.length - up} {atlas.falling}.</p>
        )}

        {picked && atlas && (
          <div className="pinned" aria-live="polite">
            <span className="leader" aria-hidden="true" />
            <p className="note">
              <strong>{deg(picked.lat, picked.lon)}</strong>, grid point (value at this spot, not a 5° average).{' '}
              {picked.rate > 0 ? atlas.rising : atlas.falling} {fmt(picked.rate, true)} {atlas.units} per decade, 95% range{' '}
              {fmt(picked.rate_lo, true)} to {fmt(picked.rate_hi, true)}. Stickiness φ = {fmt(picked.phi, false, 2)}.
            </p>
            <dl className="stages">
              <div className="u"><dt>Usual</dt><dd>{picked.naive ? 'trend' : 'no trend'}<span>p {pval(picked.p_naive)}</span></dd></div>
              <div><dt>No stickiness</dt><dd>{picked.pw ? 'trend' : 'no trend'}<span>p {pval(picked.p_honest)}</span></dd></div>
              <div className="h"><dt>Honest</dt><dd>{picked.honest ? 'trend is real' : 'not proven'}<span>FDR p* {pval(atlas.fdr_threshold)}</span></dd></div>
            </dl>
            {!picked.honest && picked.more_years > 0 && (
              <p className="small">At this rate and stickiness, about {Math.ceil(picked.more_years)} more years of data would be needed.</p>
            )}
            <Fingerprint point={picked} current={atlas.id} />
            <button className="link" onClick={() => onPick?.({ lat: picked.lat, lon: picked.lon, param: atlas.id })}>
              Open the full record for {atlas.name.toLowerCase()} here
            </button>
          </div>
        )}
        {note && <p className="note" role="status">{note}</p>}

        {atlas && (
          <form className="coords" onSubmit={pickCoords}>
            <label>Lat<input inputMode="decimal" value={coord.lat} onChange={(e) => setCoord({ ...coord, lat: e.target.value })} placeholder="13.1" /></label>
            <label>Lon<input inputMode="decimal" value={coord.lon} onChange={(e) => setCoord({ ...coord, lon: e.target.value })} placeholder="80.3" /></label>
            <button type="submit">Nearest point</button>
          </form>
        )}
        {history.length > 0 && atlas && (
          <div className="history" role="group" aria-label="Points you looked at">
            <span>Looked at</span>
            {history.map((h) => {
              const c = atlas.cells.find((x) => x.lat === h.lat && x.lon === h.lon)
              return c && <button key={`${h.lat},${h.lon}`} className="chip" onClick={() => pick(c)}>{deg(h.lat, h.lon)}</button>
            })}
          </div>
        )}
        <p className="credit">
          Drag to turn the globe · click a square to read it · NASA POWER monthly data, {atlas?.years.join('–')}, one
          sample point per 5° · usual = Mann-Kendall p &lt; 0.05 · honest = pre-whitened Mann-Kendall, false
          discovery rate 10% across all points
        </p>
      </div>
    </div>
  )
}
