// API base: same origin in development (Vite proxy). Set VITE_API_URL when the API is hosted elsewhere.
const BASE = import.meta.env.VITE_API_URL || ''
// Pre-computed files from backend/scripts/build_static.py, served with the web app (work with no server).
const STATIC = `${import.meta.env.BASE_URL}data`

async function getStatic(path) {
  const res = await fetch(`${STATIC}/${path}`)
  // dev servers and static hosts answer a missing file with index.html, so a JSON parse failure means missing too
  // soil wetness is a 0-1 index; say so instead of printing a bare "0-1" after every number
  const data = res.ok ? await res.text().then((t) => JSON.parse(t, (k, v) => (k === 'units' && v === '0-1' ? 'index (0–1)' : v))).catch(() => null) : null
  if (!data) throw new Error(`Missing demo file ${path} (run the build scripts in backend/scripts)`)
  return data
}

// A 5xx with no JSON detail comes from the dev proxy or host, not our API: the backend is not running.
const unreachable = () => new Error('Could not reach the backend (NetworkError).')

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (!body.detail && res.status >= 500) throw unreachable()
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (!err.detail && res.status >= 500) throw unreachable()
    throw new Error(typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  // a live question needs the team passcode (checked by the server); saved answers are static files
  ask: (question, history = [], passcode = '') =>
    post('/api/agent', { question, history }, { 'X-Demo-Passcode': passcode }),
  savedAnswers: () => getStatic('detective/index.json'),
  savedAnswer: (id) => getStatic(`detective/${encodeURIComponent(id)}.json`),
  params: () => get('/api/params'),
  cases: () => getStatic('cases/index.json'),
  caseFile: (id) => getStatic(`cases/${encodeURIComponent(id)}.json`),
  point: ({ lat, lon, param }) =>
    get(`/api/point?lat=${lat}&lon=${lon}&param=${encodeURIComponent(param)}`),
  scanPresets: () => getStatic('scans/index.json').catch(() => get('/api/scan/presets')),
  scanPreset: (id) => getStatic(`scans/${encodeURIComponent(id)}.json`),
  scan: ([latMin, latMax, lonMin, lonMax]) =>
    get(`/api/scan?lat_min=${latMin}&lat_max=${latMax}&lon_min=${lonMin}&lon_max=${lonMax}`),
  atlasIndex: () => getStatic('atlas/index.json'),
  atlas: (id) => getStatic(`atlas/${encodeURIComponent(id)}.json`),
  // one pre-computed file per atlas sample point, with all five variables (works offline)
  cell: (lat, lon) => {
    const f = (v) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(1)}`
    // '+' is a literal character in a URL path; encoding it as %2B makes static servers miss the file
    return getStatic(`cells/${f(lat)}_${f(lon)}.json`)
  },
  lab: () => getStatic('lab/lab.json'),
  noiseTrap: ({ phi, trend = 0 }) => getStatic(`noise/phi${phi.toFixed(1)}_trend${trend.toFixed(1)}.json`),
}
