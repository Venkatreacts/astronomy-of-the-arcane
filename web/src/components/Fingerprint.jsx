import { fmt } from '../lib/format'

// All five variables at one atlas point: rate and the verdict of each of the three stages.
export default function Fingerprint({ cell, current, onSelect }) {
  const mark = (b) => (b ? '●' : '·')
  return (
    <table className="fingerprint">
      <caption>All five variables at this point</caption>
      <thead>
        <tr>
          <th scope="col">Variable</th><th scope="col">Per decade</th>
          <th scope="col" className="u">Usual</th><th scope="col">No sticky</th><th scope="col" className="h">Honest</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(cell.vars).map(([id, v]) => (
          <tr key={id} className={id === current ? 'on' : ''}>
            <th scope="row">
              {onSelect && id !== current
                ? <button className="link" onClick={() => onSelect(id)}>{v.name}</button>
                : v.name}
            </th>
            <td>{fmt(v.rate, true)} {v.units}</td>
            <td className="u" aria-label={v.p_naive < 0.05 ? 'trend' : 'no trend'}>{mark(v.p_naive < 0.05)}</td>
            <td aria-label={v.p_honest < 0.05 ? 'trend' : 'no trend'}>{mark(v.p_honest < 0.05)}</td>
            <td className="h" aria-label={v.fdr ? 'trend' : 'not proven'}>{mark(v.fdr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
