// "Train your eye": seeded choice of ten rounds from web/public/data/game.json (backend/scripts/build_game.py).
// The same seed gives the same ten rounds in the same order on every machine, so a class can play together.

export const PER_KIND = 5

// Any text seed becomes a 32-bit number (FNV-1a), so "class-7b" works as well as "4821".
export function seedNumber(seed) {
  let h = 0x811c9dc5
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// mulberry32: small, fast, and identical in every JavaScript engine
export function random(seed) {
  let a = seedNumber(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(xs, rand) {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Five real records and five noise series, mixed. A real record and its own noise twin never both appear.
export function pickRounds(rounds, seed) {
  const rand = random(seed)
  const real = shuffle(rounds.filter((r) => r.kind === 'real'), rand).slice(0, PER_KIND)
  const used = new Set(real.map((r) => r.id.split('-')[1]))
  const noise = shuffle(rounds.filter((r) => r.kind === 'noise' && !used.has(r.id.split('-')[1])), rand).slice(0, PER_KIND)
  return shuffle([...real, ...noise], rand)
}

export function seedFromURL(search = window.location.search) {
  const s = new URLSearchParams(search).get('seed')
  return s && s.trim() ? s.trim().slice(0, 40) : null
}

export const truth = (r) => (r.kind === 'real' ? 'trend' : 'noise')
export const says = (test) => (test.trend ? 'trend' : 'noise')

export function scores(played, picks) {
  const right = (f) => played.filter((r, k) => f(r, k) === truth(r)).length
  return {
    you: right((r, k) => picks[k]),
    usual: right((r) => says(r.usual)),
    honest: right((r) => says(r.honest)),
    usualFalse: played.filter((r) => r.kind === 'noise' && r.usual.trend).length,
    honestFalse: played.filter((r) => r.kind === 'noise' && r.honest.trend).length,
  }
}
