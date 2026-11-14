import { useState } from 'react'
import Plot from './Plot'

const AXIS = { gridcolor: 'rgba(139,150,162,0.14)', linecolor: '#2b3947', tickfont: { size: 12 } }

// Monthly anomalies with the Sen's slope trend line and its 95% range, or the raw monthly values
// with each calendar month's normal. Missing months are marked along the bottom, never drawn as zero.
export default function SeriesChart({ series, height = 340, toggle = false }) {
  const [view, setView] = useState('anomaly')
  const { dates, analysis, units, name } = series
  const values = series.values
  const y = analysis.anomalies
  const firstIdx = y.findIndex((v) => v != null)
  const lastIdx = y.length - 1 - [...y].reverse().findIndex((v) => v != null)
  const finite = y.filter((v) => v != null).sort((a, b) => a - b)
  const median = finite[Math.floor(finite.length / 2)] ?? 0
  const mid = (firstIdx + lastIdx) / 2
  const line = (perYear) => [firstIdx, lastIdx].map((i) => median + (perYear / 12) * (i - mid))
  const ci = analysis.honest.slope_ci_per_year
  const missing = y.map((v, k) => (v == null ? dates[k] : null)).filter(Boolean)
  const anomaly = view === 'anomaly' || !values

  const traces = anomaly
    ? [
        { x: dates, y, type: 'scatter', mode: 'lines', name: 'Monthly anomaly', connectgaps: false,
          line: { color: '#7a8597', width: 1 }, hovertemplate: `%{x|%b %Y}: %{y:.3g} ${units} from normal<extra></extra>` },
        ...(ci ? [{ x: [dates[firstIdx], dates[lastIdx], dates[lastIdx], dates[firstIdx]],
          y: [...line(ci[0]), ...line(ci[1]).reverse()], type: 'scatter', mode: 'lines', fill: 'toself',
          fillcolor: 'rgba(233,238,242,0.10)', line: { width: 0 }, name: '95% range of the rate', hoverinfo: 'skip' }] : []),
        { x: [dates[firstIdx], dates[lastIdx]], y: line(analysis.honest.slope_per_year), type: 'scatter', mode: 'lines',
          name: "Trend (Sen's slope)", line: { color: '#e9eef2', width: 3 }, hoverinfo: 'skip' },
      ]
    : [
        { x: dates, y: values, type: 'scatter', mode: 'lines', name: 'Monthly value', connectgaps: false,
          line: { color: '#b8c2cc', width: 1 }, hovertemplate: `%{x|%b %Y}: %{y:.3g} ${units}<extra></extra>` },
        ...(series.clim ? [{ x: dates, y: dates.map((d) => series.clim[Number(d.slice(5, 7)) - 1]), type: 'scatter',
          mode: 'lines', name: 'Normal for that month', line: { color: '#f0e442', width: 1, dash: 'dot' }, hoverinfo: 'skip' }] : []),
      ]
  if (missing.length) {
    traces.push({ x: missing, y: missing.map(() => 0), yaxis: 'y2', type: 'scatter', mode: 'markers', name: `Missing month (${missing.length})`,
      marker: { symbol: 'line-ns-open', size: 10, color: '#cc79a7' }, hovertemplate: '%{x|%b %Y}: no data<extra></extra>' })
  }

  return (
    <figure className="series">
      {toggle && values && (
        <div className="switch small" role="group" aria-label="What the chart shows">
          <button className={anomaly ? 'on' : ''} aria-pressed={anomaly} onClick={() => setView('anomaly')}>Seasons removed</button>
          <button className={!anomaly ? 'on' : ''} aria-pressed={!anomaly} onClick={() => setView('raw')}>Raw monthly values</button>
        </div>
      )}
      <Plot
        data={traces}
        layout={{
          title: { text: name, font: { size: 15 }, x: 0, xanchor: 'left' },
          height, margin: { l: 60, r: 12, t: 40, b: 40 },
          yaxis: { ...AXIS, title: { text: anomaly ? `Difference from normal (${units})` : units }, zeroline: anomaly, zerolinecolor: 'rgba(139,150,162,0.5)' },
          yaxis2: { overlaying: 'y', range: [0, 20], visible: false, fixedrange: true },
          xaxis: { ...AXIS, type: 'date' },
          legend: { orientation: 'h', y: -0.16, font: { size: 12 } }, hovermode: 'closest',
          font: { color: '#8b96a2', family: 'Barlow, sans-serif' },
          paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
          hoverlabel: { bgcolor: '#0b1016', bordercolor: '#33414f', font: { color: '#e9eef2' } },
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
    </figure>
  )
}
