import { lazy, Suspense } from 'react'

// Plotly is about 4.9 MB, so it loads after the page text has painted. Each chart keeps its height while it waits.
const LazyPlot = lazy(async () => {
  const [{ default: Plotly }, { default: createPlotlyComponent }] = await Promise.all([
    import('plotly.js-dist-min'), import('react-plotly.js/factory')])
  // Map outlines are served with the app (public/topojson), so the globe works offline.
  Plotly.setPlotConfig({ topojsonURL: `${import.meta.env.BASE_URL}topojson/` })
  return { default: createPlotlyComponent(Plotly) }
})

export default function Plot(props) {
  return (
    <Suspense fallback={<div className="plot-wait" style={{ height: props.layout?.height ?? 300 }} aria-busy="true" />}>
      <LazyPlot {...props} />
    </Suspense>
  )
}
