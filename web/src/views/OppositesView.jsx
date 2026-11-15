// Same variable, opposite directions: for each atlas variable, the honest rising point and the honest falling
// point with the largest rates (map rule). Pairs from backend/scripts/build_witness.py, records from cells/.
import { useEffect, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import Info from '../components/Info'
import { deg, peq, pval, rate } from '../lib/format'
import { fromCell } from '../lib/record'

function Side({ v, c, dir }) {
  const [rec, setRec] = useState(null)
  useEffect(() => {
    if (!c) return
    let live = true
    api.cell(c.lat, c.lon).then((cell) => { if (live) setRec(fromCell(cell, v.id)) }).catch(() => {})
    return () => { live = false }
  }, [c, v.id])
  const word = dir === 'rising' ? v.rising_word : v.falling_word
  if (!c) {
    return <div className="oppo"><h3>{word}</h3><p>No atlas point {dir === 'rising' ? 'rises' : 'falls'} and passes the honest verdict.</p></div>
  }
  return (
    <div className="oppo">
      <h3>{word} <span className="small">at {deg(c.lat, c.lon)}</span></h3>
      <p>
        <strong className="h">{rate(c.rate)}</strong> {v.units} per decade <Info term="per decade" />
        <span className="small"> (95% range {rate(c.rate_lo)} to {rate(c.rate_hi)}); honest {peq(c.p_honest)}, needs p ≤ {pval(v.fdr_threshold)}</span>
      </p>
      {rec && <SeriesChart height={260} series={{ name: `${v.name}, ${v.years[0]}–${v.years[1]}`, units: v.units,
        dates: rec.dates, values: rec.values, analysis: { anomalies: rec.anomalies, honest: rec.honest } }} />}
    </div>
  )
}

export default function OppositesView() {
  const [o, setO] = useState(null)
  const [id, setId] = useState('T2M')
  const [error, setError] = useState('')
  useEffect(() => { api.opposites().then(setO).catch((e) => setError(e.message)) }, [])
  const v = o?.variables.find((x) => x.id === id)
  return (
    <div className="opposites">
      <h2>Same variable, opposite directions</h2>
      <p className="lead">
        For each variable, the atlas point with the strongest rise and the one with the strongest fall, among points
        that pass the honest verdict. Both changes pass the tests; the tests do not say why either one happened.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="chips">
        {o?.variables.map((x) => (
          <button key={x.id} className={`chip ${x.id === id ? 'on' : ''}`} aria-pressed={x.id === id} onClick={() => setId(x.id)}>{x.name}</button>
        ))}
      </div>
      {v && (
        <>
          <div className="pairgrid">
            <Side v={v} c={v.rising} dir="rising" />
            <Side v={v} c={v.falling} dir="falling" />
          </div>
          <p className="small rule">
            {o.rule} {v.n_honest} of the atlas points pass for this variable. Each point is a NASA POWER (MERRA-2 model)
            value at the centre of a 5° cell, not an average over the cell.
          </p>
        </>
      )}
    </div>
  )
}
