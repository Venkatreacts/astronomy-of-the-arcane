// Who uses Noise Trap and what it adds. Every number here comes from the published files (see docs/validation.md).
const USES = [
  {
    who: 'Reporters and fact-checkers',
    what: 'A headline says rainfall is rising in your district. Pick the place, see whether the trend survives three tests, and download a verdict card with a link that reopens the evidence.',
    go: '#atlas', cta: 'Check a place',
  },
  {
    who: 'Planners and farm advisers',
    what: 'See which changes at your place are already proven and which are not yet, with roughly how many more years of data would settle them. Scan a region to see whether a change is local or part of a larger patch.',
    go: '#place', cta: 'Open your place',
  },
  {
    who: 'Teachers and students',
    what: 'The lab plants trends in fake data, so the right answer is known. Watch the usual test invent trends in pure noise and the honest verdict refuse to, one setting at a time.',
    go: '#trap', cta: 'Try the lab',
  },
  {
    who: 'Researchers',
    what: 'A first screen of NASA POWER (MERRA-2) monthly data with the autocorrelation and multiple-testing corrections already done. Every number can be rebuilt from the published files and scripts.',
    go: '#method', cta: 'Read the method',
  },
]

const ADDS = [
  ['Three tests on the same data, side by side', 'so you can see exactly which trends the usual test invents.'],
  ['Proof on fake data', 'where the true answer is known: 240 settings, each run on 10 maps.'],
  ['A number for “not yet”', 'the years of data still needed before a trend could be proven.'],
  ['An AI detective that shows its work', 'every number in its answer is matched against the evidence it fetched, and any unmatched number is flagged.'],
  ['Works offline', '2,016 sample points and five variables ship inside the app.'],
]

export default function WhoView() {
  return (
    <div className="who">
      <h2>A trend map shows what changed. Noise Trap shows what the data can prove.</h2>
      <p className="lead">
        Claims like “rainfall is rising here” usually rest on a test that treats every month as independent. Real
        weather is not independent: each month carries some of the last. That makes the usual test find trends in pure
        noise. Noise Trap checks the same claim the honest way, on NASA data, in a few clicks.
      </p>
      <div className="uses">
        {USES.map((u) => (
          <article key={u.who}>
            <h3>{u.who}</h3>
            <p>{u.what}</p>
            <a href={u.go}>{u.cta}</a>
          </article>
        ))}
      </div>
      <h3 className="adds-head">What Noise Trap adds</h3>
      <ol className="adds">
        {ADDS.map(([head, rest]) => <li key={head}><strong>{head}</strong>, {rest}</li>)}
      </ol>
    </div>
  )
}
