// API base: same origin in development (Vite proxy). Set VITE_API_URL when the API is hosted elsewhere.
const BASE = import.meta.env.VITE_API_URL || ''
// Pre-computed files from backend/scripts/build_static.py, served with the web app (work with no server).
const STATIC = `${import.meta.env.BASE_URL}data`

async function getStatic(path) {
  const res = await fetch(`${STATIC}/${path}`)
  if (!res.ok) throw new Error(`Missing demo file ${path} (run backend/scripts/build_static.py)`)
  return res.json()
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.detail === 'string' ? err.detail : `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  ask: (question) => post('/api/agent', { question }),
  params: () => get('/api/params'),
  cases: () => get('/api/cases'),
  caseFile: (id) => get(`/api/cases/${encodeURIComponent(id)}`),
  point: ({ lat, lon, param }) =>
    get(`/api/point?lat=${lat}&lon=${lon}&param=${encodeURIComponent(param)}`),
  scanPresets: () => get('/api/scan/presets'),
  scan: ([latMin, latMax, lonMin, lonMax]) =>
    get(`/api/scan?lat_min=${latMin}&lat_max=${latMax}&lon_min=${lonMin}&lon_max=${lonMax}`),
  noiseTrap: ({ phi, trend = 0 }) => getStatic(`noise/phi${phi.toFixed(1)}_trend${trend.toFixed(1)}.json`),
}
