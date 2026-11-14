import { useEffect, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import Verdict from '../components/Verdict'
import PlacePicker from '../components/PlacePicker'

const PLACES = [
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Kolkata', lat: 22.57, lon: 88.36 },
]

export default function InvestigateView() {
  const [params, setParams] = useState([])
  const [form, setForm] = useState({ lat: 13.08, lon: 80.27, param: 'T2M' })
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.params().then(setParams).catch((e) => setError(e.message))
  }, [])

  async function run(next = form) {
    setBusy(true)
    setError('')
    try {
      setData(await api.point(next))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Investigate a place</h2>
      <p className="lead">Pick a place and a variable. We fetch NASA data since 1981, remove the seasons, and test the trend two ways.</p>
      <div className="controls wrap">
        {PLACES.map((p) => (
          <button key={p.name} className="chip" onClick={() => {
            const next = { ...form, lat: p.lat, lon: p.lon }
            setForm(next)
            run(next)
          }}>{p.name}</button>
        ))}
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
            {params.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.units})</option>)}
          </select>
        </label>
        <button onClick={() => run()} disabled={busy}>{busy ? 'Fetching NASA data…' : 'Investigate'}</button>
      </div>
      <PlacePicker lat={form.lat} lon={form.lon} onPick={(lat, lon) => {
        if (busy) return
        const next = { ...form, lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) }
        setForm(next)
        run(next)
      }} />
      <p className="card-small">Click anywhere on the map to investigate that place (snaps to a 2.5° grid; fine-tune with the boxes).</p>
      {params.find((p) => p.id === form.param)?.definition && (
        <p className="card-small">{params.find((p) => p.id === form.param).definition}</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <>
          <SeriesChart series={data} />
          <Verdict analysis={data.analysis} units={data.units} />
          <p className="source">Source: {data.source}</p>
        </>
      )}
    </section>
  )
}
