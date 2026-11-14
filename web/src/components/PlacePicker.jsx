import { useMemo } from 'react'
import Plot from './Plot'

// Click-to-pick world map. Plotly only reports clicks on data points, so an invisible
// 2.5-degree grid of points covers the globe; a click snaps to the nearest grid point.
const STEP = 2.5

function gridPoints() {
  const lat = []
  const lon = []
  for (let y = -60; y <= 75; y += STEP) {
    for (let x = -180 + STEP / 2; x < 180; x += STEP) {
      lat.push(y)
      lon.push(x)
    }
  }
  return { lat, lon }
}

export default function PlacePicker({ lat, lon, onPick }) {
  const grid = useMemo(gridPoints, [])
  return (
    <Plot
      data={[
        { type: 'scattergeo', mode: 'markers', lat: grid.lat, lon: grid.lon,
          marker: { size: 7, color: 'rgba(0,0,0,0)' }, hovertemplate: '%{lat:.1f}, %{lon:.1f}<extra>click to pick</extra>' },
        { type: 'scattergeo', mode: 'markers', lat: [lat], lon: [lon], hoverinfo: 'skip',
          marker: { size: 12, color: '#d55e00', line: { width: 2, color: '#ffffff' } } },
      ]}
      layout={{
        height: 300, margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)',
        geo: { projection: { type: 'natural earth' }, showland: true, landcolor: 'rgba(127,127,127,0.35)',
          showocean: true, oceancolor: 'rgba(0,114,178,0.12)', showcountries: true,
          countrycolor: 'rgba(127,127,127,0.6)', coastlinecolor: 'rgba(127,127,127,0.8)',
          bgcolor: 'rgba(0,0,0,0)', lataxis: { range: [-60, 80] } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
      onClick={(e) => {
        const p = e?.points?.[0]
        if (p && p.curveNumber === 0) onPick(p.lat, p.lon)
      }}
    />
  )
}
