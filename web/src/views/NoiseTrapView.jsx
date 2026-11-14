import { useState } from 'react'
import Plot from '../components/Plot'
import { api } from '../api'

function MaskMap({ mask, title, color }) {
  return (
    <Plot
      data={[{ z: mask, type: 'heatmap', showscale: false, hoverinfo: 'skip',
        colorscale: [[0, 'rgba(127,127,127,0.15)'], [1, color]], zmin: 0, zmax: 1, xgap: 1, ygap: 1 }]}
      layout={{ title: { text: title, font: { size: 14 } }, height: 300,
        margin: { l: 10, r: 10, t: 40, b: 10 },
        xaxis: { visible: false }, yaxis: { visible: false, scaleanchor: 'x' },
        font: { color: '#8a94a6' },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' }}
      config={{ displayModeBar: false, staticPlot: true }}
      style={{ width: '100%' }}
    />
  )
}

export default function NoiseTrapView() {
  const [phi, setPhi] = useState(0.5)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true)
    setError('')
    try {
      setResult(await api.noiseTrap({ phi }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pct = (x) => `${(x * 100).toFixed(1)}%`

  return (
    <section>
      <h2>The Noise Trap</h2>
      <p className="lead">
        We make a map of <strong>pure random noise</strong>: 25 years of fake monthly data, with no trend
        anywhere. Every pixel the method calls "significant" is a false alarm.
      </p>
      <div className="controls">
        <label>
          How "sticky" the noise is (φ = {phi.toFixed(1)})
          <input type="range" min="0" max="0.9" step="0.1" value={phi}
            onChange={(e) => setPhi(Number(e.target.value))} />
        </label>
        <button onClick={run} disabled={busy}>Run on pure noise</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <>
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
          <div className="maps">
            <MaskMap mask={result.naive_mask} title="Usual method: fake trends found" color="#d55e00" />
            <MaskMap mask={result.honest_mask} title="Noise Trap: fake trends found" color="#0072b2" />
          </div>
        </>
      )}
    </section>
  )
}
