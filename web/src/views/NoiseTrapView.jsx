import { useState } from 'react'
import MaskMap from '../components/MaskMap'
import { api } from '../api'

const pct = (x) => `${(x * 100).toFixed(1)}%`

export default function NoiseTrapView() {
  const [phi, setPhi] = useState(0.5)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(trend) {
    setBusy(true)
    setError('')
    try {
      setResult(await api.noiseTrap({ phi, trend }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const withTrend = result?.params?.trend_sd_per_decade > 0

  return (
    <section>
      <h2>The Noise Trap</h2>
      <p className="lead">
        Step 1: a map of <strong>pure random noise</strong>, 25 years of fake monthly data with no trend anywhere.
        Every pixel called "significant" is a false alarm. Step 2: we add a <strong>real trend</strong> to the left
        half only. A good method lights up the left half and stays quiet on the right.
      </p>
      <div className="controls wrap">
        <label>
          How "sticky" the noise is (φ = {phi.toFixed(1)})
          <input type="range" min="0" max="0.9" step="0.1" value={phi}
            onChange={(e) => setPhi(Number(e.target.value))} />
        </label>
        <button onClick={() => run(0)} disabled={busy}>1. Run on pure noise</button>
        <button onClick={() => run(0.8)} disabled={busy}>2. Now add a real trend</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {result && !withTrend && (
        <div className="scoreboard">
          <div className="card naive">
            <div className="card-label">Usual method says "significant"</div>
            <div className="card-huge">{pct(result.naive_fraction)}</div>
            <div className="card-small">of the map. All of it is fake.</div>
          </div>
          <div className="card honest">
            <div className="card-label">Noise Trap says "significant"</div>
            <div className="card-huge">{pct(result.honest_fraction)}</div>
            <div className="card-small">Autocorrelation removed + false discovery rate control.</div>
          </div>
        </div>
      )}
      {result && withTrend && (
        <div className="scoreboard">
          <div className="card naive">
            <div className="card-label">Usual method</div>
            <div className="card-big">Finds {pct(result.naive_left_fraction)} of the real trend</div>
            <div className="card-small">but also flags {pct(result.naive_right_fraction)} of the trend-free half (fake).</div>
          </div>
          <div className="card honest">
            <div className="card-label">Noise Trap</div>
            <div className="card-big">Finds {pct(result.honest_left_fraction)} of the real trend</div>
            <div className="card-small">and flags {pct(result.honest_right_fraction)} of the trend-free half.</div>
          </div>
        </div>
      )}
      {result && (
        <div className="maps">
          <MaskMap mask={result.naive_mask} color="#d55e00" splitHalf={withTrend}
            title={withTrend ? 'Usual method (real trend on the left)' : 'Usual method: fake trends found'} />
          <MaskMap mask={result.honest_mask} color="#0072b2" splitHalf={withTrend}
            title={withTrend ? 'Noise Trap (real trend on the left)' : 'Noise Trap: fake trends found'} />
        </div>
      )}
      {withTrend && result.honest_left_fraction < 0.8 && (
        <p className="callout" role="note">
          At this stickiness (φ = {phi.toFixed(1)}) the honest method finds only {pct(result.honest_left_fraction)} of
          the real trend. Very sticky data carries less independent information, so it needs a longer record before
          any honest test can be sure. The usual method looks better here only because it also flags
          {' '}{pct(result.naive_right_fraction)} of the trend-free half.
        </p>
      )}
      {withTrend && (
        <p className="card-small">
          The real trend is 0.8 noise-widths per decade. Weaker trends need more years: the honest method finds
          about 42% of a 0.4 trend and almost none of a 0.2 trend in 25 years. That is the price of not being fooled.
        </p>
      )}
    </section>
  )
}
