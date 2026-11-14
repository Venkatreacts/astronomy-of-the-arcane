# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: NASA Space Apps 2026 judges on demo day and curious non-experts. They give the site about 30 seconds, often on a laptop or projector, and must leave knowing what the product does and why it is trustworthy.

## Product Purpose

Noise Trap answers one question about Earth data: "Is this trend real, or is it noise?" The usual trend test (plain Mann-Kendall) treats every month as independent; real climate data is "sticky" (autocorrelated), so the usual test reports trends in pure noise. Noise Trap runs the usual test and an honest one side by side on NASA data, shows the gap, and says how many more years are needed when a trend is not yet proven. Success: a viewer sees a claimed trend fall apart (or survive) and understands why.

Challenge: "Be An Earth System Trend Detective!" (NASA Space Apps 2026).

## Positioning

Not another climate dashboard. The mechanism is the comparison: the usual test vs the honest test (pre-whitened Mann-Kendall, Kulkarni & von Storch 1995) with false-discovery-rate control across a map (Benjamini-Hochberg, alpha_FDR 0.10, Wilks 2016), validated on simulations where the true answer is known.

## Operating Context

- Demo is offline-capable: static data in `web/public/data` must work with no internet and no backend.
- Live features (any place on Earth, region scan, AI Detective) need the FastAPI backend and NASA POWER.
- Judging criteria: Impact, Creativity, Validity, Relevance, Presentation.

## Capabilities and Constraints

- Noise Trap: pure-noise maps at stickiness phi 0-0.9, plus a positive control (a real trend planted in half the map).
- Global Trend Atlas: 5-degree world grid, five NASA POWER variables (air temperature, rainfall, root-zone soil wetness, relative humidity, wind speed), 1981-2025.
- Investigate any place: monthly NASA POWER point series, usual vs honest verdict, 95% range, years-to-detect.
- Region Scanner: 0.5-degree grid in a 2-5 degree box, cluster permutation test, k-means trend regimes.
- AI Detective: Claude agent that calls the same tools and shows its evidence trail; needs ANTHROPIC_API_KEY.
- Do not rename or remove fields in the Series, Analysis or Map JSON. Do not change the honest test.

## Brand Commitments

- Name: Noise Trap. Team: Astronomy of the Arcane.
- Colour-blind-safe pair: orange `#d55e00` = usual method, blue `#0072b2` = honest test.
- Plain language: short sentences, no unexplained jargon.

## Evidence on Hand

- `docs/validation.md`: false-alarm rates, positive control, CI coverage, scanner checks.
- Real cases: Chennai temperature (usual says rising, honest says not proven), Punjab scan (wetter, more humid, cooler is real).
- No testimonials, users or press exist; do not invent them.

## Product Principles

1. Show the trap before the answer: let people see the usual method fail.
2. Every claim on screen comes from data in the repo or a live NASA call.
3. Say "not proven yet" plainly, with how many years it would take.
4. Works offline for the demo.
