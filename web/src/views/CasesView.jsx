import { useEffect, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import Verdict from '../components/Verdict'
import MaskMap from '../components/MaskMap'
import { pct, peq, rate } from '../lib/format'
import { RULE, STAGE } from '../lib/stages'

// The three stages for all months and two seasons (cases built with seasons, e.g. Wisconsin).
function SeasonRows({ seasons, units }) {
  const rows = ['all', 'JJA', 'DJF'].map((k) => seasons[k]).filter(Boolean)
  return (
    <table className="halves seasons">
      <caption>All months and two seasons, {rows[0].frame.start}–{rows[0].frame.end}</caption>
      <thead><tr><th scope="col">Months</th><th scope="col">Rate per decade</th><th scope="col" className="u">{STAGE.usual}</th>
        <th scope="col" className="h">{STAGE.honest}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.season}>
            <th scope="row">{r.season_name}</th>
            <td>{rate(r.stages.honest.slope_per_year * 10)} {units}</td>
            <td>{r.stages.naive.significant ? 'trend' : 'no trend'}, {peq(r.stages.naive.p)}</td>
            <td>{r.stages.honest.significant ? 'trend is real' : 'not proven'}, {peq(r.stages.honest.p)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan="4" className="small">All months: {RULE.place} Seasons: {RULE.season}</td></tr></tfoot>
    </table>
  )
}

export default function CasesView() {
  const [cases, setCases] = useState([])
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.cases().then((list) => {
      setCases(list)
      if (list[0]) open(list[0].id)
    }).catch((e) => setError(e.message))
  }, [])

  async function open(id) {
    setError('')
    try {
      setActive(await api.caseFile(id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section>
      <h2>Case files</h2>
      <p className="lead">Guided investigations built from cached NASA data. They work even without internet.</p>
      <div className="controls wrap">
        {cases.map((c) => (
          <button key={c.id} className={`chip ${active?.id === c.id ? 'on' : ''}`} onClick={() => open(c.id)}>
            {c.title}
          </button>
        ))}
        {cases.length === 0 && !error && <span>No case files built yet.</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {active?.slope && (
        <article className="case-series">
          <p className="lead">
            {STAGE.usual}: {pct(active.naive_fraction, 1)} of the map flagged.
            {' '}{STAGE.honest}: {pct(active.honest_fraction, 1)}. {active.note}
          </p>
          <div className="maps">
            <MaskMap mask={active.naive_mask} title={`${STAGE.usual}: flagged pixels`} color="#d55e00" />
            <MaskMap mask={active.honest_mask} title={`${STAGE.honest}: flagged pixels`} color="#0072b2" />
          </div>
          <p className="small rule">{RULE.map}</p>
          <p className="source">Source: {active.source}</p>
        </article>
      )}
      {active?.series?.map((s) => (
        <article key={s.name} className="case-series">
          <SeriesChart series={s} height={280} />
          <Verdict series={s} />
          {s.seasons && <SeasonRows seasons={s.seasons} units={s.units} />}
          <p className="source">Source: {s.source}{s.reproduce && <> · <a href={s.reproduce} target="_blank" rel="noreferrer">Reproduce in NASA Giovanni</a></>}</p>
        </article>
      ))}
    </section>
  )
}
