import { useState } from 'react'
import { api } from '../api'
import { download } from '../lib/format'

const EXAMPLES = [
  'What is changing in the Cauvery delta, and is it real or chance?',
  'Compare the Sahel and the US Corn Belt: where is change more convincing?',
  'At Chennai, which of the five variables have a trend that survives the honest test?',
  'Why does soil wetness fool the usual test more than temperature does?',
  'With 30 years of sticky data (phi 0.7), how often does each method find a real trend?',
]

const TOOL_LABELS = {
  list_variables: 'Listed available NASA variables',
  atlas_point: 'Read an atlas sample point (offline)',
  atlas_overview: 'Read the global atlas totals (offline)',
  analyze_point: 'Analysed one place with live NASA data',
  list_regions: 'Listed pre-computed regions (offline)',
  scan_region: 'Scanned a region',
  compare_regions: 'Compared two regions (offline)',
  simulation_lab: 'Checked the simulation lab (synthetic data)',
  noise_check: 'Tested methods on pure noise',
}

function report(turns) {
  const lines = ['# Noise Trap investigation', '', `Exported ${new Date().toISOString()}`, '']
  turns.forEach((t, i) => {
    lines.push(`## Question ${i + 1}`, '', t.question, '', '### Answer', '', t.answer, '')
    if (t.checks) lines.push(`Numbers checked against tool results: ${t.checks.numbers_checked}; untraced: ${t.checks.unverified.join(', ') || 'none'}`, '')
    lines.push('### Evidence trail', '')
    t.trace.forEach((c, k) => {
      lines.push(`${k + 1}. ${c.tool} ${JSON.stringify(c.input)} (${c.ok ? 'ok' : 'failed'})`, '', '```json', JSON.stringify(c.result ?? c.result_preview, null, 2), '```', '')
    })
    lines.push(`Model: ${t.model}`, '')
  })
  return lines.join('\n')
}

function Turn({ t }) {
  const c = t.checks
  return (
    <article className="turn">
      <p className="q">{t.question}</p>
      <div className="answer">{t.answer.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>
      {c && (
        c.unverified.length
          ? <p className="callout" role="note">{c.unverified.length} number{c.unverified.length > 1 ? 's' : ''} in this answer could not be traced to a tool result: {c.unverified.join(', ')}. Treat {c.unverified.length > 1 ? 'them' : 'it'} as unverified.</p>
          : <p className="small checked">All {c.numbers_checked} numbers in this answer were found in the tool results below.</p>
      )}
      <details className="trace">
        <summary>Evidence trail: {t.trace.length} tool call{t.trace.length === 1 ? '' : 's'}</summary>
        <ol>
          {t.trace.map((x, i) => (
            <li key={i}>
              <details>
                <summary>
                  <span className={x.ok ? 'h' : 'u'}>{x.ok ? 'Done' : 'Failed'}</span> · {TOOL_LABELS[x.tool] || x.tool} <code>{JSON.stringify(x.input)}</code>
                </summary>
                <pre>{x.result ? JSON.stringify(x.result, null, 2) : x.result_preview}</pre>
              </details>
            </li>
          ))}
        </ol>
      </details>
      <p className="source">Model: {t.model} · an AI summary of tool results; the evidence trail is the record.</p>
    </article>
  )
}

export default function DetectiveView() {
  const [question, setQuestion] = useState(EXAMPLES[0])
  const [turns, setTurns] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function ask(q = question, followUp = turns.length > 0) {
    setBusy(true)
    setError('')
    try {
      const history = followUp ? turns.slice(-4).map((t) => ({ question: t.question, answer: t.answer })) : []
      const res = await api.ask(q, history)
      setTurns((prev) => [...(followUp ? prev : []), { question: q, ...res }])
      setQuestion('')
    } catch (e) {
      setError(/fetch|NetworkError/i.test(e.message)
        ? 'The detective needs the backend running (and an ANTHROPIC_API_KEY in backend/.env). Everything else on this page works offline.'
        : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Ask the detective</h2>
      <p className="lead">
        Ask in plain English. The detective runs our tested tools on NASA data (never its own code), may only quote
        numbers those tools returned, and every number in its answer is checked against them. Every step is shown.
      </p>
      {turns.length === 0 && (
        <div className="controls wrap">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => { setQuestion(ex); ask(ex, false) }} disabled={busy}>{ex}</button>
          ))}
        </div>
      )}
      {turns.map((t, i) => <Turn key={i} t={t} />)}
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <label>
          {turns.length ? 'Follow-up question' : 'Your question'}
          <textarea rows={2} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        <div className="exports">
          <button className="primary" type="submit" disabled={busy || question.trim().length < 5}>
            {busy ? 'Investigating (can take a minute)…' : turns.length ? 'Ask a follow-up' : 'Ask the detective'}
          </button>
          {turns.length > 0 && <button type="button" disabled={busy} onClick={() => { setTurns([]); setQuestion(EXAMPLES[0]) }}>New investigation</button>}
          {turns.length > 0 && <button type="button" onClick={() => download('noise-trap-investigation.md', report(turns), 'text/markdown')}>Download report</button>}
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
