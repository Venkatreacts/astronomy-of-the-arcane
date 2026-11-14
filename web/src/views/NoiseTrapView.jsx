import { useEffect, useState } from 'react'
import MaskMap from '../components/MaskMap'
import { api } from '../api'

const pct = (x) => `${(x * 100).toFixed(1)}%`

export default function NoiseTrapView() {
  const [phi, setPhi] = useState(0.5)
  const [trend, setTrend] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // Pre-built maps load in milliseconds, so the plate always shows the current setting.
  useEffect(() => {
    api.noiseTrap({ phi, trend }).then(setResult).catch((e) => setError(e.message))
  }, [phi, trend])

  const withTrend = result?.params?.trend_sd_per_decade > 0

  return (
    <div className="trap">
      <h2>The trap: trends in pure noise</h2>
      <p className="lead">
        Here is 25 years of fake monthly data for 400 places, with <strong>no trend anywhere</strong>. Each month
        is made to resemble the month before, the way real weather does. Every square the usual test lights up
        is a false alarm.
      </p>
      <div className="controls">
        <label className="slider">
          <span>How much each month resembles the last: φ = {phi.toFixed(1)}</span>
          <input type="range" min="0" max="0.9" step="0.1" value={phi}
            onChange={(e) => setPhi(Number(e.target.value))} />
        </label>
        <div className="switch" role="group" aria-label="What the fake data contains">
          <button className={trend === 0 ? 'on' : ''} aria-pressed={trend === 0} onClick={() => setTrend(0)}>Pure noise</button>
          <button className={trend > 0 ? 'on' : ''} aria-pressed={trend > 0} onClick={() => setTrend(0.8)}>Add a real trend on the left</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className="pair">
          <figure>
            <MaskMap mask={result.naive_mask} color="#d55e00" splitHalf={withTrend} />
            <figcaption>
              <b className="u">Usual test</b>
              {withTrend
                ? <> finds {pct(result.naive_left_fraction)} of the real trend, and also flags {pct(result.naive_right_fraction)} of the empty half.</>
                : <> calls <strong className="u">{pct(result.naive_fraction)}</strong> of the map a trend. All of it is fake.</>}
            </figcaption>
          </figure>
          <figure>
            <MaskMap mask={result.honest_mask} color="#0072b2" splitHalf={withTrend} />
            <figcaption>
              <b className="h">Honest test</b>
              {withTrend
                ? <> finds {pct(result.honest_left_fraction)} of the real trend and flags {pct(result.honest_right_fraction)} of the empty half.</>
                : <> calls <strong className="h">{pct(result.honest_fraction)}</strong> a trend, after removing the stickiness and correcting for 400 tests at once.</>}
            </figcaption>
          </figure>
        </div>
      )}
      {withTrend && result.honest_left_fraction < 0.8 && (
        <p className="callout" role="note">
          At φ = {phi.toFixed(1)} the honest test finds only {pct(result.honest_left_fraction)} of the real trend.
          Data this sticky carries less independent information, so any honest test needs a longer record to be sure.
          The usual test only looks better because it also flags {pct(result.naive_right_fraction)} of the empty half.
        </p>
      )}
      {withTrend && (
        <p className="small">
          The planted trend is 0.8 noise-widths per decade. Weaker trends need more years: in 25 years the honest test
          finds about 42% of a 0.4 trend and almost none of a 0.2 trend. That is the price of not being fooled.
        </p>
      )}
    </div>
  )
}
