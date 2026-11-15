// "Check it yourself": what to type into NASA Giovanni to rebuild a result from the source data, plus links to
// Giovanni, AppEEARS and KNMI Climate Explorer. A point becomes one NASA POWER / MERRA-2 grid cell (0.5° x 0.625°).
import { useCatalog } from '../lib/catalog'

const LINKS = [
  ['NASA Giovanni', 'https://giovanni.gsfc.nasa.gov/giovanni/'],
  ['NASA AppEEARS', 'https://appeears.earthdatacloud.nasa.gov/'],
  ['KNMI Climate Explorer', 'https://climexp.knmi.nl/start.cgi'],
]

const r2 = (x) => Number(x.toFixed(2))

// box = [south, north, west, east]; or a point { lat, lon }
function giovanniBox({ box, lat, lon }) {
  const [s, n, w, e] = box ?? [lat - 0.25, lat + 0.25, lon - 0.3125, lon + 0.3125]
  return `${r2(w)},${r2(s)},${r2(e)},${r2(n)}`
}

export default function CheckIt({ ids, box, lat, lon, start = 1981, end = 2025, note }) {
  const cat = useCatalog()
  const vars = (cat || []).filter((v) => ids.includes(v.id))
  return (
    <div className="checkit">
      <h4>Check it yourself</h4>
      <p className="small">
        In NASA Giovanni choose “Time series, area-averaged”, set the area (west, south, east, north) to{' '}
        <code>{giovanniBox({ box, lat, lon })}</code> and the dates to <code>{start}-01</code> to <code>{end}-12</code>,
        then pick the dataset below. Our numbers come from NASA POWER, which serves this MERRA-2 data at points
        {note ? `; ${note}` : ''}.
      </p>
      {vars.length > 0 && (
        <ul className="small datasets">
          {vars.map((v) => <li key={v.id}><b>{v.name}</b> ({v.id}): {v.giovanni}</li>)}
        </ul>
      )}
      <p className="small links">
        {LINKS.map(([name, href], i) => <span key={name}>{i > 0 && ' · '}<a href={href} target="_blank" rel="noreferrer">{name}</a></span>)}
      </p>
    </div>
  )
}
