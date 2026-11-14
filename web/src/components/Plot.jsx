import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

// Map outlines are served with the app (public/topojson), so the globe works offline.
Plotly.setPlotConfig({ topojsonURL: `${import.meta.env.BASE_URL}topojson/` })

// Smaller Plotly bundle wired into the React wrapper.
const Plot = createPlotlyComponent(Plotly)
export default Plot
