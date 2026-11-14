import { useEffect, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import Verdict from '../components/Verdict'
import PlacePicker from '../components/PlacePicker'

const PLACES = [
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Niamey, Sahel', lat: 13.51, lon: 2.11 },
  { name: 'Manaus, Amazon', lat: -3.12, lon: -60.02 },
  { name: 'Phoenix', lat: 33.45, lon: -112.07 },
  { name: 'Madrid', lat: 40.42, lon: -3.7 },
  { name: 'Yakutsk', lat: 62.03, lon: 129.73 },
]

export default function InvestigateView({ pick }) {
  const [params, setParams] = useState([])
  const [form, setForm] = useState({ lat: 13.08, lon: 80.27, param: 'T2M' })
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The free live server sleeps when idle and takes about a minute to wake, so keep asking instead of failing.
  const [waking, setWaking] = useState(true)
  useEffect(() => {
    let tries = 0
    let timer
    const knock = () => api.params().then((p) => { setParams(p); setWaking(false) }).catch(() => {
      if (++tries < 20) timer = setTimeout(knock, 5000)
      else { setWaking(false); setError('The live server did not answer. The globe, the trap and the case file below still work.') }
    })
    knock()
    return () => clearTimeout(timer)
  }, [])

  async function run(next = form) {
    setBusy(true)
    setError('')
    try {
      setData(await api.point(next))
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Could not reach the backend for live NASA data.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  // A square clicked on the globe opens here. Variables only the globe has fall back to the current one.
  useEffect(() => {
    if (!pick) return
    const next = { lat: pick.lat, lon: pick.lon, param: ['T2M', 'PRECTOTCORR', 'RH2M'].includes(pick.param) ? pick.param : form.param }
    setForm(next)
    run(next)
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="investigate">
      <h2>Test any place on Earth</h2>
      <p className="lead">Pick a place and a variable. We fetch NASA data since 1981, remove the seasons, and run both tests on the same months.</p>
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
          <div className="fields">
            <label>Latitude
              <input type="number" step="0.01" value={form.lat}
                onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} />
            </label>
            <label>Longitude
              <input type="number" step="0.01" value={form.lon}
                onChange={(e) => setForm({ ...form, lon: Number(e.target.value) })} />
            </label>
            <label>Variable
              <select value={form.param} onChange={(e) => setForm({ ...form, param: e.target.value })}>
                {params.length === 0 && <option value="T2M">Air temperature at 2 m</option>}
                {params.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.units})</option>)}
              </select>
            </label>
            <button className="primary" onClick={() => run()} disabled={busy}>{busy ? 'Fetching NASA data…' : 'Run both tests'}</button>
          </div>
          {params.find((p) => p.id === form.param)?.definition && (
            <p className="small">{params.find((p) => p.id === form.param).definition}</p>
          )}
          <p className="small">Click the map to pick a place (snaps to 2.5°), or type exact coordinates.</p>
          {waking && <p className="small" role="status">Waking the live server. The first test can take about a minute.</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>
      {data && (
        <div className="result">
          <SeriesChart series={data} />
          <Verdict analysis={data.analysis} units={data.units} />
          <p className="source">Source: {data.source}</p>
        </div>
      )}
    </div>
  )
}
