// The three stages for one place, in the same order and with the same labels as every other view.
// One place is one test, so the honest verdict follows the single-place rule (stage 2).
import { baseMean, fmt, howMuch, peq, rate } from '../lib/format'
import { RULE, STAGE } from '../lib/stages'

// rule = 'season' when one of four seasons is shown: its honest verdict is the four-season FDR result.
export function Stages({ naive, pw, honest = pw, rule = 'place' }) {
  return (
    <dl className="verdicts three">
      <div className="vrow u">
        <dt>1 · {STAGE.usual}</dt>
        <dd><span className="vword">{naive.significant ? 'Trend' : 'No trend'}</span>
          <span className="small">Mann-Kendall on the anomalies · {peq(naive.p)}</span></dd>
      </div>
      <div className="vrow pw">
        <dt>2 · {STAGE.pw}</dt>
        <dd><span className="vword">{pw.significant ? 'Trend' : 'No trend'}</span>
          <span className="small">same test after pre-whitening · {peq(pw.p)}</span></dd>
      </div>
      <div className="vrow h">
        <dt>3 · {STAGE.honest}</dt>
        <dd><span className="vword">{honest.significant ? 'Trend is real' : 'Not proven'}</span>
          <span className="small rule">{RULE[rule]}</span></dd>
      </div>
    </dl>
  )
}

// A case-file series: the stages, the size of the change in human terms, and how long until we know.
export default function Verdict({ series }) {
  const { analysis: a, units, dates, values } = series
  const { naive, honest: pw, years_more_needed: more, record_years: rec, noise } = a
  const ci = pw.slope_ci_per_year
  return (
    <>
      <Stages naive={naive} pw={pw} />
      <p className="small">
        Rate {howMuch(pw.slope_per_year * 10, units, dates[0], dates[dates.length - 1], baseMean(dates, values))}
        {ci && ` (95% range ${rate(ci[0] * 10)} to ${rate(ci[1] * 10)} per decade, Sen's slope)`}.{' '}
        {pw.significant ? 'Already detectable.' : more == null ? 'No measurable trend.' : `About ${Math.ceil(more)} more years of data needed.`}{' '}
        {rec.toFixed(0)} years so far; each month resembles the last by φ = {fmt(noise.phi, false, 2)}.
      </p>
      {naive.significant !== pw.significant && (
        <p className="callout" role="note">
          The tests disagree. This series is sticky (each month resembles the last), which makes the usual
          test see a trend too easily. Do not trust the usual verdict here.
        </p>
      )}
    </>
  )
}
