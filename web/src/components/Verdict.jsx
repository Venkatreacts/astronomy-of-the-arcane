// Side-by-side verdicts: plain Mann-Kendall vs the Noise Trap (pre-whitened) test.

// 3 significant figures; scientific notation for very large or tiny numbers (e.g. NO2 in molecules/cm2).
function fmt(x, signed = false) {
  const a = Math.abs(x)
  const s = a !== 0 && (a >= 1e4 || a < 1e-3) ? x.toExponential(2) : Number(x.toPrecision(3)).toString()
  return signed && x > 0 ? `+${s}` : s
}

function Row({ label, result, units, tone }) {
  const ci = result.slope_ci_per_year
  return (
    <div className={`vrow ${tone}`}>
      <dt>{label}</dt>
      <dd>
        <span className="vword">{result.significant ? `Trend: ${result.direction}` : 'No clear trend yet'}</span>
        <span className="small">
          Rate {fmt(result.slope_per_year * 10, true)} {units} per decade
          {ci && ` (95% range ${fmt(ci[0] * 10, true)} to ${fmt(ci[1] * 10, true)})`} · p = {result.p.toFixed(3)}
        </span>
      </dd>
    </div>
  )
}

export default function Verdict({ analysis, units }) {
  const { naive, honest, years_more_needed: more, record_years: rec, noise } = analysis
  const disagree = naive.significant !== honest.significant
  return (
    <>
      <dl className="verdicts">
        <Row label="Usual test" result={naive} units={units} tone="u" />
        <Row label="Honest test" result={honest} units={units} tone="h" />
        <div className="vrow">
          <dt>When will we know?</dt>
          <dd>
            <span className="vword">
              {honest.significant ? 'Already detectable' : more == null ? 'No measurable trend' : `About ${Math.ceil(more)} more years`}
            </span>
            <span className="small">{rec.toFixed(0)} years of data so far · each month resembles the last by φ = {noise.phi.toFixed(2)}</span>
          </dd>
        </div>
      </dl>
      {disagree && (
        <p className="callout" role="note">
          The two tests disagree. This series is sticky (each month resembles the last), which makes the usual
          test see a trend too easily. Do not trust the usual verdict here.
        </p>
      )}
    </>
  )
}
