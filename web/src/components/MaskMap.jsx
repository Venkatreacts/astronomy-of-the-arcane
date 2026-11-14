import Plot from './Plot'

// A grid of pixels flagged "significant" (1) or not (0). Optional dashed line splits the map in half.
export default function MaskMap({ mask, title, color, splitHalf = false }) {
  const nx = mask[0]?.length || 0
  const shapes = splitHalf
    ? [{ type: 'line', x0: nx / 2 - 0.5, x1: nx / 2 - 0.5, y0: -0.5, y1: mask.length - 0.5,
        line: { color: '#f0e442', width: 2, dash: 'dash' } }]
    : []
  return (
    <Plot
      data={[{ z: mask, type: 'heatmap', showscale: false, hoverinfo: 'skip',
        colorscale: [[0, 'rgba(127,127,127,0.15)'], [1, color]], zmin: 0, zmax: 1, xgap: 1, ygap: 1 }]}
      layout={{ title: { text: title, font: { size: 14 } }, height: 300,
        margin: { l: 10, r: 10, t: 40, b: 10 }, shapes,
        xaxis: { visible: false }, yaxis: { visible: false, scaleanchor: 'x' },
        font: { color: '#8a94a6' },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' }}
      config={{ displayModeBar: false, staticPlot: true }}
      style={{ width: '100%' }}
    />
  )
}
