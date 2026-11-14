import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

// Smaller Plotly bundle wired into the React wrapper.
const Plot = createPlotlyComponent(Plotly)
export default Plot
