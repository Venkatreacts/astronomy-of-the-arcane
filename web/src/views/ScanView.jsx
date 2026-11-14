import { useEffect, useState } from 'react'
import Plot from '../components/Plot'
import { api } from '../api'

// purple = falling, green = rising: orange and blue are reserved for the two tests
const DIVERGING = [[0, '#cc79a7'], [0.5, 'rgba(127,127,127,0.12)'], [1, '#009e73']]
const REGIME_COLORS = ['#009e73', '#cc79a7', '#f0e442', '#e9eef2', '#7f8a96']

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

function Locator({ presets, active, onPick }) {
  const boxes = presets.map((p) => {
    const [a, b, c, d] = p.bbox
    // clockwise ring: the other winding makes geo fill everything outside the box
    return { type: 'scattergeo', mode: 'lines', lat: [a, b, b, a, a], lon: [c, c, d, d, c], customdata: Array(5).fill(p.id),
      fill: 'toself', fillcolor: p.id === active ? 'rgba(86,180,233,0.35)' : 'rgba(233,238,242,0.12)',
      line: { color: p.id === active ? '#56b4e9' : '#8b96a2', width: 1.5 }, hovertemplate: `${p.name}<extra></extra>` }
  })
  return (
    <Plot
      data={boxes}
      layout={{ height: Math.round(Math.min(300, window.innerWidth * 0.55)), margin: { l: 0, r: 0, t: 0, b: 0 },
        showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)',
        geo: { projection: { type: 'natural earth' }, showland: true, landcolor: '#141d26', showocean: true,
          oceancolor: '#070b10', showframe: false, coastlinecolor: '#2b3947', bgcolor: 'rgba(0,0,0,0)',
          lataxis: { range: [-50, 75] } } }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
      onClick={(e) => { const id = e?.points?.[0]?.customdata; if (id) onPick(presets.find((p) => p.id === id)) }}
    />
  )
}

export default function ScanView() {
  const [presets, setPresets] = useState([])
  const [active, setActive] = useState(null)
  const [box, setBox] = useState([9.5, 13.5, 77.0, 81.0])
  const [scan, setScan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(b = box, preset = null) {
    setBusy(true)
    setError('')
    setActive(preset?.id ?? null)
    try {
      // Presets are pre-computed into the web app (works offline); a custom box needs the live backend.
      setScan(preset ? await api.scanPreset(preset.id).catch(() => api.scan(b)) : await api.scan(b))
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'A custom box needs the backend running for live NASA data. The listed regions work offline.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    api.scanPresets().then((list) => {
      setPresets(list)
      if (list[0]) { setBox(list[0].bbox); run(list[0].bbox, list[0]) }
    }).catch((e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const s = scan?.summary
  const labels = ['Lat min', 'Lat max', 'Lon min', 'Lon max']
  const pick = (p) => { setBox(p.bbox); run(p.bbox, p) }

  return (
    <div className="scanner">
      <h2>Scan a whole region</h2>
      <p className="lead">
        Every 0.5° grid point, five NASA variables, both tests. Then we keep only trend clusters stronger than
        chance (199 shuffles of time) and control false discoveries across all the tests at once.
      </p>
      <div className="investigate"><div className="row">
        <Locator presets={presets} active={active} onPick={pick} />
        <div>
          <div className="chips">
            {presets.map((p) => (
              <button key={p.id} className={`chip ${p.id === active ? 'on' : ''}`} disabled={busy} onClick={() => pick(p)}>{p.name}</button>
            ))}
          </div>
          <div className="fields">
            {labels.map((label, i) => (
              <label key={label}>{label}
                <input type="number" step="0.5" value={box[i]}
                  onChange={(e) => setBox(box.map((v, k) => (k === i ? Number(e.target.value) : v)))} />
              </label>
            ))}
            <button className="primary" onClick={() => run()} disabled={busy}>{busy ? 'Scanning…' : 'Scan this box'}</button>
          </div>
          <p className="small">Box sides 2 to 5 degrees (NASA POWER limit). A new box takes about 30 seconds.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div></div>
      {scan && (
        <>
          <p className="claim wide">
            {s.n_tests.toLocaleString()} trend tests. The usual test calls <strong className="u">{s.naive_hits}</strong> of
            them a trend; after the honest test and false-discovery control, <strong className="h">{s.fdr_hits}</strong> remain,
            in <strong className="h">{s.significant_clusters}</strong> cluster{s.significant_clusters === 1 ? '' : 's'} stronger than chance.
          </p>
          <h3>What we found</h3>
          <ol className="findings">{scan.findings.map((f) => <li key={f}>{f}</li>)}</ol>
          <h3>Trend maps</h3>
          <p className="small">Green = rising, purple = falling (trend strength after removing stickiness). Yellow squares = part of a cluster that beat the shuffles.</p>
          <div className="maps three">
            {Object.keys(scan.variables).map((id) => <VariableMap key={id} scan={scan} id={id} />)}
          </div>
          <h3>Places changing the same way</h3>
          <RegimeMap scan={scan} />
          <h3>Limits</h3>
          <ul className="small">{scan.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="source">Source: {scan.source}</p>
        </>
      )}
    </div>
  )
}
