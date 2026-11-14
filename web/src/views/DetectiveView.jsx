import { useState } from 'react'
import { api } from '../api'

const EXAMPLES = [
  "What is changing in the Cauvery delta, and is it real or chance?",
  "Is Chennai really getting hotter, or could it be noise?",
  "Is the Punjab farm belt getting wetter? What changes together there?",
  "How often does the usual method find fake trends in sticky data?",
]

const TOOL_LABELS = {
  list_variables: 'Listed available NASA variables',
  analyze_point: 'Analysed one place',
  scan_region: 'Scanned a region',
  noise_check: 'Tested methods on pure noise',
}

export default function DetectiveView() {
  const [question, setQuestion] = useState(EXAMPLES[0])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask(q = question) {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      setResult(await api.ask(q))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>AI Detective</h2>
      <p className="lead">
        Ask a question in plain English. The detective plans an investigation, runs our tested NASA-data tools
        (never its own code), and may only quote numbers those tools returned. Every step is shown below.
      </p>
      <div className="controls wrap">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => { setQuestion(ex); ask(ex) }} disabled={busy}>{ex}</button>
        ))}
      </div>
      <label className="ask">
        Your question
        <textarea rows={2} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <button onClick={() => ask()} disabled={busy || question.trim().length < 5}>
        {busy ? 'Investigating (can take up to a minute)…' : 'Ask the detective'}
      </button>
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
                    {t.ok ? '✓' : '✗'} {TOOL_LABELS[t.tool] || t.tool} <code>{JSON.stringify(t.input)}</code>
                  </summary>
                  <pre>{t.result_preview}</pre>
                </details>
              </li>
            ))}
          </ol>
          <p className="source">Model: {result.model} · AI-generated summary of tool results; check the evidence trail.</p>
        </>
      )}
    </section>
  )
}
