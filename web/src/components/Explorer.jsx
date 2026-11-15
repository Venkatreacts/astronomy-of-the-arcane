// Steps 3 to 5 of an investigation, shared by "Your place" and "Scan a region": choose a time frame and season,
// see the time series, and test it (three stages, the classroom t-test, the four seasons, the year it became
// provable). Every number comes from the Python engine through POST /api/explore, or from a pre-computed file.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import SeriesChart from './SeriesChart'
import { Stages } from './Verdict'
import { baseMean, howMuch, peq, rate } from '../lib/format'
import { FIRST, LAST, SEASONS, SHORT, frameLabel, isDefault, seasonName } from '../lib/frame'
import { CLASSROOM, RULE, STAGE } from '../lib/stages'
import { seriesCard } from '../lib/card'

const YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, k) => FIRST + k)

// The five steps from the challenge brief: variable, region, time frame, time series, significance.
export function Step({ n, title }) {
  return <h3 className="step"><span className="stepn">{n}</span>{title}</h3>
}

function Classroom({ ols, units }) {
  if (!ols) return null
  return (
    <dl className="verdicts classroom">
      <div className="vrow c">
        <dt>{CLASSROOM}</dt>
        <dd><span className="vword">{ols.significant ? 'Trend' : 'No trend'}</span>
          <span className="small">ordinary least squares · {rate(ols.slope_per_year * 10)} {units} per decade, 95% confidence
            interval {rate(ols.slope_ci_per_year[0] * 10)} to {rate(ols.slope_ci_per_year[1] * 10)} · t-test {peq(ols.p)}</span></dd>
      </div>
      <p className="small why">
        It can disagree with the honest verdict because the t-test assumes every value is independent and bell-shaped,
        so sticky months make it too sure of a trend, while skewed data such as rain can make it miss one.
      </p>
    </dl>
  )
}

function SeasonTable({ seasons, units, current }) {
  if (!seasons) return null
  return (
    <table className="halves seasons">
      <caption>The four seasons (one value per year: the season mean)</caption>
      <thead><tr><th scope="col">Season</th><th scope="col">Rate per decade</th><th scope="col" className="u">{STAGE.usual}</th>
        <th scope="col" className="h">{STAGE.honest}</th></tr></thead>
      <tbody>
        {seasons.rows.map((r) => (
          <tr key={r.season} className={r.season === current ? 'on' : ''}>
            <th scope="row">{r.name}</th>
            {r.tested ? (
              <>
                <td>{rate(r.rate_per_year * 10)} {units}</td>
                <td>{r.usual ? 'trend' : 'no trend'}, {peq(r.p_usual)}</td>
                <td>{r.honest ? 'trend is real' : 'not proven'}, {peq(r.p_honest)}</td>
              </>
            ) : <td colSpan="3">too few complete years to test</td>}
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan="4" className="small">{RULE.season}
        {seasons.threshold > 0 ? ` Here a season needs p ≤ ${seasons.threshold.toPrecision(2)}.` : ' Here no season passes.'}</td></tr></tfoot>
    </table>
  )
}

function Provable({ provable, frame }) {
  if (!provable) return null
  const { first_year: first, steps, years_more_needed: more } = provable
  if (!steps.length) {
    return (
      <div className="provable">
        <h4>Year it became provable</h4>
        <p className="small">Needs a time frame of at least {SHORT + 1} years: the first check is the record {frame.start}–{frame.start + SHORT}.</p>
      </div>
    )
  }
  return (
    <div className="provable">
      <h4>Year it became provable</h4>
      <p>
        {first
          ? <><strong className="h">{first}</strong>. With the record starting in {frame.start}, the {STAGE.honest.toLowerCase()} says
            “trend is real” for every end year from {first} to {frame.end}.</>
          : <><strong>Not provable yet</strong>{more != null && more > 0 ? `, about ${Math.ceil(more)} more years` : ''}.
            {more == null ? ' At this rate there is no trend to detect.' : ''}</>}
      </p>
      {steps.length > 0 && (
        <div className="yearstrip" role="img" aria-label={`Honest verdict for records ending ${steps[0].end} to ${steps[steps.length - 1].end}`}>
          {steps.map((s) => <span key={s.end} className={s.real ? 'real' : ''} title={`${frame.start}–${s.end}: ${s.real ? 'trend is real' : 'not proven'}, ${peq(s.p)}`} />)}
        </div>
      )}
      <p className="small">
        The honest verdict repeated on records {frame.start}–{frame.start + SHORT} up to {frame.start}–{frame.end}, all months
        (single-place rule). Blue = trend is real for a record ending that year.
      </p>
    </div>
  )
}

// data: { dates, values, units, name } (monthly). preset: the default frame, pre-computed. fallback: the default
// frame built from a record the page already has, used when the live server cannot be reached.
export default function Explorer({ data, preset = null, fallback = null, frame, onFrame, card, children }) {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const req = useRef(0)

  useEffect(() => {
    if (!data) return
    const id = ++req.current
    if (isDefault(frame) && preset) { setRes(preset); setNote(''); return }
    setBusy(true)
    api.explore({ dates: data.dates, values: data.values, ...frame })
      .then((r) => { if (id === req.current) { setRes(r); setNote('') } })
      .catch((e) => {
        if (id !== req.current) return
        const offline = /reach|fetch|NetworkError|Failed/i.test(e.message)
        if (isDefault(frame) && fallback) {
          setRes(fallback)
          setNote(offline ? 'The four seasons, the classroom method and the provable year need the live server; the three stages below are pre-computed.' : e.message)
        } else {
          setNote(offline ? 'A different time frame or season needs the live server, which is not reachable. The listed regions and globe points still open with 1981–2025, all months.' : e.message)
        }
      })
      .finally(() => { if (id === req.current) setBusy(false) })
  }, [data, frame.start, frame.end, frame.season]) // eslint-disable-line react-hooks/exhaustive-deps

  const span = frame.end - frame.start + 1
  const s = res?.series
  const yearly = s?.kind === 'season'
  const st = res?.stages
  const label = res ? frameLabel({ start: res.frame.start, end: res.frame.end, season: res.season }) : ''
  const first = res && `${res.frame.start}-01`
  const last = res && `${res.frame.end}-12`

  return (
    <div className="explorer" aria-busy={busy}>
      <Step n={3} title="Choose a time frame" />
      <div className="fields frame">
        <label>From
          <select value={frame.start} onChange={(e) => onFrame({ start: Number(e.target.value) })}>
            {YEARS.filter((y) => y <= frame.end - 4).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>To
          <select value={frame.end} onChange={(e) => onFrame({ end: Number(e.target.value) })}>
            {YEARS.filter((y) => y >= frame.start + 4).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>Season
          <select value={frame.season} onChange={(e) => onFrame({ season: e.target.value })}>
            {SEASONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        {!isDefault(frame) && <button type="button" onClick={() => onFrame({ start: FIRST, end: LAST, season: 'all' })}>Whole record</button>}
      </div>
      {span < SHORT && <p className="callout" role="note">Short record. A real trend may not show yet.</p>}
      <p className="small">
        {span} years{frame.season === 'all' ? ', every month (seasons removed by subtracting each calendar month’s mean)'
          : `, ${seasonName(frame.season)} only: one value per year, the mean of the season’s three months${frame.season === 'DJF' ? ' (December counts with the January and February after it)' : ''}`}.
      </p>
      {note && <p className="note" role="status">{note}</p>}

      {res && (
        <>
          <Step n={4} title="The time series" />
          <SeriesChart perYear={yearly ? 1 : 12} toggle={!yearly}
            series={{ dates: s.dates, values: s.values, units: data.units, name: `${data.name} · ${label}`,
              analysis: { anomalies: s.anomalies, honest: st.honest } }} />

          <Step n={5} title="Test for significance" />
          <Stages naive={st.naive} pw={st.pw ?? st.honest} honest={st.honest} rule={res.rule} />
          <p className="small rate">
            Rate {howMuch(st.honest.slope_per_year * 10, data.units, first, last, yearly ? null : baseMean(s.dates, s.values))}
            {st.honest.slope_ci_per_year && ` (95% range ${rate(st.honest.slope_ci_per_year[0] * 10)} to ${rate(st.honest.slope_ci_per_year[1] * 10)} per decade, Sen's slope)`}.
          </p>
          <Classroom ols={res.ols} units={data.units} />
          <Provable provable={res.provable} frame={res.frame} />
          <SeasonTable seasons={res.seasons} units={data.units} current={res.season} />
          {isDefault(frame) && children}
          {card && (
            <div className="exports">
              <button onClick={() => seriesCard({ ...card, res, units: data.units, label, link: window.location.href })}>Download verdict card</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
