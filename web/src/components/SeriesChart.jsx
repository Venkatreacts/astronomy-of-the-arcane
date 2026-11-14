import Plot from './Plot'

// Monthly anomalies (seasonal cycle removed) with the Sen's slope trend line.
export default function SeriesChart({ series, height = 320 }) {
  const { dates, analysis, units, name } = series
  const y = analysis.anomalies
  const firstIdx = y.findIndex((v) => v != null)
  const lastIdx = y.length - 1 - [...y].reverse().findIndex((v) => v != null)
  const slopePerMonth = analysis.honest.slope_per_year / 12
  const finite = y.filter((v) => v != null).sort((a, b) => a - b)
  const median = finite[Math.floor(finite.length / 2)] ?? 0
  const mid = (firstIdx + lastIdx) / 2
  const lineY = [firstIdx, lastIdx].map((i) => median + slopePerMonth * (i - mid))

  return (
    <Plot
      data={[
        { x: dates, y, type: 'scatter', mode: 'lines', name: 'Monthly anomaly',
          line: { color: '#7a8597', width: 1 } },
        { x: [dates[firstIdx], dates[lastIdx]], y: lineY, type: 'scatter', mode: 'lines',
          name: "Trend (Sen's slope)", line: { color: '#d55e00', width: 3 } },
      ]}
      layout={{
        title: { text: name, font: { size: 15 } },
        height, margin: { l: 55, r: 15, t: 40, b: 40 },
        yaxis: { title: { text: `Difference from normal (${units})` }, zeroline: true,
          gridcolor: 'rgba(127,127,127,0.2)', zerolinecolor: 'rgba(127,127,127,0.5)' },
        legend: { orientation: 'h', y: -0.2 },
        font: { color: '#8a94a6' },
        xaxis: { gridcolor: 'rgba(127,127,127,0.2)' },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  )
}
