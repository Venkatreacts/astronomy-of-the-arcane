import { useEffect, useMemo, useRef, useState } from 'react'
import Globe from '../components/Globe'
import FingerprintTable from '../components/Fingerprint'
import { api } from '../api'
import { baseMean, deg, fmt, howMuch, pct, pval, rate } from '../lib/format'
import { fromCell } from '../lib/record'
import { RULE, STAGE } from '../lib/stages'
import { rgb, scale } from '../lib/color'
import { verdictCard } from '../lib/card'

const USUAL = '#d55e00'
const HONEST = '#0072b2'
// shortcut: height read once at load, not on resize; the width follows the container
const GLOBE_H = Math.round(Math.min(window.innerHeight - 56, 900, Math.max(360, window.innerWidth * 0.92)))
const YEAR_MS = 450

// The three stages of the same question; the globe is a map, so the honest verdict uses the map rule.
const STAGES = [
  { id: 'naive', label: STAGE.usual, flag: 'naive', frac: 'naive_fraction', color: USUAL },
  { id: 'pw', label: STAGE.pw, flag: 'pw', frac: 'pw_fraction', color: '#56b4e9' },
  { id: 'fdr', label: STAGE.honest, flag: 'honest', frac: 'honest_fraction', color: HONEST },
]
const LAYERS = [
  { id: 'rate', label: 'Trend size' },
  { id: 'verdict', label: 'Verdict' },
  { id: 'phi', label: 'Stickiness' },
  { id: 'coverage', label: 'Data coverage' },
  { id: 'years', label: 'Play the years' },
]
const TEST_PARAM = { naive: 'usual', pw: 'pw', fdr: 'honest' }
// Trend colours per variable, falling end first: ColorBrewer RdBu, PRGn and BrBG, all colour-blind safe.
const PALETTE = {
  T2M: ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'],
  WS2M: ['#762a83', '#af8dc3', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#7fbf7b', '#1b7837'],
  wet: ['#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e'], // rain, soil, humidity
}
const palette = (id) => {
  const p = PALETTE[id] ?? PALETTE.wet
  return { ramp: scale(p.map((c, i) => [i / (p.length - 1), c])), css: `linear-gradient(90deg,${p.join(',')})`, down: p[1], up: p[5] }
}
const FAINT = 0.22 // a point that fails the selected test is drawn at this strength
const UNIT = { degC: '°C' }
const STICKY = [[0, '#1f2b36'], [1, '#f0e442']]
const COVER = [[0, '#f0e442'], [1, '#2a3540']]
const QUIET = rgb('#1f2b36')
const stickyRamp = scale(STICKY)
const coverRamp = scale(COVER)
const sweepRGB = (hex) => rgb(hex).join(',')
const query = new URLSearchParams(window.location.search)

function readHistory() {
  try { return JSON.parse(localStorage.getItem('nt-history') || '[]').slice(0, 6) } catch { return [] }
}
function saveHistory(h) {
  try { localStorage.setItem('nt-history', JSON.stringify(h)) } catch { /* private mode: history lasts this visit */ }
}

function describe(atlas) {
  const word = (c) => (c.rate > 0 ? atlas.rising : atlas.falling)
  const [first, last] = [`${atlas.years[0]}-01`, `${atlas.years[1]}-12`]
  return (c) => [
    `${deg(c.lat, c.lon)} · sample point`,
    `${word(c)} ${howMuch(c.rate, atlas.units, first, last, null)}`,
    `95% range ${rate(c.rate_lo)} to ${rate(c.rate_hi)} per decade · φ ${fmt(c.phi, false, 2)}`,
    `${STAGE.usual}: ${c.naive ? 'trend' : 'no trend'} (p ${pval(c.p_naive)})`,
    `${STAGE.pw}: ${c.pw ? 'trend' : 'no trend'} (p ${pval(c.p_honest)})`,
    `${STAGE.honest}, map rule: ${c.honest ? 'trend is real' : 'not proven'}`,
  ]
}

function nearest(cells, lat, lon) {
  return cells.reduce((a, c) => {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2
    return d < a.d ? { c, d } : a
  }, { c: null, d: Infinity }).c
}

// area-weighted mean over the sampled points, per year (cos-latitude weights; not a global average)
function yearlyMean(years) {
  const n = years.years[1] - years.years[0] + 1
  return Array.from({ length: n }, (_, y) => {
    let s = 0
    let w = 0
    for (const [lat, , ys] of years.cells) {
      if (ys[y] == null) continue
      const k = Math.cos((lat * Math.PI) / 180)
      s += k * ys[y]
      w += k
    }
    return w ? s / w : null
  })
}

function Spark({ values, at, first }) {
  const ok = values.filter((v) => v != null)
  const max = Math.max(...ok.map(Math.abs)) || 1
  const W = 280
  const H = 56
  const x = (i) => (i / (values.length - 1)) * W
  const y = (v) => H / 2 - (v / max) * (H / 2 - 3)
  const d = values.map((v, i) => (v == null ? '' : `${i && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('')
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="zero" />
      <path d={d} />
      <line x1={x(at - first)} x2={x(at - first)} y1="0" y2={H} className="cursor" />
    </svg>
  )
}

// Significance is a strength, not a colour: full where the selected test finds a trend, faint where it does not.
function Strength({ stage, pal, falseAlarms }) {
  const s = STAGES.find((x) => x.id === stage)
  const [yes, no] = stage === 'fdr' ? ['trend is real', 'not proven'] : ['trend at p < 0.05', 'no trend by this test']
  return (
    <ul className="legend-row" aria-label="What full and faint colour mean">
      <li><span className="swatch" style={{ background: pal.up }} />Full colour: {s.label.toLowerCase()} says {yes}</li>
      <li><span className="swatch" style={{ background: pal.up, opacity: FAINT }} />Faint: {no}</li>
      {stage === 'fdr' && (
        <li><span className="ring-key" />False alarms ({falseAlarms.toLocaleString()}): the usual test flagged them, the honest verdict rejects them</li>
      )}
      {stage === 'fdr' && <li className="rule">{RULE.map}</li>}
    </ul>
  )
}

function Legend({ layer, stage, atlas, rateMax, pal, falseAlarms }) {
  if (layer === 'verdict') {
    return (
      <>
        <ul className="legend-row" aria-label="Legend">
          <li><span className="swatch" style={{ background: pal.up }} />{atlas.rising}</li>
          <li><span className="swatch" style={{ background: pal.down }} />{atlas.falling}</li>
        </ul>
        <Strength stage={stage} pal={pal} falseAlarms={falseAlarms} />
      </>
    )
  }
  if (layer === 'rate') {
    const unit = UNIT[atlas.units] ?? atlas.units
    return (
      <div className="ramp" aria-label="Legend">
        <span className="ramp-title">Trend, {unit} per decade</span>
        <span className="ramp-bar" style={{ background: pal.css }} />
        <span className="ramp-ticks">
          {[-1, -0.5, 0, 0.5, 1].map((f) => <span key={f}>{f === -1 ? '≤ ' : f === 1 ? '≥ ' : ''}{f ? rate(f * rateMax) : '0'}</span>)}
        </span>
        <span className="ramp-ends"><span>{atlas.falling}</span><span>{atlas.rising}</span></span>
        <span className="ramp-note">Symmetric around zero; the ends are the 95th percentile of the trend size.</span>
        <Strength stage={stage} pal={pal} falseAlarms={falseAlarms} />
      </div>
    )
  }
  const spec = {
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

export default function AtlasView({ onPick }) {
  const [index, setIndex] = useState([])
  const [varId, setVarId] = useState(null)
  const [atlas, setAtlas] = useState(null)
  // links carry ?var=&test=&layer=&lat=&lon=, so any view of the globe can be shared
  const [stage, setStage] = useState(() => ({ honest: 'fdr', pw: 'pw' })[query.get('test')] ?? 'naive')
  const [layer, setLayer] = useState(() => (LAYERS.some((l) => l.id === query.get('layer')) ? query.get('layer') : 'rate'))
  const [flat, setFlat] = useState(false)
  const [squares, setSquares] = useState(false)
  const [slow, setSlow] = useState(false)
  const [picked, setPicked] = useState(null)
  const [focus, setFocus] = useState(null)
  const [history, setHistory] = useState(readHistory)
  const [coord, setCoord] = useState({ lat: '', lon: '' })
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [years, setYears] = useState(null)
  const [year, setYear] = useState(null)
  const [playing, setPlaying] = useState(false)
  // the picked point's full monthly record: all five variables, the 1981-2010 mean, the card's bars
  const [point, setPoint] = useState({ key: '', cell: null, err: '' })
  const opened = useRef(false)

  useEffect(() => {
    api.atlasIndex().then((idx) => {
      setIndex(idx)
      const asked = idx.find((v) => v.id === query.get('var'))
      // otherwise open on the variable where the usual test is most wrong: the trap at its clearest
      const gap = (v) => v.naive_fraction - v.honest_fraction
      setVarId((asked ?? idx.reduce((a, b) => (gap(b) > gap(a) ? b : a))).id)
    }).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    if (varId) api.atlas(varId).then(setAtlas).catch((e) => setError(e.message))
  }, [varId])
  useEffect(() => {
    if (!atlas) return
    // a shared link opens on its point, once
    if (!opened.current) {
      opened.current = true
      const lat = Number(query.get('lat'))
      const lon = Number(query.get('lon'))
      const c = query.has('lat') && Number.isFinite(lat) && Number.isFinite(lon) ? nearest(atlas.cells, lat, lon) : null
      if (c) { setPicked(c); setFocus({ lat: c.lat, lon: c.lon, at: Date.now() }) }
      return
    }
    // keep the picked point in sync with the variable shown (soil wetness has no ocean points)
    if (!picked) return
    const same = atlas.cells.find((c) => c.lat === picked.lat && c.lon === picked.lon)
    setPicked(same || null)
    if (!same) setNote(`${atlas.name} has no value at ${deg(picked.lat, picked.lon)} (ocean or ice).`)
  }, [atlas]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!varId) return
    const q = new URLSearchParams({ var: varId, test: TEST_PARAM[stage] })
    if (layer !== 'rate') q.set('layer', layer)
    if (picked) { q.set('lat', picked.lat); q.set('lon', picked.lon) }
    window.history.replaceState(null, '', `?${q}${window.location.hash}`)
  }, [varId, stage, layer, picked])

  useEffect(() => {
    if (!picked) return
    const key = `${picked.lat},${picked.lon}`
    let live = true
    api.cell(picked.lat, picked.lon).then((c) => live && setPoint({ key, cell: c, err: '' }))
      .catch((e) => live && setPoint({ key, cell: null, err: e.message }))
    return () => { live = false }
  }, [picked])

  useEffect(() => {
    if (layer !== 'years' || !varId) return
    let live = true
    api.atlasYears(varId).then((d) => {
      if (!live) return
      setYears(d)
      setYear((y) => (y && y >= d.years[0] && y <= d.years[1] ? y : d.years[0]))
    }).catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [layer, varId])
  useEffect(() => {
    if (!playing || !years) return
    const t = setInterval(() => setYear((y) => Math.min(years.years[1], y + 1)), YEAR_MS)
    return () => clearInterval(t)
  }, [playing, years])
  useEffect(() => { if (playing && years && year >= years.years[1]) setPlaying(false) }, [playing, years, year])

  function pick(c, fly = false) {
    setPicked(c)
    setNote('')
    if (fly) setFocus({ lat: c.lat, lon: c.lon, at: Date.now() })
    const h = [{ lat: c.lat, lon: c.lon, id: atlas.id }, ...history.filter((p) => p.lat !== c.lat || p.lon !== c.lon)].slice(0, 6)
    setHistory(h)
    saveHistory(h)
  }

  function pickCoords(e) {
    e.preventDefault()
    const lat = Number(coord.lat)
    const lon = Number(coord.lon)
    if (coord.lat === '' || coord.lon === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setNote('Enter a latitude between -90 and 90 and a longitude between -180 and 180.')
      return
    }
    const c = nearest(atlas.cells, lat, lon)
    if (c) pick(c, true)
  }

  function here() {
    if (!navigator.geolocation) { setNote('This browser cannot share its location. Type coordinates instead.'); return }
    setNote('Finding you…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = nearest(atlas.cells, pos.coords.latitude, pos.coords.longitude)
        if (c) pick(c, true)
        setNote(c ? `Nearest sample point to you: ${deg(c.lat, c.lon)}. Your location is not sent anywhere.` : '')
      },
      () => setNote('Location not shared. Type coordinates instead.'),
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNote('Link copied. It opens this point, variable and test.')
    } catch { setNote(window.location.href) }
  }
  async function card() {
    setNote('Drawing the card…')
    try {
      const record = pointCell?.vars[atlas.id] ?? null
      await verdictCard({ atlas, cell: picked, record, mean: pointMean, link: window.location.href })
      setNote('Verdict card saved as a PNG.')
    } catch (e) { setNote(`Could not draw the card: ${e.message}`) }
  }

  const pointKey = picked ? `${picked.lat},${picked.lon}` : ''
  const pointCell = point.key === pointKey ? point.cell : null
  const pointRec = pointCell && atlas ? fromCell(pointCell, atlas.id) : null
  const pointMean = pointRec ? baseMean(pointRec.dates, pointRec.values) : null

  const rateMax = useMemo(() => {
    if (!atlas) return 1
    const r = atlas.cells.map((c) => Math.abs(c.rate)).sort((a, b) => a - b)
    return r[Math.floor(r.length * 0.95)] || 1
  }, [atlas])
  const yearData = useMemo(() => {
    if (!years || years.id !== atlas?.id) return null
    const map = new Map(years.cells.map(([lat, lon, ys]) => [`${lat},${lon}`, ys]))
    const all = years.cells.flatMap((c) => c[2]).filter((v) => v != null).map(Math.abs).sort((a, b) => a - b)
    return { map, max: all[Math.floor(all.length * 0.95)] || 1, mean: yearlyMean(years) }
  }, [years, atlas])
  const tell = useMemo(() => (atlas ? describe(atlas) : null), [atlas])

  const now = STAGES.find((s) => s.id === stage)
  const pal = useMemo(() => palette(atlas?.id), [atlas])
  const showYears = layer === 'years' && yearData && year != null
  const paint = (c) => {
    const strength = c[now.flag] ? 1 : FAINT
    if (layer === 'rate') return [...pal.ramp(0.5 + c.rate / (2 * rateMax)), strength, 1]
    if (layer === 'phi') return [...stickyRamp(c.phi), 1, 1]
    if (layer === 'coverage') return [...coverRamp(((c.coverage ?? 1) - 0.8) / 0.2), 1, 1]
    if (layer === 'years') {
      const v = showYears ? yearData.map.get(`${c.lat},${c.lon}`)?.[year - years.years[0]] : null
      return v == null ? [...QUIET, 0.5, 0.7] : [...pal.ramp(0.5 + v / (2 * yearData.max)), 1, 1]
    }
    return [...rgb(c.rate > 0 ? pal.up : pal.down), strength, 1]
  }
  const paintKey = `${atlas?.id}|${layer}|${layer === 'years' ? `${Boolean(showYears)}|${year}` : stage}`
  // on the honest verdict, ring the points the usual test flagged and the honest verdict rejects
  const isFalseAlarm = (c) => c.naive && !c.honest
  const rings = stage === 'fdr' && (layer === 'rate' || layer === 'verdict')
  const falseAlarms = atlas ? atlas.cells.filter(isFalseAlarm).length : 0

  const flagged = atlas ? atlas.cells.filter((c) => c[now.flag]) : []
  const up = flagged.filter((c) => c.rate > 0).length
  const land = Boolean(atlas) && atlas.n_cells < Math.max(...index.map((v) => v.n_cells))
  const full = atlas && atlas.cells.every((c) => (c.coverage ?? 1) === 1)

  return (
    <div className="atlas">
      <div className="globe">
        {atlas ? (
          <Globe cells={atlas.cells} step={atlas.step_deg} paint={paint} paintKey={paintKey} sweep={layer !== 'years'}
            mark={rings ? isFalseAlarm : null}
            sweepColor={sweepRGB(layer === 'verdict' || layer === 'rate' ? now.color : '#56b4e9')}
            picked={picked} focus={focus} onPick={(c) => pick(c)} describe={tell} height={GLOBE_H}
            flat={flat} squares={squares} landOnly={land} onSlow={() => { setSquares(true); setSlow(true) }}
            label={`${flat ? 'Flat map' : 'Globe'} of ${atlas.name.toLowerCase()} at ${atlas.n_cells} sample points. Drag or use the arrow keys to ${flat ? 'move' : 'turn'} it, plus and minus to zoom; click a point to read it.`} />
        ) : <div className="globe-wait" style={{ height: GLOBE_H }}>{error ? '' : 'Loading the world…'}</div>}
        {atlas && (
          <p className="globe-note">
            {squares
              ? (slow ? 'Smooth colour was too slow to draw on this device, so each sample point is shown as its own 5° square.' : 'Each sample point is shown as its own 5° square.')
              : 'Colour is interpolated between 5-degree sample points for display. Tests are run at the sample points only.'}
          </p>
        )}
        {showYears && (
          <div className="year-stamp">
            <span className="y">{year}</span>
            <Spark values={yearData.mean} at={year} first={years.years[0]} />
            <span className="small">mean of the sample points, weighted by area</span>
          </div>
        )}
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
            <button key={s.id} className={stage === s.id ? `on ${s.id}` : ''} aria-pressed={stage === s.id}
              onClick={() => { setStage(s.id); if (layer !== 'rate' && layer !== 'verdict') setLayer('rate') }}>
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
        <div className="view-opts" role="group" aria-label="How the map is drawn">
          <label><input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} />Flat map</label>
          <label><input type="checkbox" checked={squares} onChange={(e) => setSquares(e.target.checked)} />Show sample squares</label>
        </div>
        {atlas && layer !== 'years' && <Legend layer={layer} stage={stage} atlas={atlas} rateMax={rateMax} pal={pal} falseAlarms={falseAlarms} />}
        {layer === 'years' && (
          <div className="player">
            {!yearData ? <p className="small">Loading 45 years of {atlas?.name.toLowerCase()}…</p> : (
              <>
                <div className="player-row">
                  <button className="play" aria-pressed={playing}
                    onClick={() => { if (!playing && year >= years.years[1]) setYear(years.years[0]); setPlaying(!playing) }}>
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <input type="range" min={years.years[0]} max={years.years[1]} value={year} aria-label="Year"
                    onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)) }} />
                  <output>{year}</output>
                </div>
                <div className="ramp">
                  <span className="ramp-bar" style={{ background: pal.css }} />
                  <span className="ramp-ends"><span>{fmt(-yearData.max, true)}</span><span>{fmt(yearData.max, true)} {atlas.units}</span></span>
                  <span className="ramp-note">
                    Each point is that year minus its own 1981–2025 normal. Watch how much it jumps from year to year:
                    that is the noise the usual test mistakes for trends. Verdicts come only from the monthly tests.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
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
              {picked.rate > 0 ? atlas.rising : atlas.falling}{' '}
              {howMuch(picked.rate, atlas.units, `${atlas.years[0]}-01`, `${atlas.years[1]}-12`, pointMean)}. 95% range{' '}
              {rate(picked.rate_lo)} to {rate(picked.rate_hi)} per decade. Stickiness φ = {fmt(picked.phi, false, 2)}.
            </p>
            <dl className="stages">
              <div className="u"><dt>{STAGE.usual}</dt><dd>{picked.naive ? 'trend' : 'no trend'}<span>p {pval(picked.p_naive)}</span></dd></div>
              <div><dt>{STAGE.pw}</dt><dd>{picked.pw ? 'trend' : 'no trend'}<span>p {pval(picked.p_honest)}</span></dd></div>
              <div className="h"><dt>{STAGE.honest}</dt><dd>{picked.honest ? 'trend is real' : 'not proven'}<span>needs p ≤ {pval(atlas.fdr_threshold)}</span></dd></div>
            </dl>
            <p className="small rule">{RULE.map}</p>
            {!picked.honest && picked.more_years > 0 && (
              <p className="small">At this rate and stickiness, about {Math.ceil(picked.more_years)} more years of data would be needed.</p>
            )}
            {point.key === pointKey && point.err ? <p className="small">{point.err}</p>
              : pointCell ? <FingerprintTable cell={pointCell} current={atlas.id} rule="map" ruleNote={false} />
                : <p className="small">Loading the other variables at this point…</p>}
            <div className="actions">
              <button className="link" onClick={() => onPick?.({ lat: picked.lat, lon: picked.lon, param: atlas.id })}>
                Open the full record
              </button>
              <button className="link" onClick={card}>Download verdict card</button>
              <button className="link" onClick={copyLink}>Copy link</button>
            </div>
          </div>
        )}
        {note && <p className="note" role="status">{note}</p>}

        {atlas && (
          <form className="coords" onSubmit={pickCoords}>
            <label>Lat<input inputMode="decimal" value={coord.lat} onChange={(e) => setCoord({ ...coord, lat: e.target.value })} placeholder="13.1" /></label>
            <label>Lon<input inputMode="decimal" value={coord.lon} onChange={(e) => setCoord({ ...coord, lon: e.target.value })} placeholder="80.3" /></label>
            <button type="submit">Nearest point</button>
            <button type="button" onClick={here}>Use my location</button>
          </form>
        )}
        {history.length > 0 && atlas && (
          <div className="history" role="group" aria-label="Points you looked at">
            <span>Looked at</span>
            {history.map((h) => {
              const c = atlas.cells.find((x) => x.lat === h.lat && x.lon === h.lon)
              return c && <button key={`${h.lat},${h.lon}`} className="chip" onClick={() => pick(c, true)}>{deg(h.lat, h.lon)}</button>
            })}
          </div>
        )}
        <p className="credit">
          Drag to turn the globe · wheel or pinch to zoom · click a point to read it · NASA POWER monthly data, {atlas?.years.join('–')}, one
          sample point per 5° · {STAGE.usual}: Mann-Kendall p &lt; 0.05 · {STAGE.pw}: the same test after
          pre-whitening · {STAGE.honest}: map rule, false discovery rate 10% across all points
        </p>
      </div>
    </div>
  )
}
