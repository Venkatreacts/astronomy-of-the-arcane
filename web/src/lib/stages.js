// The one definition of the three stages and of the rule that makes the honest verdict.
// Every view takes its labels and rule sentences from here, so "honest" never means two things.
export const STAGE = { usual: 'Usual test', pw: 'Stickiness removed', honest: 'Honest verdict' }

export const RULE = {
  place: 'Single-place rule: one place, one test, so the honest verdict is stage 2 at p < 0.05 (no multiple-testing correction needed).',
  map: 'Map rule: many points are tested at once, so the honest verdict is stage 2 plus false discovery control across all tested points (at most 10% of flags expected false) instead of p < 0.05 at each point.',
}
