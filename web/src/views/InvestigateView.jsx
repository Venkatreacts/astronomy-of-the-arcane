import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import PlacePicker from '../components/PlacePicker'
import Fingerprint from '../components/Fingerprint'
import { deg, download, fmt, km, nearestAtlasPoint, peq, pval } from '../lib/format'
import { fromCell, fromLive, toCSV, toJSON } from '../lib/record'

const PLACES = [
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Niamey, Sahel', lat: 13.51, lon: 2.11 },
  { name: 'Manaus, Amazon', lat: -3.12, lon: -60.02 },
  { name: 'Phoenix', lat: 33.45, lon: -112.07 },
  { name: 'Madrid', lat: 40.42, lon: -3.7 },
  { name: 'Yakutsk', lat: 62.03, lon: 129.73 },
]
// The five globe variables are always available from the pre-computed atlas points.
const ATLAS_VARS = [
  { id: 'T2M', name: 'Air temperature', units: 'degC' },
  { id: 'PRECTOTCORR', name: 'Rainfall', units: 'mm/day' },
  { id: 'GWETROOT', name: 'Root-zone soil wetness', units: '0-1' },
  { id: 'RH2M', name: 'Relative humidity', units: '%' },
  { id: 'WS2M', name: 'Wind speed at 2 m', units: 'm/s' },
]

function Facts({ r }) {
  const clim = r.clim.filter((x) => x != null)
  const hi = r.clim.indexOf(Math.max(...clim))
  const lo = r.clim.indexOf(Math.min(...clim))
  const ci = r.honest.slope_ci_per_year
  return (
    <dl className="facts">
      <div><dt>Place</dt><dd>{deg(r.lat, r.lon)}<span>{r.kind === 'atlas' ? 'atlas sample point' : 'NASA POWER grid cell nearest these coordinates'}</span></dd></div>
      <div><dt>Observed</dt><dd>{r.dates[0]} to {r.dates[r.dates.length - 1]}<span>{r.n} of {r.months} months present ({((100 * r.n) / r.months).toFixed(0)}%)</span></dd></div>
      <div><dt>Seasons</dt><dd>{fmt(Math.min(...clim))} to {fmt(Math.max(...clim))} {r.units}<span>lowest in {'JanFebMarAprMayJunJulAugSepOctNovDec'.slice(lo * 3, lo * 3 + 3)}, highest in {'JanFebMarAprMayJunJulAugSepOctNovDec'.slice(hi * 3, hi * 3 + 3)}; removed before testing</span></dd></div>
      <div><dt>Rate</dt><dd>{fmt(r.honest.slope_per_year * 10, true)} {r.units} per decade<span>{ci ? `95% range ${fmt(ci[0] * 10, true)} to ${fmt(ci[1] * 10, true)}` : 'no range available'} (Sen's slope)</span></dd></div>
      <div><dt>Stickiness</dt><dd>φ = {fmt(r.noise.phi, false, 2)}<span>how much each month's anomaly resembles the last; noise σ = {fmt(r.noise.sigma_n)} {r.units}</span></dd></div>
    </dl>
  )
}

function Stages({ r }) {
  const fdr = r.fdr
  return (
    <dl className="verdicts three">
      <div className="vrow u">
        <dt>1 · Usual test</dt>
        <dd><span className="vword">{r.naive.significant ? 'Trend' : 'No trend'}</span>
          <span className="small">Mann-Kendall on the anomalies · {peq(r.naive.p)}</span></dd>
      </div>
      <div className="vrow pw">
        <dt>2 · Stickiness removed</dt>
        <dd><span className="vword">{r.honest.significant ? 'Trend' : 'No trend'}</span>
          <span className="small">same test after pre-whitening · {peq(r.honest.p)}</span></dd>
      </div>
      <div className="vrow h">
        <dt>3 · Honest verdict</dt>
        <dd>
          {fdr
            ? <><span className="vword">{fdr.significant ? 'Trend is real' : 'Not proven'}</span>
              <span className="small">stage 2 plus false-discovery control across all atlas points (p must be ≤ {pval(fdr.threshold)})</span></>
            : <><span className="vword">{r.honest.significant ? 'Trend is real' : 'Not proven'}</span>
              <span className="small">one place, one test: stage 2 is the honest verdict (no multiple-testing correction needed)</span></>}
        </dd>
      </div>
    </dl>
  )
}

function Explain({ r }) {
  const honest = r.fdr ? r.fdr.significant : r.honest.significant
  const more = r.years_more_needed
  if (r.naive.significant && !r.honest.significant) {
    return (
      <p className="callout" role="note">
        The tests disagree. With φ = {fmt(r.noise.phi, false, 2)}, a run of warm (or wet) months is partly one event
        counted many times, so the usual test sees more evidence than there is. Once that is removed the change is
        within what noise alone produces. {more > 0 && `At this rate it would take about ${Math.ceil(more)} more years to tell.`}
      </p>
    )
  }
  if (r.honest.significant && r.fdr && !r.fdr.significant) {
    return (
      <p className="callout" role="note">
        On its own this place passes. But the atlas tests {r.name.toLowerCase()} at every sample point, and among
        that many tests some pass by luck; this p-value is not small enough to stand out from them.
      </p>
    )
  }
  if (!honest && more > 0) {
    return <p className="small">Not detectable yet. At this rate and stickiness, about {Math.ceil(more)} more years of data
      would give a 90% chance of detection (Weatherhead et al. 1998; in our simulations the honest test reached 85–90%).</p>
  }
  return null
}

function Halves({ halves, units }) {
  if (!halves) return null
  return (
    <table className="halves">
      <caption>Does it hold in both halves of the record?</caption>
      <thead><tr><th scope="col">Years</th><th scope="col">Rate per decade</th><th scope="col">95% range</th><th scope="col">Stickiness removed</th></tr></thead>
      <tbody>
        {halves.map((h) => (
          <tr key={h.years[0]}>
            <th scope="row">{h.years[0]}–{h.years[1]}</th>
            <td>{fmt(h.rate, true)} {units}</td>
            <td>{fmt(h.rate_ci[0], true)} to {fmt(h.rate_ci[1], true)}</td>
            <td>{h.p_honest < 0.05 ? 'trend' : 'no trend'}, {peq(h.p_honest)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function InvestigateView({ pick }) {
  const [params, setParams] = useState(ATLAS_VARS)
  const [form, setForm] = useState({ lat: 13.08, lon: 80.27, param: 'T2M' })
  const [record, setRecord] = useState(null)
  const [cell, setCell] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [online, setOnline] = useState(null)
  const req = useRef(0)

  useEffect(() => {
    api.params().then((p) => {
      setOnline(true)
      const known = new Set(ATLAS_VARS.map((v) => v.id))
      setParams([...ATLAS_VARS, ...p.filter((v) => !known.has(v.id))])
    }).catch(() => setOnline(false))
  }, [])

  async function openAtlas(lat, lon, param, why = '') {
    const c = await api.cell(lat, lon)
    const r = fromCell(c, param)
    if (!r) throw new Error(`No ${ATLAS_VARS.find((v) => v.id === param)?.name.toLowerCase() || param} at ${deg(lat, lon)} (ocean or ice).`)
    return { r, c, why }
  }

  // prefer = 'atlas' opens the pre-computed point exactly; otherwise try live NASA data, then fall back offline.
  async function run(next, prefer) {
    const id = ++req.current
    setBusy(true)
    setError('')
    setNote('')
    try {
      let out
      const atlasVar = ATLAS_VARS.some((v) => v.id === next.param)
      if (prefer === 'atlas') {
        out = await openAtlas(next.lat, next.lon, next.param)
      } else {
        try {
          const data = await api.point(next)
          out = { r: fromLive(data, next.lat, next.lon, next.param), c: null, why: '' }
        } catch (e) {
          if (!atlasVar || !/fetch|reach|Failed|NetworkError|502|404|500/i.test(e.message)) throw e
          const p = nearestAtlasPoint(next.lat, next.lon)
          out = await openAtlas(p.lat, p.lon, next.param,
            `Live NASA data needs the backend, which is not reachable. Showing the nearest pre-computed sample point, `
            + `${deg(p.lat, p.lon)}, ${Math.round(km(next, p))} km from the place you chose.`)
        }
      }
      if (id !== req.current) return
      setRecord(out.r)
      setCell(out.c)
      setNote(out.why)
    } catch (e) {
      if (id === req.current) setError(e.message)
    } finally {
      if (id === req.current) setBusy(false)
    }
  }

  // A point clicked on the globe opens here, with the same variable, from the same pre-computed data.
  useEffect(() => {
    if (!pick) return
    const next = { lat: pick.lat, lon: pick.lon, param: pick.param }
    setForm(next)
    run(next, 'atlas')
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps

  function change(param) {
    const next = { ...form, param }
    setForm(next)
    if (record?.kind === 'atlas' && cell?.vars[param]) {
      setRecord(fromCell(cell, param))
      setNote('')
    } else run(next)
  }

  const r = record
  const series = r && { dates: r.dates, values: r.values, clim: r.clim, units: r.units, name: `${r.name} at ${deg(r.lat, r.lon)}`,
    analysis: { anomalies: r.anomalies, honest: r.honest } }
  const stem = r && `${r.id}_${r.lat}_${r.lon}`.replace(/[^\w.-]/g, '_')

  return (
    <div className="investigate">
      <h2>Investigate one place</h2>
      <p className="lead">
        Pick a place and a variable. Every result shows where the numbers came from: the months used, how sticky the
        data is, and what each of the three tests concludes.
      </p>
      <div className="row">
        <div className="pickmap">
          <PlacePicker lat={form.lat} lon={form.lon} onPick={(lat, lon) => {
            if (busy) return
            const next = { ...form, lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) }
            setForm(next)
            run(next)
          }} />
        </div>
        <div className="form">
          <div className="chips">
            {PLACES.map((p) => (
              <button key={p.name} className="chip" disabled={busy} onClick={() => {
                const next = { ...form, lat: p.lat, lon: p.lon }
                setForm(next)
                run(next)
              }}>{p.name}</button>
            ))}
          </div>
          <form className="fields" onSubmit={(e) => { e.preventDefault(); run(form) }}>
            <label>Latitude
              <input type="number" step="0.01" min="-90" max="90" required value={form.lat}
                onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} />
            </label>
            <label>Longitude
              <input type="number" step="0.01" min="-180" max="180" required value={form.lon}
                onChange={(e) => setForm({ ...form, lon: Number(e.target.value) })} />
            </label>
            <label>Variable
              <select value={form.param} onChange={(e) => change(e.target.value)}>
                {params.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.units})</option>)}
              </select>
            </label>
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Run the tests'}</button>
          </form>
          <p className="small">
            {online === false
              ? 'Offline mode: places open the nearest pre-computed sample point (one every 5°). Start the backend for live NASA data at exact coordinates.'
              : 'Click the map (snaps to 2.5°) or type coordinates. Live data comes from NASA POWER through our backend.'}
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          {note && <p className="note" role="status">{note}</p>}
        </div>
      </div>
      {r && (
        <div className="result" aria-busy={busy}>
          <SeriesChart series={series} toggle />
          <div className="workspace">
            <div>
              <Stages r={r} />
              <Explain r={r} />
              <Halves halves={r.halves} units={r.units} />
            </div>
            <div>
              <Facts r={r} />
              {cell && <Fingerprint cell={cell} current={r.id} onSelect={change} />}
              <div className="exports">
                <button onClick={() => download(`${stem}.csv`, toCSV(r), 'text/csv')}>Download CSV</button>
                <button onClick={() => download(`${stem}.json`, toJSON(r), 'application/json')}>Download JSON with provenance</button>
              </div>
            </div>
          </div>
          <p className="source">Source: {r.source} Seasonal normal = each calendar month's mean over the whole record.</p>
        </div>
      )}
    </div>
  )
}
