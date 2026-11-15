// Headline check: the AI only reads the claim into five fields, which the student can correct; then code runs the
// tests and picks one of four fixed verdicts. Three saved examples work offline.
import { useEffect, useState } from 'react'
import { api } from '../api'
import Info from '../components/Info'
import CheckIt from '../components/CheckIt'
import { deg, peq, rate } from '../lib/format'
import { FIRST, LAST } from '../lib/frame'
import { geocode, useCatalog } from '../lib/catalog'
import { RULE, STAGE } from '../lib/stages'

const YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, k) => FIRST + k)
const TONE = { 'Supported by the data': 'h', 'The data point the other way': 'u' }

function Result({ check }) {
  if (!check) return null
  const r = check.result
  return (
    <div className="verdictbox" role="status">
      <p className={`bigverdict ${TONE[check.verdict] || ''}`}>{check.label || check.verdict}</p>
      {check.reason && <p>{check.reason}</p>}
      {r && (
        <>
          <p className="small">
            {check.variable.name} at {deg(check.lat, check.lon)}, {r.frame.start}–{r.frame.end}: {rate(r.rate_per_decade)} {check.variable.units} per
            decade <Info term="per decade" /> (95% range {rate(r.rate_ci_per_decade[0])} to {rate(r.rate_ci_per_decade[1])}).{' '}
            {STAGE.usual} <Info term="usual test" />: {r.usual ? 'trend' : 'no trend'}, {peq(r.p_usual)}.{' '}
            {STAGE.honest} <Info term="honest verdict" />: {r.honest ? 'trend is real' : 'not proven'}, {peq(r.p_honest)} <Info term="p-value" />.
          </p>
          <p className="small">{RULE.place} The verdict is chosen by code from these tests, not by the AI, and says nothing about causes.</p>
          {r.frame.short && <p className="callout" role="note">Short record. A real trend may not show yet.</p>}
          <CheckIt ids={[check.variable.id]} lat={check.lat} lon={check.lon} start={r.frame.start} end={r.frame.end} />
        </>
      )}
    </div>
  )
}

export default function HeadlineView() {
  const cat = useCatalog()
  const [examples, setExamples] = useState([])
  const [text, setText] = useState('')
  const [passcode, setPasscode] = useState('')
  const [claim, setClaim] = useState(null)
  const [where, setWhere] = useState('')
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => { api.savedClaims().then(setExamples).catch(() => setExamples([])) }, [])

  async function locate(c) {
    try {
      const [p] = await geocode(c.place)
      if (p) { setWhere(p.name); return { ...c, lat: p.lat, lon: p.lon } }
      setWhere(`“${c.place}” not found: type the coordinates.`)
    } catch {
      setWhere('Place search needs internet: type the coordinates.')
    }
    return { ...c, lat: '', lon: '' }
  }

  async function read(e) {
    e.preventDefault()
    setBusy('read')
    setError('')
    setCheck(null)
    setSaved('')
    try {
      const c = await api.claimRead(text, passcode)
      setClaim(await locate(c))
    } catch (err) {
      setClaim(null)
      setError(/reach|fetch|NetworkError/i.test(err.message) ? 'Reading a new claim needs the live server. The saved examples work offline.' : err.message)
    } finally {
      setBusy('')
    }
  }

  async function test() {
    setBusy('test')
    setError('')
    setSaved('')
    try {
      setCheck(await api.claimCheck({ ...claim, lat: Number(claim.lat), lon: Number(claim.lon), start_year: Number(claim.start_year), end_year: Number(claim.end_year) }))
    } catch (err) {
      setError(/reach|fetch|NetworkError/i.test(err.message) ? 'Testing needs live NASA data through the server. The saved examples show the answer offline.' : err.message)
    } finally {
      setBusy('')
    }
  }

  async function openSaved(id) {
    setError('')
    let d
    try {
      d = await api.savedClaim(id)
    } catch (err) {
      setError(`Could not open the saved example: ${err.message}`)
      return
    }
    setText(d.text)
    setClaim({ ...d.extracted, lat: d.place.lat, lon: d.place.lon })
    setWhere(`${d.place.name} (saved example)`)
    setCheck(d.check)
    setSaved(`Saved example from ${d.saved_on}: the claim was read by ${d.extracted.model}, the tests were run by our code.`)
  }

  const set = (k) => (e) => { setClaim({ ...claim, [k]: e.target.value }); setCheck(null); setSaved('') }
  const vars = cat || []
  const known = claim && vars.some((v) => v.id === claim.variable)

  return (
    <div className="headline">
      <h2>Check a headline</h2>
      <p className="lead">
        Paste a claim about weather or climate. The AI only reads it into five fields, which you can correct. Then our
        code runs the tests and answers with one of four verdicts: supported, not proven yet, the other way, or cannot be tested.
      </p>
      <div className="chips">
        {examples.map((x) => <button key={x.id} className="chip" onClick={() => openSaved(x.id)}>{x.text}</button>)}
      </div>
      <form className="ask" onSubmit={read}>
        <label>Claim
          <textarea rows="2" maxLength="400" required value={text} placeholder="Paste a claim, for example: Chennai is getting hotter every year."
            onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="fields">
          <label>Team passcode
            <input type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={busy !== ''}>{busy === 'read' ? 'Reading…' : 'Read the claim'}</button>
        </div>
        <p className="small">Reading a new claim runs a live AI model, so it needs the team passcode. The saved examples above are open to everyone.</p>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {claim && (
        <div className="extraction">
          <h3>What the AI read. Correct anything that is wrong.</h3>
          <div className="fields">
            <label>Variable
              <select value={known ? claim.variable : 'NONE'} onChange={set('variable')}>
                {vars.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}
                <option value="NONE">Not in our catalog</option>
              </select>
            </label>
            <label>Place<input value={claim.place} onChange={set('place')} /></label>
            <label>Latitude<input type="number" step="0.01" min="-90" max="90" value={claim.lat} onChange={set('lat')} /></label>
            <label>Longitude<input type="number" step="0.01" min="-180" max="180" value={claim.lon} onChange={set('lon')} /></label>
            <label>From<select value={claim.start_year} onChange={set('start_year')}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></label>
            <label>To<select value={claim.end_year} onChange={set('end_year')}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></label>
            <label>Claimed direction
              <select value={claim.direction} onChange={set('direction')}>
                <option value="up">going up (hotter, wetter, more)</option>
                <option value="down">going down (cooler, drier, less)</option>
              </select>
            </label>
            <button type="button" onClick={async () => setClaim(await locate(claim))}>Find the place again</button>
            <button className="primary" type="button" disabled={busy !== '' || claim.lat === '' || claim.lon === ''} onClick={test}>
              {busy === 'test' ? 'Testing…' : 'Test it'}
            </button>
          </div>
          {known && <p className="small">{vars.find((v) => v.id === claim.variable)?.definition}</p>}
          {where && <p className="small">Place: {where}</p>}
          {saved && <p className="note">{saved}</p>}
        </div>
      )}
      <Result check={check} />
    </div>
  )
}
