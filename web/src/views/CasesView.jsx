import { useEffect, useState } from 'react'
import { api } from '../api'
import SeriesChart from '../components/SeriesChart'
import Verdict from '../components/Verdict'
import MaskMap from '../components/MaskMap'

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
            Usual method: {(active.naive_fraction * 100).toFixed(1)}% of the map "significant".
            Noise Trap: {(active.honest_fraction * 100).toFixed(1)}%. {active.note}
          </p>
          <div className="maps">
            <MaskMap mask={active.naive_mask} title="Usual method: significant pixels" color="#d55e00" />
            <MaskMap mask={active.honest_mask} title="Noise Trap: significant pixels" color="#0072b2" />
          </div>
          <p className="source">Source: {active.source}</p>
        </article>
      )}
      {active?.series?.map((s) => (
        <article key={s.name} className="case-series">
          <SeriesChart series={s} height={280} />
          <Verdict analysis={s.analysis} units={s.units} />
          <p className="source">Source: {s.source}</p>
        </article>
      ))}
    </section>
  )
}
