import { useEffect, useState } from 'react'
import Plot from '../components/Plot'
import { api } from '../api'

const DIVERGING = [[0, '#0072b2'], [0.5, 'rgba(127,127,127,0.12)'], [1, '#d55e00']]
const REGIME_COLORS = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00']

function sigPoints(scan, clusterMap) {
  const x = []
  const y = []
  clusterMap.forEach((row, i) => row.forEach((v, j) => {
    if (v !== 0) { x.push(scan.lons[j]); y.push(scan.lats[i]) }
  }))
  return { x, y }
}

function VariableMap({ scan, id }) {
  const v = scan.variables[id]
  const pts = sigPoints(scan, v.cluster_map)
  return (
    <Plot
      data={[
        { z: v.z, x: scan.lons, y: scan.lats, type: 'heatmap', colorscale: DIVERGING,
          zmin: -6, zmax: 6, zmid: 0, showscale: false, xgap: 1, ygap: 1,
          hovertemplate: '%{y:.1f}N %{x:.2f}E<br>trend strength z = %{z:.1f}<extra></extra>' },
        { x: pts.x, y: pts.y, type: 'scatter', mode: 'markers', hoverinfo: 'skip',
          marker: { symbol: 'square-open', size: 10, color: '#f0e442', line: { width: 2 } } },
      ]}
      layout={{
        title: { text: `${v.name} (${v.period[0].slice(0, 4)}-${v.period[1].slice(0, 4)})`, font: { size: 13 } },
        height: 260, margin: { l: 35, r: 10, t: 35, b: 30 }, showlegend: false,
        font: { color: '#8a94a6' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        yaxis: { scaleanchor: 'x', constrain: 'domain', gridcolor: 'rgba(127,127,127,0.15)' },
        xaxis: { constrain: 'domain', gridcolor: 'rgba(127,127,127,0.15)' },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}

function RegimeMap({ scan }) {
  const r = scan.regimes
  if (!r.k) return <p className="lead">{r.note}</p>
  const scale = r.regimes.map((_, i) => [
    [i / r.k, REGIME_COLORS[i]], [(i + 1) / r.k, REGIME_COLORS[i]]]).flat()
  const z = r.label_map.map((row) => row.map((v) => (v < 0 ? null : v + 0.5)))
  return (
    <div className="regimes">
      <Plot
        data={[{ z, x: scan.lons, y: scan.lats, type: 'heatmap', colorscale: scale, zmin: 0, zmax: r.k,
          showscale: false, xgap: 1, ygap: 1, hoverinfo: 'skip' }]}
        layout={{ title: { text: 'Trend regimes (k-means)', font: { size: 13 } }, height: 280,
          margin: { l: 35, r: 10, t: 35, b: 30 }, font: { color: '#8a94a6' },
          paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
          xaxis: { constrain: 'domain', gridcolor: 'rgba(127,127,127,0.15)' },
          yaxis: { scaleanchor: 'x', constrain: 'domain', gridcolor: 'rgba(127,127,127,0.15)' } }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
      <ul className="legend">
        {r.regimes.map((g, i) => (
          <li key={g.id}><span className="swatch" style={{ background: REGIME_COLORS[i] }} />
            {g.label} · {g.pixels} pixels</li>
        ))}
      </ul>
      <p className="card-small">{r.note} Separation score (silhouette) {r.silhouette.toFixed(2)}.</p>
    </div>
  )
}

export default function ScanView() {
  const [presets, setPresets] = useState([])
  const [box, setBox] = useState([9.5, 13.5, 77.0, 81.0])
  const [scan, setScan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(b = box) {
    setBusy(true)
    setError('')
    try {
      setScan(await api.scan(b))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    api.scanPresets().then(setPresets).catch((e) => setError(e.message))
  }, [])

  const s = scan?.summary
  const labels = ['Lat min', 'Lat max', 'Lon min', 'Lon max']

  return (
    <section>
      <h2>Scan a region</h2>
      <p className="lead">
        We test every grid point for 5 NASA variables at once, then keep only the trend clusters that are
        stronger than chance (199 shuffles of time) and control false discoveries across all tests.
      </p>
      <div className="controls wrap">
        {presets.map((p) => (
          <button key={p.id} className="chip" onClick={() => { setBox(p.bbox); run(p.bbox) }}>{p.name}</button>
        ))}
        {labels.map((label, i) => (
          <label key={label}>{label}
            <input type="number" step="0.5" value={box[i]}
              onChange={(e) => setBox(box.map((v, k) => (k === i ? Number(e.target.value) : v)))} />
          </label>
        ))}
        <button onClick={() => run()} disabled={busy}>{busy ? 'Scanning (new regions take ~30 s)…' : 'Scan'}</button>
      </div>
      <p className="card-small">Box sides must be 2 to 5 degrees (NASA POWER limit).</p>
      {error && <p className="error" role="alert">{error}</p>}
      {scan && (
        <>
          <div className="scoreboard four">
            <div className="card info"><div className="card-label">Trend tests run</div><div className="card-huge">{s.n_tests}</div></div>
            <div className="card naive"><div className="card-label">Usual method: "significant"</div><div className="card-huge">{s.naive_hits}</div></div>
            <div className="card honest"><div className="card-label">After honest test + FDR</div><div className="card-huge">{s.fdr_hits}</div></div>
            <div className="card honest"><div className="card-label">Clusters stronger than chance</div><div className="card-huge">{s.significant_clusters}</div></div>
          </div>
          <h3>What we found</h3>
          <ol className="findings">{scan.findings.map((f) => <li key={f}>{f}</li>)}</ol>
          <h3>Trend maps</h3>
          <p className="card-small">Orange = rising, blue = falling (Mann-Kendall z after removing autocorrelation). Yellow boxes = part of a cluster that passed the permutation test.</p>
          <div className="maps three">
            {Object.keys(scan.variables).map((id) => <VariableMap key={id} scan={scan} id={id} />)}
          </div>
          <h3>Places changing the same way</h3>
          <RegimeMap scan={scan} />
          <h3>Limits</h3>
          <ul className="card-small">{scan.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="source">Source: {scan.source}</p>
        </>
      )}
    </section>
  )
}
