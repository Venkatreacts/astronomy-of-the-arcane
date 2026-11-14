import { useEffect, useMemo, useState } from 'react'
import MaskMap from '../components/MaskMap'
import { api } from '../api'
import { RULE, STAGE } from '../lib/stages'

const METHODS = [
  { id: 'naive', label: STAGE.usual, tone: 'u', color: '#d55e00', how: 'Mann-Kendall, p < 0.05' },
  { id: 'pw', label: STAGE.pw, tone: 'pw', color: '#56b4e9', how: 'pre-whitened Mann-Kendall, p < 0.05' },
  { id: 'fdr', label: STAGE.honest, tone: 'h', color: '#0072b2', how: RULE.map },
]
const CONTROLS = [
  { key: 'phi', label: 'Stickiness φ', fmt: (v) => v.toFixed(1) },
  { key: 'years', label: 'Record length', fmt: (v) => `${v} yr` },
  { key: 'trend', label: 'Real trend (left half)', fmt: (v) => (v ? `${v} SD/decade` : 'none') },
  { key: 'spatial', label: 'Neighbours', fmt: (v) => (v ? 'correlated' : 'independent') },
  { key: 'missing', label: 'Months missing', fmt: (v) => (v ? `${v * 100}%` : 'none') },
]
const pc = (x) => (x == null ? '–' : `${(x * 100).toFixed(0)}%`)
const range = (s) => (s ? `${pc(s.lo)}–${pc(s.hi)}` : '')

function toGrid(str, n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Number(str[i * n + j])))
}

export default function NoiseTrapView() {
  const [lab, setLab] = useState(null)
  const [set, setSet] = useState({ phi: 0.5, years: 45, trend: 0, spatial: 2, missing: 0 })
  const [error, setError] = useState('')

  useEffect(() => { api.lab().then(setLab).catch((e) => setError(e.message)) }, [])

  const exp = useMemo(() => lab?.experiments.find((e) => CONTROLS.every((c) => e.params[c.key] === set[c.key])), [lab, set])
  const n = lab?.size[0] ?? 20
  const withTrend = set.trend > 0
  const m = exp?.methods

  const rows = [
    { key: 'false_alarm', label: withTrend ? 'Trend-free places wrongly flagged' : 'Places wrongly flagged', good: 'low', show: true },
    { key: 'power', label: 'Real trends found', good: 'high', show: withTrend },
    { key: 'miss', label: 'Real trends missed', good: 'low', show: withTrend },
    { key: 'fdp', label: 'Flags that are wrong', good: 'low', show: withTrend },
    { key: 'any_false', label: 'Maps with at least one false alarm', good: 'low', show: true },
  ].filter((r) => r.show)

  return (
    <div className="trap">
      <h2>The trap: trends in pure noise</h2>
      <p className="lead">
        A laboratory with fake data, so the truth is known. Each map is {n * n} places of monthly noise in which each month
        resembles the last by φ, the way real weather does. {withTrend
          ? <>The <strong>left half</strong> also gets a real, steady trend; the right half has none.</>
          : <>There is <strong>no trend anywhere</strong>: every flagged square is a false alarm.</>}
      </p>
      <div className="lab-controls">
        {lab && CONTROLS.map((c) => (
          <div key={c.key} className="lab-control" role="group" aria-label={c.label}>
            <span className="lab-label">{c.label}</span>
            <div className="seg">
              {lab.grid[c.key].map((v) => (
                <button key={v} className={set[c.key] === v ? 'on' : ''} aria-pressed={set[c.key] === v}
                  onClick={() => setSet((cur) => ({ ...cur, [c.key]: v }))}>{c.fmt(v)}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {exp && (
        <>
          <div className="pair three">
            {METHODS.map((k) => (
              <figure key={k.id}>
                <MaskMap mask={toGrid(m[k.id].example, n)} color={k.color} splitHalf={withTrend} />
                <figcaption>
                  <b className={k.tone}>{k.label}</b>{' '}
                  {withTrend
                    ? <>finds <strong className={k.tone}>{pc(m[k.id].power?.mean)}</strong> of the real trend; flags {pc(m[k.id].false_alarm.mean)} of the empty half.</>
                    : <>flags <strong className={k.tone}>{pc(m[k.id].false_alarm.mean)}</strong> of places. All of it is fake.</>}
                  <span className="how">{k.how}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <table className="labtable">
            <caption>Average over {exp.params.reps} independent maps (seeds {exp.params.seeds[0]}–{exp.params.seeds[1]}), with the 95% range across maps</caption>
            <thead>
              <tr><th scope="col">Measure</th>{METHODS.map((k) => <th scope="col" key={k.id} className={k.tone}>{k.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}<span>{r.good} is better</span></th>
                  {METHODS.map((k) => {
                    const s = m[k.id][r.key]
                    return <td key={k.id}><strong>{pc(s?.mean)}</strong> <span>{range(s)}</span></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {withTrend && m.fdr.power && m.fdr.power.mean < 0.8 && (
            <p className="callout" role="note">
              Here the honest verdict finds only {pc(m.fdr.power.mean)} of a real trend. Sticky, short or gappy data carries
              less independent information, so an honest verdict needs a longer record. The usual test only looks better
              because it also flags {pc(m.naive.false_alarm.mean)} of the trend-free half.
            </p>
          )}
          <p className="small">
            Synthetic AR(1) noise, not NASA data. The map shown is the first of the {exp.params.reps}. Rebuild or check any
            number with backend/scripts/build_lab.py.
          </p>
        </>
      )}
    </div>
  )
}
