// One shape for a place's record, whether it came from a pre-computed atlas point (offline) or the live API.
// Every statistic here was computed by the Python engine; this file only rearranges and subtracts the
// published monthly normals to draw anomalies.

function monthDates(first, count) {
  const y0 = Number(first.slice(0, 4))
  const m0 = Number(first.slice(5, 7)) - 1
  return Array.from({ length: count }, (_, k) => {
    const m = m0 + k
    return `${y0 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`
  })
}

// From a web/public/data/cells/*.json file (built by backend/scripts/build_atlas.py).
export function fromCell(cell, varId) {
  const v = cell.vars[varId]
  if (!v) return null
  const dates = monthDates(v.first, v.months)
  const anomalies = v.values.map((x, k) => (x == null ? null : x - v.clim[Number(dates[k].slice(5, 7)) - 1]))
  const ci = [v.rate_lo / 10, v.rate_hi / 10]
  return {
    kind: 'atlas',
    id: varId, name: v.name, units: v.units, rising: v.rising, falling: v.falling,
    lat: cell.lat, lon: cell.lon, dates, values: v.values, anomalies, clim: v.clim,
    n: v.n, months: v.months,
    naive: { p: v.p_naive, z: v.z_naive, significant: v.p_naive < 0.05 },
    honest: { p: v.p_honest, z: v.z_honest, significant: v.p_honest < 0.05,
      slope_per_year: v.rate / 10, slope_ci_per_year: ci },
    fdr: { significant: v.fdr, threshold: v.fdr_threshold },
    noise: { phi: v.phi, sigma_n: v.sigma },
    record_years: v.n / 12,
    years_more_needed: v.more_years,
    halves: v.halves,
    source: 'NASA POWER monthly point data (MERRA-2 based), pre-computed for the Global Trend Atlas. '
      + 'Value at this grid point, not an average over the 5° cell.',
  }
}

// From GET /api/point (live NASA POWER through the backend).
export function fromLive(data, lat, lon, id) {
  const a = data.analysis
  const clim = Array.from({ length: 12 }, (_, m) => {
    const xs = data.values.filter((x, k) => x != null && Number(data.dates[k].slice(5, 7)) === m + 1)
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
  })
  return {
    kind: 'live',
    id, name: data.name, units: data.units, lat, lon,
    dates: data.dates, values: data.values, anomalies: a.anomalies, clim,
    n: data.values.filter((x) => x != null).length, months: data.values.length,
    naive: a.naive, honest: a.honest, fdr: null,
    noise: a.noise, record_years: a.record_years, years_more_needed: a.years_more_needed,
    halves: null,
    source: data.source,
  }
}

export function toCSV(r) {
  const head = `# ${r.name} (${r.units}) at ${r.lat}, ${r.lon}. ${r.source}\n# anomaly = value minus that calendar month's mean over the record\ndate,value,anomaly\n`
  return head + r.dates.map((d, k) => `${d},${r.values[k] ?? ''},${r.anomalies[k] == null ? '' : +r.anomalies[k].toFixed(4)}`).join('\n')
}

export function toJSON(r) {
  const { kind, id, name, units, lat, lon, dates, values, n, months, naive, honest, fdr, noise,
    record_years: years, years_more_needed: more, halves, source } = r
  return JSON.stringify({
    provenance: {
      source, retrieved_via: kind === 'atlas' ? 'pre-computed atlas point' : 'live NASA POWER request',
      methods: {
        usual: 'Mann-Kendall on monthly anomalies, p < 0.05',
        pre_whitened: 'Mann-Kendall after lag-1 pre-whitening (Kulkarni & von Storch 1995), p < 0.05',
        fdr: 'Benjamini-Hochberg, q = 0.10 across all atlas points of this variable (atlas points only)',
        rate: "Sen's slope on real month positions; 95% range widened by sqrt((1+phi)/(1-phi))",
      },
      exported: new Date().toISOString(),
    },
    place: { lat, lon }, variable: { id, name, units }, months, months_present: n,
    results: { usual: naive, pre_whitened: honest, fdr, noise, record_years: years, years_more_needed: more, halves },
    series: dates.map((d, k) => [d, values[k]]),
  }, null, 2)
}
