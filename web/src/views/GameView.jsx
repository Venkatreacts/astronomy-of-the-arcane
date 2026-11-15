// Train your eye: ten de-seasonalised monthly series, half real records with a trend, half trend-free sticky
// noise. The student calls each one, then sees what the usual test and the honest verdict said.
// Rounds from backend/scripts/build_game.py; seeded choice in lib/game.js. Works offline.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import Plot from '../components/Plot'
import { deg, peq } from '../lib/format'
import { STAGE } from '../lib/stages'
import { PER_KIND, pickRounds, says, scores, seedFromURL, truth } from '../lib/game'

const AXIS = { gridcolor: 'rgba(139,150,162,0.14)', linecolor: '#2b3947', tickfont: { size: 12 }, zeroline: false }
const WORD = { trend: 'Real trend', noise: 'Just noise' }

function monthDates(first, count) {
  const y0 = Number(first.slice(0, 4))
  const m0 = Number(first.slice(5, 7)) - 1
  return Array.from({ length: count }, (_, k) => `${y0 + Math.floor((m0 + k) / 12)}-${String(((m0 + k) % 12) + 1).padStart(2, '0')}`)
}

function Chart({ r }) {
  const x = useMemo(() => monthDates(r.first, r.anomalies.length), [r])
  return (
    <Plot
      data={[{ x, y: r.anomalies, type: 'scatter', mode: 'lines', connectgaps: false, line: { color: '#c9d3dc', width: 1.2 },
        hoverinfo: 'skip' }]}
      layout={{ height: 280, margin: { l: 48, r: 12, t: 10, b: 36 }, xaxis: { ...AXIS, type: 'date' },
        yaxis: { ...AXIS, title: { text: 'difference from the monthly normal' }, showticklabels: false },
        font: { color: '#8b96a2', family: 'Barlow, sans-serif' }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        showlegend: false }}
      config={{ displayModeBar: false, staticPlot: true }} style={{ width: '100%' }} useResizeHandler />
  )
}

function mark(ok) {
  return <span className={ok ? 'right' : 'wrong'}>{ok ? '✓ right' : '✗ wrong'}</span>
}

function Reveal({ r, pick }) {
  const t = truth(r)
  return (
    <div className="reveal" aria-live="polite">
      <p className="reveal-truth">
        {r.kind === 'real'
          ? <>Real record: <strong>{r.name}</strong> at {deg(r.lat, r.lon)}, NASA POWER (MERRA-2 model), {r.units}. Its trend passes the strictest rule.</>
          : <>Simulated: <strong>sticky noise with no trend</strong> (stickiness φ = {r.phi_model}), made as sticky and as noisy as a real {r.name.toLowerCase()} record.</>}
      </p>
      <table className="halves">
        <tbody>
          <tr><th scope="row">You</th><td>{WORD[pick]}</td><td>{mark(pick === t)}</td></tr>
          <tr><th scope="row" className="u">{STAGE.usual}</th><td>{says(r.usual) === 'trend' ? 'trend' : 'no trend'}, {peq(r.usual.p)}</td><td>{mark(says(r.usual) === t)}</td></tr>
          <tr><th scope="row" className="h">{STAGE.honest}</th><td>{r.honest.trend ? 'trend is real' : 'not proven'}, {peq(r.honest.p)}</td><td>{mark(says(r.honest) === t)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function sentence(s, pool) {
  const noise = pool.filter((r) => r.kind === 'noise')
  const uf = noise.filter((r) => r.usual.trend).length
  const hf = noise.filter((r) => r.honest.trend).length
  if (s.usualFalse > s.honestFalse) {
    return `The usual test called ${s.usualFalse} of the ${PER_KIND} noise series a trend and the honest verdict called ${s.honestFalse}: `
      + 'sticky noise wanders for years at a time, and a test that treats every month as independent mistakes that wandering for a trend.'
  }
  return `This time both tests called the same number of noise series a trend (${s.usualFalse}), but across all ${noise.length} noise series `
    + `in the game the usual test was fooled ${uf} times and the honest verdict ${hf}, because the usual test treats sticky months as independent.`
}

function Scores({ s, pool, onAgain }) {
  return (
    <div className="scores" aria-live="polite">
      <dl>
        <div><dt>You</dt><dd>{s.you}<span>/10</span></dd></div>
        <div><dt className="u">{STAGE.usual}</dt><dd>{s.usual}<span>/10</span></dd></div>
        <div><dt className="h">{STAGE.honest}</dt><dd>{s.honest}<span>/10</span></dd></div>
      </dl>
      <p>{sentence(s, pool)}</p>
      <div className="controls"><button type="button" onClick={onAgain}>Play ten new rounds</button></div>
    </div>
  )
}

const newSeed = () => String(Math.floor(1000 + Math.random() * 9000))

export default function GameView() {
  const [pool, setPool] = useState(null)
  const [error, setError] = useState('')
  const [seed, setSeed] = useState(() => seedFromURL() ?? newSeed())
  const [picks, setPicks] = useState([])
  const [k, setK] = useState(0)
  const [finished, setFinished] = useState(false)
  useEffect(() => { api.game().then(setPool).catch((e) => setError(e.message)) }, [])
  const played = useMemo(() => (pool ? pickRounds(pool.rounds, seed) : []), [pool, seed])
  const r = played[k]
  const last = k === played.length - 1
  const link = `${window.location.origin}${window.location.pathname}?seed=${encodeURIComponent(seed)}#eye`

  function again() {
    setSeed(newSeed())
    setPicks([])
    setK(0)
    setFinished(false)
  }

  return (
    <div className="game">
      <h2>Train your eye</h2>
      <p className="lead">
        Ten monthly records with the seasons removed and no statistics. Half are real NASA records whose trend passes
        the strictest test. Half are simulated sticky noise with no trend at all. Call each one, then see what the two
        tests said.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {r && !finished && (
        <div className="round">
          <p className="round-head">Round {k + 1} of {played.length}</p>
          <Chart r={r} />
          {picks[k] == null ? (
            <div className="controls">
              {['trend', 'noise'].map((p) => (
                <button key={p} type="button" className="primary" onClick={() => setPicks([...picks, p])}>{WORD[p]}</button>
              ))}
            </div>
          ) : (
            <>
              <Reveal r={r} pick={picks[k]} />
              <div className="controls">
                <button type="button" className="primary" onClick={() => (last ? setFinished(true) : setK(k + 1))}>
                  {last ? 'See the scores' : 'Next round'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {finished && <Scores s={scores(played, picks)} pool={pool.rounds} onAgain={again} />}
      <p className="small rule">
        Class code <strong>{seed}</strong>: everyone who opens <a href={link}>this link</a> plays the same ten rounds.
        {' '}{pool?.rule}
      </p>
      {pool && <p className="small">{pool.real_note} {pool.noise_note}</p>}
    </div>
  )
}
