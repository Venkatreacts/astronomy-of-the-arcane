# Validation: does the engine catch fake trends?

Run it yourself: `cd backend && python -m trendlab.validate` (about 1 minute).
Simulated monthly series of 300 months (25 years). Significance level 5%.

## 1. False alarms on pure noise (no trend exists, so the right answer is ~5%)

| Autocorrelation (phi) | Plain Mann-Kendall | Noise Trap (pre-whitened) |
|---|---|---|
| 0.0 | 3.4% | 4.2% |
| 0.3 | 13.2% | 4.0% |
| 0.6 | **32.0%** | **3.8%** |

Real climate series are "sticky" (this month resembles last month). The plain test then calls one in three noise series a trend. Ours stays near 5%.

## 2. Catching real trends (higher is better)

| Injected trend (SD per decade), phi = 0.3 | Plain | Noise Trap |
|---|---|---|
| 0.1 | 26.7% | 13.0% |
| 0.2 | 63.0% | 39.0% |
| 0.4 | 98.3% | 92.7% |

The plain test's higher numbers are partly fake: it also says "trend" far too often when there is none (table 1). Strong trends are caught by both. The price of honesty is that weak trends need more years, which is exactly what the years-to-detect card tells the user.

## 3. A map of pure noise (30 x 30 pixels, phi = 0.5, spatially correlated)

| Method | Pixels flagged "significant" |
|---|---|
| Plain test, every pixel at p < 0.05 | **15.6%** |
| Noise Trap: pre-whitened test + false discovery rate control (alpha_FDR = 0.10) | **0.0%** |

## Method choice (tested, not assumed)
We compared six corrections on the same simulations. Hamed-Rao (all lags) still gave 10-15% false alarms; Yue-Wang gave up to 49%; trend-free pre-whitening rose to 40% at phi = 0.6. Plain pre-whitening (Kulkarni & von Storch 1995) was the only one near 5% at every autocorrelation level, so it is our "honest" test. Rates of change come from Sen's slope on the original data.

## Limits
- Simulations use AR(1) noise; real data can have longer memory, which this does not cover.
- Linear trends only, as the challenge scopes.
- False discovery rate control is debated for spatially coherent signals (Schutte et al. 2026, EGU preprint).

## 4. Region Scanner (tests in `backend/tests/test_scan.py`)

| Check | Result |
|---|---|
| Fast all-pixels test vs pymannkendall pre-whitening | p-values agree within 0.01 |
| 12 maps of pure noise (autocorrelation 0.4, spatially correlated), 49 permutations each | at most 3 scans showed any "significant" cluster (about 5% expected) |
| A regional trend planted in noise (0.8 SD per decade in a 4x4 block) | found as a rising cluster, at least 10 of its pixels inside the block |
| Two planted trend regimes ("warming + drying soil" vs the opposite) | k-means recovers 2 regimes, silhouette > 0.5 |

Real scans (NASA POWER, 1981-2025, 199 permutations, about 30 s each): Tamil Nadu 267 tests, 5 clusters pass;
Punjab-Haryana 315 tests, 5 clusters pass (rising humidity and rainfall, cooling); Kerala/Western Ghats 261 tests, 5 clusters pass.
Sunlight is not scanned: it comes on a coarser 1-degree grid, and stretching it would duplicate pixels.

## 5. Noise Trap demo maps, with and without a real trend (20 x 20, 25 years, seed 0)

Built by `backend/scripts/build_static.py`. "Trend" = 0.8 noise SDs per decade added to the left half only.

| Stickiness phi | Pure noise: usual / ours | With trend, usual: trend half / trend-free half | With trend, ours: trend half / trend-free half |
|---|---|---|---|
| 0.0 | 6% / 0% | 100% / 8% | 100% / 6% |
| 0.3 | 12% / 0% | 100% / 13% | 100% / 6% |
| 0.5 | 21% / 0% | 100% / 24% | 100% / 5% |
| 0.7 | 36% / 0% | 100% / 41% | 94% / 4% |
| 0.8 | 46% / 0% | 100% / 54% | 55% / 1% |
| 0.9 | 64% / 0% | 98% / 68% | 0% / 0% |

Up to phi = 0.7 the honest method finds nearly all of a real trend and stays near 5% where there is none. At phi >= 0.8 it
loses power: very sticky data needs a longer record. The app says this on screen when it happens.

## 6. Confidence interval for the rate of change
`slope_ci_per_year` = Theil-Sen 95% interval on the real month positions, each half widened by
sqrt((1 + phi) / (1 - phi)) for autocorrelation. This widening is an approximation.
With 30% of months missing it contained the true rate in 95% of 300 simulated series (test: 88+ of 100).

## 7. Global Trend Atlas (`backend/scripts/build_atlas.py`, tests in `backend/tests/test_atlas.py`)
NASA POWER monthly point data, 1981-2025, on a 5 degree grid from 57.5 S to 77.5 N (2016 cells; soil wetness has no
value over the ocean, so it covers 721 land cells). Each cell gets both tests on deseasonalised anomalies, then the
honest p values are corrected for testing every cell at once (Benjamini-Hochberg, false discovery rate 10%).
Cells with under 80% of months present are skipped.

| Variable | Cells | Usual test finds a trend | Honest test + FDR keeps it |
|---|---|---|---|
| Air temperature | 2016 | 87% | 79% |
| Rainfall | 2016 | 45% | 32% |
| Root-zone soil wetness | 721 | 71% | 19% |
| Relative humidity | 2016 | 58% | 46% |
| Wind speed at 2 m | 2016 | 45% | 36% |

Warming survives almost everywhere: it is a strong, real signal. Soil wetness is the trap at its clearest: it is the
stickiest variable (median phi 0.84, against 0.09-0.50 for the others; each month carries the last month's water),
so the usual test calls most of the land changing and only 26% of those calls survive (temperature: 91%). The globe opens on whichever variable has the largest gap.
