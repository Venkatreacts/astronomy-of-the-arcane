// The one definition of "honest" used on every page: three stages, and one rule sentence for each scope.
export const STAGE = { usual: 'Usual test', pw: 'Stickiness removed', honest: 'Honest verdict' }
export const RULE = {
  place: 'Single-place rule: one place, one test, so the honest verdict is stage 2 at p < 0.05 (no multiple-testing correction needed).',
  map: 'Map rule: many points are tested at once, so the honest verdict is stage 2 plus false discovery control across all tested points (at most 10% of flags expected false) instead of p < 0.05 at each point.',
  season: 'Season rule: four seasons are tested at once, so a season\'s honest verdict is stage 2 plus false discovery control (Benjamini-Hochberg) across the four seasons (at most 10% of flags expected false) instead of p < 0.05 for each.',
  sweep: 'Sweep rule: many variables are tested at one place, so "survives the sweep" is stage 2 plus false discovery control (Benjamini-Hochberg) across all the variables tested (at most 10% of flags expected false).',
}
export const CLASSROOM = 'Classroom method (t-test)'
