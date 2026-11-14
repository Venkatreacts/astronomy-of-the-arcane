import { useEffect, useState } from 'react'
import { api } from '../api'

const TOOL_LABELS = {
  list_variables: 'Listed available NASA variables',
  analyze_point: 'Analysed one place',
  scan_region: 'Read a region scan',
  noise_check: 'Tested methods on pure noise',
}

export default function DetectiveView() {
  const [saved, setSaved] = useState([]) // questions answered ahead of time, so they open instantly and offline
  const [question, setQuestion] = useState('')
  const [passcode, setPasscode] = useState('') // kept in page memory only
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.savedAnswers().then(setSaved).catch(() => {}) }, [])

  async function show(load) {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await load())
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Could not reach the live server. The saved answers above still work.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Ask the detective</h2>
      <p className="lead">
        Ask a question in plain English. The detective plans an investigation, runs our tested NASA-data tools
        (never its own code), and may only quote numbers those tools or our checked notes gave it. Every step is shown below.
      </p>
      {saved.length > 0 && (
        <div className="controls wrap">
          {saved.map((s) => (
            <button key={s.id} className="chip" disabled={busy}
              onClick={() => { setQuestion(s.question); show(() => api.savedAnswer(s.id)) }}>{s.question}</button>
          ))}
        </div>
      )}
      <form className="askform" onSubmit={(e) => { e.preventDefault(); show(() => api.ask(question, passcode)) }}>
        <label className="ask">
          Your own question
          <textarea rows={2} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <label className="ask pass">
          Team passcode
          <input type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || question.trim().length < 5 || !passcode}>
          {busy ? 'Investigating (can take up to a minute)…' : 'Ask the detective'}
        </button>
      </form>
      <p className="small">
        {saved.length > 0 && 'The questions above were answered ahead of time and open instantly. '}
        A new question runs a live AI model, so it needs the team passcode.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <>
          <h3>Answer</h3>
          <div className="card answer">{result.answer.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>
          <h3>Evidence trail ({result.trace.length} tool calls)</h3>
          <ol className="trace">
            {result.trace.map((t, i) => (
              <li key={i}>
                <details>
                  <summary>
                    <span className={t.ok ? 'h' : 'u'}>{t.ok ? 'Done' : 'Failed'}</span> · {TOOL_LABELS[t.tool] || t.tool} <code>{JSON.stringify(t.input)}</code>
                  </summary>
                  <pre>{t.result_preview}</pre>
                </details>
              </li>
            ))}
          </ol>
          <p className="source">
            {result.saved_on ? `Saved answer from ${result.saved_on} · ` : ''}Model: {result.model} · AI-generated summary
            of tool results; check the evidence trail.
          </p>
        </>
      )}
    </section>
  )
}
