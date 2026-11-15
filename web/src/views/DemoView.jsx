// Watch a demo: two walkthroughs that play by themselves through the five steps, offline, with captions.
// Every number in a caption is read from a pre-built case file (backend/data/cases, same engine as the app).
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Plot from '../components/Plot'
import SeriesChart from '../components/SeriesChart'
import { Stages } from '../components/Verdict'
import { Step } from '../components/Explorer'
import { peq, rate } from '../lib/format'
import { useCatalog } from '../lib/catalog'

const DWELL = 8000 // ms per scene

const word = (st) => (st.honest.significant ? 'trend is real' : 'not proven')
const dir = (slope) => (slope > 0 ? 'rising' : slope < 0 ? 'falling' : 'flat')

// box = [south, north, west, east]
function BoxMap({ box }) {
  const [s, n, w, e] = box
  return (
    <Plot
      data={[{ type: 'scattergeo', mode: 'lines', lon: [w, e, e, w, w], lat: [s, s, n, n, s], fill: 'toself',
        fillcolor: 'rgba(86,180,233,0.3)', line: { color: '#56b4e9', width: 2 }, hoverinfo: 'skip' }]}
      layout={{ height: 280, margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)',
        geo: { projection: { type: 'orthographic', rotation: { lon: (w + e) / 2, lat: (s + n) / 2 } }, bgcolor: 'rgba(0,0,0,0)',
          showland: true, landcolor: '#1c2630', showocean: true, oceancolor: '#0b1016', showcountries: true,
          countrycolor: '#2b3947', coastlinecolor: '#3a4a5a', lataxis: { showgrid: true, gridcolor: '#1c2630' },
          lonaxis: { showgrid: true, gridcolor: '#1c2630' } } }}
      config={{ displayModeBar: false, staticPlot: true }} style={{ width: '100%' }} useResizeHandler />
  )
}

function seasonChart(s, r) {
  return { name: `${s.name} · ${r.season_name}`, units: s.units, dates: r.series.dates, values: r.series.values,
    analysis: { anomalies: r.series.anomalies, honest: r.stages.honest } }
}

function stagesLine(st, units) {
  const u = units === 'unitless' ? '' : ` ${units}`
  return `${dir(st.honest.slope_per_year)}, ${rate(st.honest.slope_per_year * 10)}${u} per decade. `
    + `Usual test: ${st.naive.significant ? 'trend' : 'no trend'} (${peq(st.naive.p)}). Honest verdict: ${word(st)} (${peq(st.honest.p)}).`
}

function wisconsin(c, def) {
  const s = c.series[0]
  const { all, JJA: jja, DJF: djf } = s.seasons
  return [
    { step: 1, title: 'Choose a variable', big: 'Aerosol optical depth (haze)',
      caption: `${def ?? 'How much dust, smoke and pollution dim the sunlight.'} Measured from space by MODIS on NASA's Aqua satellite.` },
    { step: 2, title: 'Choose a region', box: [42.5, 47.1, -92.9, -86.8],
      caption: 'A box over Wisconsin, USA: 92.9°W to 86.8°W, 42.5°N to 47.1°N. NASA Giovanni averages every month over the box.' },
    { step: 3, title: 'Choose a time frame', big: `${all.frame.start}–${all.frame.end}`,
      caption: 'The whole MODIS record here. First all months, then only June to August, then only December to February.' },
    { step: 4, title: 'The time series', chart: s,
      caption: 'Each month minus its calendar-month normal, so the seasons are removed. The white line is the trend.' },
    { step: 5, title: 'Test for significance: all months', stages: all,
      caption: `All months: ${stagesLine(all.stages, s.units)}` },
    { step: 5, title: 'Summer only: June to August', chart: seasonChart(s, jja), perYear: 1, stages: jja,
      caption: `Summer: ${stagesLine(jja.stages, s.units)} One of four seasons was looked at, so the four-season rule applies.` },
    { step: 5, title: 'Winter only: December to February', chart: seasonChart(s, djf), perYear: 1, stages: djf,
      caption: `Winter: ${stagesLine(djf.stages, s.units)}` },
    { step: 5, title: 'What the tests found', big: `Summer: ${word(jja.stages)} · Winter: ${word(djf.stages)}`,
      caption: 'Averaging all months can hide a change in one season. The tests show what changed in the haze record; they do not say why.' },
  ]
}

function chennai(c, def) {
  const s = c.series.find((x) => x.name.startsWith('Air temperature')) ?? c.series[0]
  const a = s.analysis
  const st = { naive: a.naive, pw: a.honest, honest: a.honest }
  const more = a.years_more_needed
  return [
    { step: 1, title: 'Choose a variable', big: 'Air temperature at 2 m',
      caption: `${def ?? 'How warm the air is near the ground.'} From NASA POWER, which serves the MERRA-2 model reanalysis (not a satellite photo).` },
    { step: 2, title: 'Choose a place', box: [12.83, 13.33, 79.96, 80.58],
      caption: 'Chennai, India: the NASA POWER grid cell at 13.08°N, 80.27°E.' },
    { step: 3, title: 'Choose a time frame', big: `${s.dates[0].slice(0, 4)}–${s.dates[s.dates.length - 1].slice(0, 4)}`,
      caption: `All months, ${Math.round(a.record_years)} years of monthly values.` },
    { step: 4, title: 'The time series', chart: s,
      caption: 'Seasons removed: each month minus its calendar-month normal. The white line is the trend.' },
    { step: 5, title: 'The usual test', stages: { stages: st, rule: 'place' },
      caption: `The usual test says: ${a.naive.significant ? 'trend' : 'no trend'} (${peq(a.naive.p)}). It treats every month as independent.` },
    { step: 5, title: 'The honest verdict', stages: { stages: st, rule: 'place' },
      caption: `Each month resembles the last, so the stickiness is removed and the test runs again: ${word(st)} (${peq(a.honest.p)}).`
        + (a.honest.significant || more == null ? '' : ` At this rate, about ${Math.ceil(more)} more years of data are needed.`) },
  ]
}

function Scene({ sc }) {
  return (
    <div className="scene">
      <Step n={sc.step} title={sc.title} />
      <div className="scene-visual">
        {sc.big && <p className="scene-big">{sc.big}</p>}
        {sc.box && <BoxMap box={sc.box} />}
        {sc.chart && <SeriesChart series={sc.chart} height={280} perYear={sc.perYear ?? 12} />}
        {sc.stages && <Stages naive={sc.stages.stages.naive} pw={sc.stages.stages.pw ?? sc.stages.stages.honest}
          honest={sc.stages.stages.honest} rule={sc.stages.rule} />}
      </div>
      <p className="subtitle" aria-live="polite">{sc.caption}</p>
    </div>
  )
}

function Player({ scenes }) {
  const [k, setK] = useState(0)
  const [playing, setPlaying] = useState(true)
  const ref = useRef(null)
  const last = k === scenes.length - 1

  // advances only while the player is on screen, so it is not over before anyone looks
  useEffect(() => {
    if (!playing || last) return
    const t = setInterval(() => {
      const r = ref.current?.getBoundingClientRect()
      const onScreen = r && r.top < window.innerHeight * 0.8 && r.bottom > window.innerHeight * 0.2
      if (onScreen && document.visibilityState === 'visible') setK((x) => Math.min(x + 1, scenes.length - 1))
    }, DWELL)
    return () => clearInterval(t)
  }, [k, playing, last, scenes.length])

  return (
    <div className="player" ref={ref}>
      <Scene sc={scenes[k]} />
      <div className="player-controls">
        <button type="button" disabled={k === 0} onClick={() => setK(k - 1)}>Back</button>
        {last
          ? <button type="button" className="primary" onClick={() => { setK(0); setPlaying(true) }}>Replay</button>
          : <button type="button" className="primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>}
        <button type="button" disabled={last} onClick={() => setK(k + 1)}>Next</button>
        <span className="dots">
          {scenes.map((s, i) => (
            <button key={i} type="button" className={i === k ? 'on' : ''} aria-label={`Scene ${i + 1}: ${s.title}`}
              aria-current={i === k} onClick={() => setK(i)} />
          ))}
        </span>
      </div>
    </div>
  )
}

const DEMOS = [
  { id: 'wisconsin', label: 'Wildfire smoke over Wisconsin', build: wisconsin, def: 'AOD_55' },
  { id: 'chennai', label: 'Chennai air temperature', build: chennai, def: 'T2M' },
]

export default function DemoView() {
  const cat = useCatalog()
  const [demo, setDemo] = useState(DEMOS[0])
  const [cases, setCases] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all(DEMOS.map((d) => api.caseFile(d.id).then((c) => [d.id, c])))
      .then((pairs) => setCases(Object.fromEntries(pairs))).catch((e) => setError(e.message))
  }, [])
  const c = cases[demo.id]
  const def = cat?.find((v) => v.id === demo.def)?.definition
  return (
    <div className="demo">
      <h2>Watch a demo</h2>
      <p className="lead">Two investigations play by themselves through the five steps. They use saved NASA data, so they work offline.</p>
      <div className="chips">
        {DEMOS.map((d) => (
          <button key={d.id} className={`chip ${d.id === demo.id ? 'on' : ''}`} aria-pressed={d.id === demo.id} onClick={() => setDemo(d)}>{d.label}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {c && <Player key={demo.id} scenes={demo.build(c, def)} />}
    </div>
  )
}
