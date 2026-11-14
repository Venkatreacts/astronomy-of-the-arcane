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

export const api = {
  params: () => get('/api/params'),
  cases: () => get('/api/cases'),
  caseFile: (id) => get(`/api/cases/${encodeURIComponent(id)}`),
  point: ({ lat, lon, param }) =>
    get(`/api/point?lat=${lat}&lon=${lon}&param=${encodeURIComponent(param)}`),
  noiseTrap: ({ phi, size, seed }) =>
    get(`/api/noise-trap?phi=${phi}&size=${size}${seed != null ? `&seed=${seed}` : ''}`),
}
