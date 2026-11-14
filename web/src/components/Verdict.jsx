// Side-by-side verdicts: plain Mann-Kendall vs the Noise Trap (pre-whitened) test.

function fmtRate(slopePerYear, units) {
  const perDecade = slopePerYear * 10
  const sign = perDecade > 0 ? '+' : ''
  return `${sign}${perDecade.toFixed(3)} ${units} per decade`
}

function Card({ label, result, units, tone }) {
  const verdict = result.significant
    ? `Significant: ${result.direction}`
    : 'No clear trend yet'
  return (
    <div className={`card verdict ${tone}`}>
      <div className="card-label">{label}</div>
      <div className="card-big">{verdict}</div>
      <div className="card-small">
        Rate {fmtRate(result.slope_per_year, units)} · p = {result.p.toFixed(3)}
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
