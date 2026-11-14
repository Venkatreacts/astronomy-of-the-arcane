import { useEffect, useMemo, useState } from 'react'
import Plot from '../components/Plot'
import { api } from '../api'
import { deg, fmt, pct, pval } from '../lib/format'

// purple = falling, green = rising: orange and blue are reserved for the tests. The middle is an opaque
// dark grey, so a weak trend is visibly "near zero" instead of looking like an empty map.
const DIVERGING = [[0, '#cc79a7'], [0.5, '#2a3540'], [1, '#009e73']]
const REGIME_COLORS = ['#009e73', '#cc79a7', '#f0e442', '#e9eef2', '#7f8a96']
const OVERLAYS = [
  { id: 'naive', label: 'Usual test', key: 'naive_mask', color: '#d55e00' },
  { id: 'pw', label: 'Stickiness removed', key: 'prewhitened_mask', color: '#56b4e9' },
  { id: 'fdr', label: 'Honest (FDR)', key: 'fdr_mask', color: '#0072b2' },
  { id: 'cluster', label: 'Clusters', key: 'cluster_map', color: '#f0e442' },
]
const AXIS = { gridcolor: 'rgba(139,150,162,0.12)', linecolor: '#2b3947', ticks: 'outside', ticklen: 3, tickfont: { size: 11 } }

const cellsOf = (scan, grid, test) => {
  const x = []
  const y = []
  grid?.forEach((row, i) => row.forEach((v, j) => { if (test(v)) { x.push(scan.lons[j]); y.push(scan.lats[i]) } }))
  return { x, y }
}

function geoLayout(scan, height) {
  const midLat = (scan.lats[0] + scan.lats[scan.lats.length - 1]) / 2
  return {
    height, margin: { l: 56, r: 8, t: 34, b: 46 }, showlegend: false,
    font: { color: '#8b96a2', family: 'Barlow, sans-serif' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    hoverlabel: { bgcolor: '#0b1016', bordercolor: '#33414f', font: { color: '#e9eef2' } },
    xaxis: { ...AXIS, ticksuffix: '°', constrain: 'domain', title: { text: 'longitude (− = west)', font: { size: 11 } } },
    // a degree of longitude is cos(latitude) as long as a degree of latitude
    yaxis: { ...AXIS, ticksuffix: '°', title: { text: 'latitude', font: { size: 11 } }, scaleanchor: 'x', scaleratio: 1 / Math.cos((midLat * Math.PI) / 180), constrain: 'domain' },
  }
}

function VariableMap({ scan, id, overlay }) {
  const v = scan.variables[id]
  const rate = v.rate_per_decade
  const finite = rate.flat().filter((x) => x != null)
  const max = Math.max(...finite.map(Math.abs), 1e-9)
  const o = OVERLAYS.find((x) => x.id === overlay)
  const marks = v[o.key] ? cellsOf(scan, v[o.key], (b) => !!b) : { x: [], y: [] }
  const untested = cellsOf(scan, v.valid, (b) => !b)
  const text = rate.map((row, i) => row.map((r, j) => {
    if (r == null) return `${deg(scan.lats[i], scan.lons[j])}<br>not tested (missing or constant data)`
    const pn = v.p_naive?.[i][j]
    const pp = v.p_prewhitened?.[i][j]
    const cov = v.coverage?.[i][j]
    return `${deg(scan.lats[i], scan.lons[j])}<br>${fmt(r, true)} ${v.units} per decade`
      + (pn != null ? `<br>usual p ${pval(pn)} · stickiness removed p ${pval(pp)}` : `<br>z ${fmt(v.z[i][j])}`)
      + `<br>honest (FDR): ${v.fdr_mask[i][j] ? 'trend' : 'not proven'}${cov != null ? ` · ${pct(cov)} of months` : ''}`
  }))
  return (
    <figure className="scanmap">
      <Plot
        data={[
          { z: rate, x: scan.lons, y: scan.lats, type: 'heatmap', colorscale: DIVERGING, zmin: -max, zmax: max,
            xgap: 1, ygap: 1, text, hovertemplate: '%{text}<extra></extra>',
            colorbar: { thickness: 8, len: 0.9, outlinewidth: 0, tickfont: { size: 10 }, title: { text: `${v.units}/dec`, side: 'right', font: { size: 11 } } } },
          { ...untested, type: 'scatter', mode: 'markers', hoverinfo: 'skip', marker: { symbol: 'x-thin-open', size: 9, color: '#8b96a2', line: { width: 1.5 } } },
          overlay === 'cluster'
            ? { ...marks, type: 'scatter', mode: 'markers', hoverinfo: 'skip', marker: { symbol: 'square-open', size: 12, color: o.color, line: { width: 2 } } }
            : { ...marks, type: 'scatter', mode: 'markers', hoverinfo: 'skip', marker: { symbol: 'circle', size: 7, color: o.color, line: { width: 1.5, color: '#e9eef2' } } },
        ]}
        layout={{ ...geoLayout(scan, 300), title: { text: `${v.name} · ${v.period[0].slice(0, 4)}–${v.period[1].slice(0, 4)}`, font: { size: 14, color: '#e9eef2' }, x: 0, xanchor: 'left' } }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
      <figcaption className="small">{marks.x.length} of {finite.length} tested pixels marked{untested.x.length ? ` · ${untested.x.length} not tested (×)` : ''}</figcaption>
    </figure>
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
        layout={{ ...geoLayout(scan, 300), title: { text: 'Places changing the same way (k-means on each pixel’s five z-scores)', font: { size: 13 }, x: 0, xanchor: 'left' } }}
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
      <p className="small">{r.note} Separation score (silhouette) {r.silhouette.toFixed(2)}.</p>
    </div>
  )
}

function Locator({ presets, active, compare, onPick }) {
  const boxes = presets.map((p) => {
    const [a, b, c, d] = p.bbox
    const on = p.id === active
    const cmp = p.id === compare
    // clockwise ring: the other winding makes geo fill everything outside the box
    return { type: 'scattergeo', mode: 'lines', lat: [a, b, b, a, a], lon: [c, c, d, d, c], customdata: Array(5).fill(p.id),
      fill: 'toself', fillcolor: on ? 'rgba(233,238,242,0.4)' : cmp ? 'rgba(240,228,66,0.3)' : 'rgba(233,238,242,0.12)',
      line: { color: on ? '#e9eef2' : cmp ? '#f0e442' : '#8b96a2', width: 1.5 }, hovertemplate: `${p.name}<extra></extra>` }
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

function regionStats(scan) {
  return Object.fromEntries(Object.entries(scan.variables).map(([id, v]) => {
    const tested = v.valid.flat().filter(Boolean).length
    const count = (g) => (g ? g.flat().filter(Boolean).length : null)
    const rates = v.rate_per_decade.flat().filter((x) => x != null).sort((a, b) => a - b)
    return [id, {
      name: v.name, units: v.units, tested,
      naive: count(v.naive_mask), pw: count(v.prewhitened_mask), fdr: count(v.fdr_mask),
      median: rates.length ? rates[Math.floor(rates.length / 2)] : null,
      clusters: v.clusters.filter((c) => c.significant).length,
    }]
  }))
}

function Compare({ a, b, nameA, nameB }) {
  const sa = regionStats(a)
  const sb = regionStats(b)
  const share = (n, t) => (n == null ? '–' : pct(n / t))
  return (
    <table className="compare">
      <caption>{nameA} compared with {nameB}</caption>
      <thead>
        <tr><th scope="col" rowSpan="2">Variable</th><th scope="colgroup" colSpan="3">{nameA}</th><th scope="colgroup" colSpan="3">{nameB}</th></tr>
        <tr><th scope="col">Median rate / decade</th><th scope="col" className="u">Usual</th><th scope="col" className="h">Honest</th>
          <th scope="col">Median rate / decade</th><th scope="col" className="u">Usual</th><th scope="col" className="h">Honest</th></tr>
      </thead>
      <tbody>
        {Object.keys(sa).filter((id) => sb[id]).map((id) => (
          <tr key={id}>
            <th scope="row">{sa[id].name}</th>
            <td>{fmt(sa[id].median, true)} {sa[id].units}</td><td className="u">{share(sa[id].naive, sa[id].tested)}</td><td className="h">{share(sa[id].fdr, sa[id].tested)}</td>
            <td>{fmt(sb[id].median, true)} {sb[id].units}</td><td className="u">{share(sb[id].naive, sb[id].tested)}</td><td className="h">{share(sb[id].fdr, sb[id].tested)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ScanView() {
  const [presets, setPresets] = useState([])
  const [active, setActive] = useState(null)
  const [box, setBox] = useState([9.5, 13.5, 77.0, 81.0])
  const [scan, setScan] = useState(null)
  const [overlay, setOverlay] = useState('fdr')
  const [compareId, setCompareId] = useState('')
  const [other, setOther] = useState(null)
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
      setError(/fetch|NetworkError/i.test(e.message) ? 'A custom box needs the backend running for live NASA data. The listed regions work offline.' : e.message)
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

  useEffect(() => {
    setOther(null)
    if (compareId) api.scanPreset(compareId).then(setOther).catch((e) => setError(e.message))
  }, [compareId])

  const s = scan?.summary
  const labels = ['Lat min', 'Lat max', 'Lon min', 'Lon max']
  const pick = (p) => { setBox(p.bbox); run(p.bbox, p) }
  const clusters = useMemo(() => (scan ? Object.values(scan.variables).flatMap((v) => v.clusters
    .filter((c) => c.significant).map((c) => ({ ...c, name: v.name, units: v.units, word: c.direction === 'rising' ? v.word_up : v.word_down })))
    .sort((a, b) => b.mass - a.mass) : []), [scan])
  const activeName = presets.find((p) => p.id === active)?.name || 'This box'

  return (
    <div className="scanner">
      <h2>Scan a whole region</h2>
      <p className="lead">
        Every NASA POWER grid point in a box (about 0.5° apart), five variables, three tests. Then a separate check:
        are there connected patches of change bigger than chance makes on the same data shuffled in time?
      </p>
      <div className="investigate"><div className="row">
        <Locator presets={presets} active={active} compare={compareId} onPick={pick} />
        <div>
          <div className="chips">
            {presets.map((p) => (
              <button key={p.id} className={`chip ${p.id === active ? 'on' : ''}`} aria-pressed={p.id === active} disabled={busy} onClick={() => pick(p)}>{p.name}</button>
            ))}
          </div>
          <form className="fields" onSubmit={(e) => { e.preventDefault(); run() }}>
            {labels.map((label, i) => (
              <label key={label}>{label}
                <input type="number" step="0.5" required value={box[i]}
                  onChange={(e) => setBox(box.map((v, k) => (k === i ? Number(e.target.value) : v)))} />
              </label>
            ))}
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Scanning…' : 'Scan this box'}</button>
          </form>
          <p className="small">Box sides 2 to 5 degrees (NASA POWER limit). A new box needs the backend and takes about 30 seconds.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div></div>
      {scan && (
        <div aria-busy={busy}>
          <p className="claim wide">
            {s.n_tests.toLocaleString()} pixel tests. The usual test flags <strong className="u">{s.naive_hits}</strong>.
            Remove stickiness: {s.prewhitened_hits ?? '–'}. Then control false discoveries across all of them:{' '}
            <strong className="h">{s.fdr_hits}</strong> hold up. Separately, <strong>{s.significant_clusters}</strong>{' '}
            connected patch{s.significant_clusters === 1 ? '' : 'es'} beat the shuffled maps.
          </p>
          <p className="small">
            All tests at p &lt; 0.05. False-discovery control at 10% over {s.fdr_scope || 'every test in this box'}
            {s.fdr_threshold ? ` (a pixel needs p ≤ ${pval(s.fdr_threshold)})` : ''}; with many real trends this
            threshold can exceed 0.05, so stage 3 can keep more pixels than stage 2. Clusters: {s.cluster_scope || 'cluster mass'} over {s.permutations} shuffles.
          </p>

          <h3>Trend maps</h3>
          <div className="maphead">
            <div className="switch small" role="group" aria-label="Which result to mark on the maps">
              {OVERLAYS.map((o) => (
                <button key={o.id} className={overlay === o.id ? `on ${o.id}` : ''} aria-pressed={overlay === o.id} onClick={() => setOverlay(o.id)}>{o.label}</button>
              ))}
            </div>
            <p className="small">
              Colour = rate of change per decade (green rising, purple falling; each map has its own scale).{' '}
              {overlay === 'cluster' ? 'Yellow squares = pixels of a patch that beat the shuffle test.' : `Dots = pixels flagged: ${OVERLAYS.find((o) => o.id === overlay).label}.`}{' '}
              × = not tested.
            </p>
          </div>
          <div className="maps three">
            {Object.keys(scan.variables).map((id) => <VariableMap key={id} scan={scan} id={id} overlay={overlay} />)}
          </div>

          <h3>What we found</h3>
          {clusters.length > 0 ? (
            <table className="clusters">
              <caption>Patches of change bigger than chance (cluster shuffle test)</caption>
              <thead><tr><th scope="col">Variable</th><th scope="col">What</th><th scope="col">Pixels</th><th scope="col">Centre</th><th scope="col">Mean rate / decade</th><th scope="col">Shuffle p</th></tr></thead>
              <tbody>
                {clusters.map((c) => (
                  <tr key={`${c.name}${c.id}`}>
                    <th scope="row">{c.name}</th><td>{c.word}</td><td>{c.size}</td><td>{deg(c.center_lat, c.center_lon)}</td>
                    <td>{fmt(c.mean_rate_per_decade, true)} {c.units}</td><td>{pval(c.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>No patch of change here is bigger than chance. That is a real answer, not a failure.</p>}
          <ol className="findings">{scan.findings.map((f) => <li key={f}>{f}</li>)}</ol>

          <h3>Compare with another region</h3>
          <label className="inline">Region
            <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
              <option value="">Choose a region</option>
              {presets.filter((p) => p.id !== active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {other && <Compare a={scan} b={other} nameA={activeName} nameB={presets.find((p) => p.id === compareId)?.name} />}
          {other && <p className="small">Shares are of tested pixels. Neighbouring pixels are strongly correlated, so we compare the regions side by side and do not compute a p-value for their difference.</p>}

          <h3>Places changing the same way</h3>
          <RegimeMap scan={scan} />
          <h3>Limits</h3>
          <ul className="small">{scan.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="source">Source: {scan.source}</p>
        </div>
      )}
    </div>
  )
}
