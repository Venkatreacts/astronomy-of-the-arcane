// Side-by-side verdicts: plain Mann-Kendall vs the Noise Trap (pre-whitened) test.

// 3 significant figures; scientific notation for very large or tiny numbers (e.g. NO2 in molecules/cm2).
function fmt(x, signed = false) {
  const a = Math.abs(x)
  const s = a !== 0 && (a >= 1e4 || a < 1e-3) ? x.toExponential(2) : Number(x.toPrecision(3)).toString()
  return signed && x > 0 ? `+${s}` : s
}

function Card({ label, result, units, tone }) {
  const verdict = result.significant
    ? `Significant: ${result.direction}`
    : 'No clear trend yet'
  const ci = result.slope_ci_per_year
  return (
    <div className={`card verdict ${tone}`}>
      <div className="card-label">{label}</div>
      <div className="card-big">{verdict}</div>
      <div className="card-small">
        Rate {fmt(result.slope_per_year * 10, true)} {units} per decade
        {ci && ` (95% range ${fmt(ci[0] * 10, true)} to ${fmt(ci[1] * 10, true)})`} · p = {result.p.toFixed(3)}
      </div>
    </div>
  )
}

export default function Verdict({ analysis, units }) {
  const { naive, honest, years_more_needed: more, record_years: rec, noise } = analysis
  const disagree = naive.significant !== honest.significant
  return (
    <div className="verdicts">
      <Card label="Usual method (plain Mann-Kendall)" result={naive} units={units} tone="naive" />
      <Card label="Noise Trap (autocorrelation removed)" result={honest} units={units} tone="honest" />
      <div className="card verdict info">
        <div className="card-label">When will we know?</div>
        {honest.significant ? (
          <div className="card-big">Already detectable</div>
        ) : more == null ? (
          <div className="card-big">No measurable trend</div>
        ) : (
          <div className="card-big">≈ {Math.ceil(more)} more years</div>
        )}
        <div className="card-small">
          {rec.toFixed(0)} years of data so far · month-to-month "stickiness" φ = {noise.phi.toFixed(2)}
        </div>
      </div>
      {disagree && (
        <p className="callout" role="note">
          The two methods disagree. This series is "sticky" (each month resembles the last), which makes
          the usual test see a trend too easily. Treat the usual verdict with caution.
        </p>
      )}
    </div>
  )
}
