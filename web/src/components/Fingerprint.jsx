import { rate } from '../lib/format'
import { RULE, STAGE } from '../lib/stages'

// All five variables at one atlas point: rate and the verdict of each of the three stages.
// rule 'place' (place page) or 'map' (globe) decides the honest verdict column; the table states which.
export default function Fingerprint({ cell, current, onSelect, rule = 'place', ruleNote = true }) {
  const honest = (v) => (rule === 'map' ? v.fdr : v.p_honest < 0.05)
  const mark = (b) => (b ? '●' : '·')
  return (
    <table className="fingerprint">
      <caption>All five variables at this point</caption>
      <thead>
        <tr>
          <th scope="col">Variable</th><th scope="col">Per decade</th>
          <th scope="col" className="u">{STAGE.usual}</th><th scope="col">{STAGE.pw}</th><th scope="col" className="h">{STAGE.honest}</th>
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
            <td>{rate(v.rate)} {v.units}</td>
            <td className="u" aria-label={v.p_naive < 0.05 ? 'trend' : 'no trend'}>{mark(v.p_naive < 0.05)}</td>
            <td aria-label={v.p_honest < 0.05 ? 'trend' : 'no trend'}>{mark(v.p_honest < 0.05)}</td>
            <td className="h" aria-label={honest(v) ? 'trend' : 'not proven'}>{mark(honest(v))}</td>
          </tr>
        ))}
      </tbody>
      {ruleNote && <tfoot><tr><td colSpan="5" className="small rule">{RULE[rule]}</td></tr></tfoot>}
    </table>
  )
}
