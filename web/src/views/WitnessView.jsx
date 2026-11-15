// Second witness: the same tests on two independent records of one place (a satellite and a model
// reanalysis) over the months both have. Built by backend/scripts/build_witness.py; works offline.
import { useEffect, useState } from 'react'
import { api } from '../api'
import Plot from '../components/Plot'
import Info from '../components/Info'
import { peq, rate } from '../lib/format'
import { RULE, STAGE } from '../lib/stages'

const DIR = { rising: '↑ rising', falling: '↓ falling', flat: 'no change' }
const COLORS = ['#56b4e9', '#e69f00']
const AXIS = { gridcolor: 'rgba(139,150,162,0.14)', linecolor: '#2b3947', tickfont: { size: 12 } }

function Pair({ p }) {
  const both = [p.a, p.b]
  return (
    <article className="paircard">
      <h3>{p.title} <span className={`badge ${p.badge}`}>{p.label}</span></h3>
      <p>{p.sentence}</p>
      <Plot
        data={both.map((s, k) => ({ x: s.dates, y: s.values, type: 'scatter', mode: 'lines', connectgaps: false,
          name: `${s.short} (${s.kind})`, line: { color: COLORS[k], width: 1.4 },
          hovertemplate: `${s.short}, %{x|%b %Y}: %{y:.3g} ${s.units}<extra></extra>` }))}
        layout={{ height: 260, margin: { l: 56, r: 12, t: 10, b: 36 }, xaxis: { ...AXIS, type: 'date' },
          yaxis: { ...AXIS, title: { text: p.a.units } }, legend: { orientation: 'h', y: -0.2, font: { size: 12 } },
          font: { color: '#8b96a2', family: 'Barlow, sans-serif' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
          hoverlabel: { bgcolor: '#0b1016', bordercolor: '#33414f', font: { color: '#e9eef2' } } }}
        config={{ displayModeBar: false, responsive: true }} style={{ width: '100%' }} useResizeHandler />
      <table className="halves">
        <caption>{p.place}, {p.first} to {p.last}, only the months both sources have</caption>
        <thead><tr><th scope="col">Source</th><th scope="col">Direction</th><th scope="col">Rate per decade <Info term="per decade" /></th>
          <th scope="col" className="u">{STAGE.usual}</th><th scope="col" className="h">{STAGE.honest} <Info term="honest verdict" /></th></tr></thead>
        <tbody>
          {both.map((s) => (
            <tr key={s.short}>
              <th scope="row">{s.short} <span className="small">({s.kind})</span></th>
              <td>{DIR[s.direction]}</td>
              <td>{rate(s.rate_per_decade)} {s.units} <span className="small">(95% range {rate(s.rate_ci_per_decade[0])} to {rate(s.rate_ci_per_decade[1])})</span></td>
              <td>{s.usual ? 'trend' : 'no trend'}, {peq(s.p_usual)}</td>
              <td>{s.honest ? 'trend is real' : 'not proven'}, {peq(s.p_honest)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan="5" className="small">{RULE.place}</td></tr></tfoot>
      </table>
      <ul className="small datasets">{both.map((s) => <li key={s.short}>{s.source}</li>)}</ul>
    </article>
  )
}

export default function WitnessView() {
  const [w, setW] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.witness().then(setW).catch((e) => setError(e.message)) }, [])
  return (
    <div className="witness">
      <h2>Second witness</h2>
      <p className="lead">
        One record can mislead. Here each trend is tested twice, on a satellite record and on a model record
        (a reanalysis) of the same place, with the same tests over the same months. The badge compares the direction
        and the honest verdict.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {w?.pairs.map((p) => <Pair key={p.id} p={p} />)}
      {w?.skipped?.length > 0 && <p className="note">Not shown: {w.skipped.join('; ')}.</p>}
    </div>
  )
}
