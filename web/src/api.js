// API base: same origin in development (Vite proxy). Set VITE_API_URL when the API is hosted elsewhere.
const BASE = import.meta.env.VITE_API_URL || ''

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
  noiseTrap: ({ phi, size, seed }) =>
    get(`/api/noise-trap?phi=${phi}&size=${size}${seed != null ? `&seed=${seed}` : ''}`),
}
