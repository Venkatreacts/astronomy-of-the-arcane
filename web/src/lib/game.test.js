// node --test src/lib/game.test.js  (npm test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickRounds, seedFromURL, scores, PER_KIND } from './game.js'

const pool = JSON.parse(readFileSync(new URL('../../public/data/game.json', import.meta.url), 'utf8')).rounds
const ids = (seed) => pickRounds(pool, seed).map((r) => r.id)

test('the same seed gives the same ten rounds in the same order', () => {
  for (const seed of ['4821', 'class-7b', '1']) {
    assert.deepEqual(ids(seed), ids(seed))
    assert.deepEqual(ids(seedFromURL(`?seed=${seed}`)), ids(seed))
  }
})

test('different seeds give different rounds', () => {
  assert.notDeepEqual(ids('4821'), ids('4822'))
})

test('five real records and five noise series, never a record with its own twin', () => {
  for (const seed of ['4821', 'class-7b', 'x']) {
    const r = pickRounds(pool, seed)
    assert.equal(r.length, 2 * PER_KIND)
    assert.equal(r.filter((x) => x.kind === 'real').length, PER_KIND)
    const pairs = r.map((x) => x.id.split('-')[1])
    assert.equal(new Set(pairs).size, pairs.length)
  }
})

test('scores count matches with the truth', () => {
  const played = pickRounds(pool, '4821')
  const perfect = played.map((r) => (r.kind === 'real' ? 'trend' : 'noise'))
  assert.equal(scores(played, perfect).you, 10)
  assert.equal(scores(played, perfect.map((p) => (p === 'trend' ? 'noise' : 'trend'))).you, 0)
})

test('no seed in the URL means none', () => {
  assert.equal(seedFromURL('?var=T2M'), null)
  assert.equal(seedFromURL('?seed=%20'), null)
})
