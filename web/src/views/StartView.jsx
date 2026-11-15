// Start an investigation: three questions (where, what kind of place, what you are curious about), suggested
// variables with plain definitions, then a sweep of every catalog variable at that place.
import { useMemo, useState } from 'react'
import { api } from '../api'
import Info from '../components/Info'
import CheckIt from '../components/CheckIt'
import { deg, peq, rate } from '../lib/format'
import { PLACE_TYPES, THEMES, geocode, suggest, useCatalog } from '../lib/catalog'
import { RULE, STAGE } from '../lib/stages'

const QUICK = [
  { name: 'Chennai, India', lat: 13.08, lon: 80.27 },
  { name: 'Ludhiana, Punjab, India', lat: 30.9, lon: 75.85 },
  { name: 'Niamey, Niger', lat: 13.51, lon: 2.11 },
  { name: 'Manaus, Brazil', lat: -3.12, lon: -60.02 },
  { name: 'Phoenix, United States', lat: 33.45, lon: -112.07 },
]
const DIR = { rising: '↑ rising', falling: '↓ falling', flat: 'no change' }

function Honest({ r }) {
  if (r.honest) return <>trend is real, {peq(r.p_honest)}</>
  const more = r.years_more_needed
  return <>not proven, {peq(r.p_honest)}{more != null && more > 0 ? <span className="small"> · about {Math.ceil(more)} more years needed</span> : ''}</>
}

function Suggested({ rows }) {
  return (
    <table className="halves">
      <caption>Your suggested variables at this place, 1981–2025</caption>
      <thead><tr><th scope="col">Variable</th><th scope="col">Direction <Info term="trend" /></th>
        <th scope="col">How much per decade <Info term="per decade" /></th>
        <th scope="col" className="u">{STAGE.usual} <Info term="usual test" /></th>
        <th scope="col" className="h">{STAGE.honest} (this place) <Info term="honest verdict" /></th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.name}</th><td>{DIR[r.direction]}</td><td>{rate(r.rate_per_decade)} {r.units}</td>
            <td>{r.usual ? 'trend' : 'no trend'}, {peq(r.p_usual)}</td><td><Honest r={r} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sweep({ sw }) {
  const strongest = sw.rows.find((r) => r.id === sw.strongest)
  return (
    <div className="sweep">
      <h3>The variable sweep</h3>
      <p className="claim wide">
        You tested {sw.n_tested} variables. At p &lt; 0.05, about {Math.round(sw.expected_by_chance)} would look like a
        trend by chance alone <span className="small">(0.05 × {sw.n_tested} = {sw.expected_by_chance})</span>.
      </p>
      {strongest
        ? <p className="callout clue" role="note"><b>Strongest clue:</b> {strongest.name}, {DIR[strongest.direction]} {rate(strongest.rate_per_decade)} {strongest.units} per decade.
          It survives the sweep and has the largest change compared with how much it varies from year to year. A clue is where to look next, not a cause.</p>
        : <p className="callout" role="note">No variable survives the sweep at this place. That is a real answer: nothing here changes more than chance would explain.</p>}
      <table className="halves sweeptable">
        <caption>Every catalog variable, largest change relative to year-to-year spread first</caption>
        <thead><tr><th scope="col">Variable</th><th scope="col">What it is</th><th scope="col">Direction <Info term="trend" /></th>
          <th scope="col">Rate per decade <Info term="per decade" /></th><th scope="col" className="u">{STAGE.usual}</th>
          <th scope="col" className="h">{STAGE.honest} (this place)</th><th scope="col">Survives the sweep <Info term="false discovery control" /></th></tr></thead>
        <tbody>
          {sw.rows.map((r) => (
            <tr key={r.id} className={r.id === sw.strongest ? 'on' : ''}>
              <th scope="row">{r.name}{r.id === sw.strongest && <span className="tag">Strongest clue</span>}</th>
              <td className="small">{r.definition}</td><td>{DIR[r.direction]}</td><td>{rate(r.rate_per_decade)} {r.units}</td>
              <td>{r.usual ? 'trend' : 'no trend'}, {peq(r.p_usual)}</td><td><Honest r={r} /></td>
              <td>{r.survives ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan="7" className="small">{RULE.sweep}{sw.threshold > 0 ? ` Here a variable needs p ≤ ${sw.threshold.toPrecision(2)}.` : ''} Sorted by
          the rate per decade divided by the year-to-year spread (the standard deviation of yearly means). Some records start later
          (haze from {sw.rows.find((r) => r.id === 'AOD_55')?.first ?? '–'}).</td></tr></tfoot>
      </table>
    </div>
  )
}

export default function StartView() {
  const cat = useCatalog()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState([])
  const [place, setPlace] = useState(null)
  const [kind, setKind] = useState('')
  const [theme, setTheme] = useState('')
  const [sw, setSw] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const picks = useMemo(() => (cat && kind && theme ? suggest(cat, kind, theme) : []), [cat, kind, theme])
  const choose = (p) => { setPlace(p); setFound([]); setSw(null) }

  async function search(e) {
    e.preventDefault()
    setError('')
    try {
      const r = await geocode(query)
      if (!r.length) setError(`No place called “${query}” found. Try a bigger town nearby, or use your location.`)
      setFound(r)
    } catch {
      setError('Place search needs internet. Use your location, or pick a listed place.')
    }
  }

  function locate() {
    setError('')
    navigator.geolocation?.getCurrentPosition(
      (p) => choose({ name: 'My location', lat: Number(p.coords.latitude.toFixed(2)), lon: Number(p.coords.longitude.toFixed(2)) }),
      () => setError('Your browser did not share a location. Search for the place instead.'))
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      setSw(await api.sweep(place))
    } catch (e) {
      setError(/reach|fetch|NetworkError/i.test(e.message) ? 'The sweep fetches live NASA data, so it needs the live server. The first request after a quiet spell can take about a minute.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const suggestedRows = sw ? picks.map((v) => sw.rows.find((r) => r.id === v.id)).filter(Boolean) : []

  return (
    <div className="start">
      <h2>Start an investigation</h2>
      <p className="lead">Three questions. Then we suggest NASA variables that fit, explain each one in a sentence, and test them all at your place.</p>

      <h3 className="step"><span className="stepn">1</span>Where?</h3>
      <form className="fields" onSubmit={search}>
        <label>Place
          <input type="search" value={query} required placeholder="a town or city" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="submit">Search</button>
        <button type="button" onClick={locate}>Use my location</button>
      </form>
      <div className="chips">
        {(found.length ? found : QUICK).map((p) => (
          <button key={`${p.name}${p.lat}`} className={`chip ${place?.name === p.name ? 'on' : ''}`} onClick={() => choose(p)}>{p.name}</button>
        ))}
      </div>
      {place && <p className="note">Chosen: <b>{place.name}</b>, {deg(place.lat, place.lon)}</p>}

      <h3 className="step"><span className="stepn">2</span>What kind of place is it?</h3>
      <div className="chips">
        {PLACE_TYPES.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}</button>)}
      </div>

      <h3 className="step"><span className="stepn">3</span>What are you curious about?</h3>
      <div className="chips">
        {[...THEMES, 'any'].map((t) => <button key={t} className={`chip ${theme === t ? 'on' : ''}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === 'any' ? 'anything' : t}</button>)}
      </div>

      {picks.length > 0 && (
        <>
          <h3>Suggested variables</h3>
          <ul className="suggest">
            {picks.map((v) => <li key={v.id}><b>{v.name}</b> <span className="small">({v.units === '0-1' ? 'index 0–1' : v.units})</span><br />{v.definition}</li>)}
          </ul>
          <button className="primary" disabled={!place || busy} onClick={run}>
            {busy ? 'Testing every variable…' : place ? `Test them at ${place.name.split(',')[0]}` : 'Choose a place first'}
          </button>
          <p className="small">We fetch all {cat?.length ?? ''} catalog variables in one NASA POWER request and test every one, so you also see the ones you did not pick.</p>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {sw && (
        <div aria-busy={busy}>
          {suggestedRows.length > 0 && <Suggested rows={suggestedRows} />}
          <Sweep sw={sw} />
          <CheckIt ids={suggestedRows.length ? suggestedRows.map((r) => r.id) : sw.rows.slice(0, 5).map((r) => r.id)} lat={sw.lat} lon={sw.lon} />
        </div>
      )}
    </div>
  )
}
