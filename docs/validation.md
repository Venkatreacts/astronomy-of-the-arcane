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
All pages use one Mann-Kendall implementation (`backend/trendlab/mk.py`): tie-corrected variance of S (Kendall 1975;
Hirsch, Slack & Smith 1982), missing months left missing at their real position (never filled), and lag-1
autocorrelation from consecutive months that are both present, rescaled for the missing pairs. On complete series it
reproduces pymannkendall's `original_test` and `pre_whitening_modification_test` to 1e-10 (`tests/test_mk.py`),
including heavily tied rainfall.

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
| Five unrelated noise maps scanned together, 16 repeats | at most 3 scans with any significant cluster |
| Pixels with more than 10% missing months, or constant values | not tested and shown as missing (before: filled with 0 and drawn as "no trend") |

Three stages per pixel, each at p < 0.05: the usual test, the test after pre-whitening, and pre-whitened p-values with
Benjamini-Hochberg FDR at q = 0.10 across every variable and pixel of the box. With many real trends the FDR threshold
can exceed 0.05, so stage 3 can keep more pixels than stage 2 (Amazon: 305 vs 310).

Clusters are a separate test. Since method version 2 each cluster is compared with the largest cluster on each
time-shuffled map **over all five variables** (one shuffle applied to all of them), which controls the family-wise
error across the scan. Before, each variable had its own null, so with five variables about 23% of pure-noise scans
would show a "significant" cluster somewhere. Rates are now Sen's slopes, as in the point test.

| Region (199 shuffles) | Tests | Usual | Pre-whitened | + FDR | Clusters (before, now) |
|---|---|---|---|---|---|
| Tamil Nadu | 267 | 227 | 177 | 189 | 5, 4 |
| Punjab-Haryana | 315 | 279 | 246 | 256 | 5, 4 |
| Kerala / Western Ghats | 261 | 213 | 171 | 183 | 5, 3 |
| Amazon arc | 315 | 313 | 305 | 310 | 5, 5 |
| Sahel | 270 | 229 | 114 | 105 | 2, 1 |
| US Corn Belt | 270 | 171 | 93 | 84 | 3, 1 |
| Murray-Darling | 270 | 113 | 62 | 58 | 1, 1 |
| Central Spain | 270 | 96 | 65 | 56 | 1, 1 |
| Yakutia | 315 | 116 | 69 | 65 | 1, 1 |

Pixel counts did not change with the tie correction (MERRA-2 values are continuous, so ties are rare after removing
the seasons); only the cluster test became stricter.
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
Re-checked at the real record length (540 months), 300 series per row:

| phi | Complete | 30% of months missing |
|---|---|---|
| 0.0 | 96.3% | 93.0% |
| 0.3 | 95.3% | 98.0% |
| 0.6 | 96.0% | 98.0% |
| 0.8 | 95.7% | 95.0% |

## 6b. Years to detect
"About N more years" is Weatherhead et al. (1998) for a 90% chance of detection with a 5% test. We simulated series of
exactly that length (trend 0.05 per year, noise SD 1, 300 series each): the pre-whitened test detected the trend in
90% (phi 0), 88% (0.3), 88% (0.6) and 85% (0.8) of them. The formula is slightly optimistic for very sticky data, and
the app says so.

## 7. Global Trend Atlas (`backend/scripts/build_atlas.py`, tests in `backend/tests/test_atlas.py`)
NASA POWER monthly point data, 1981-2025, on a 5 degree grid from 57.5 S to 77.5 N (2016 cells; soil wetness has no
value over the ocean, so it covers 721 land cells). Each cell gets both tests on deseasonalised anomalies, then the
honest p values are corrected for testing every cell at once (Benjamini-Hochberg, false discovery rate 10%).
Cells with under 80% of months present are skipped.

| Variable | Points | Usual test | Pre-whitened, p < 0.05 | Pre-whitened + FDR 10% |
|---|---|---|---|---|
| Air temperature | 2016 | 87% | 76% | 79% |
| Rainfall | 2016 | 45% | 37% | 32% |
| Root-zone soil wetness | 721 | 71% | 29% | 19% |
| Relative humidity | 2016 | 58% | 46% | 46% |
| Wind speed at 2 m | 2016 | 45% | 39% | 36% |

These are shares of sampled points (the value at the centre of each 5-degree cell), not shares of the Earth's area:
high-latitude cells are smaller, and soil wetness covers land only. For temperature the FDR threshold is 0.078, above
0.05, which is why the last column can exceed the one before. Each point also has a file in `web/public/data/cells/`
with its full monthly record for all five variables, the 95% range of each rate, and the trend in 1981-2002 and
2003-2025 separately.

Warming survives almost everywhere: it is a strong, real signal. Soil wetness is the trap at its clearest: it is the
stickiest variable (median phi 0.84, against 0.09-0.50 for the others; each month carries the last month's water),
so the usual test calls most of the land changing and only 26% of those calls survive (temperature: 91%). The globe opens on whichever variable has the largest gap.

## 8. Simulation lab (`backend/trendlab/lab.py`, `backend/scripts/build_lab.py`, tests in `backend/tests/test_lab.py`)
240 settings: phi 0 / 0.3 / 0.5 / 0.7 / 0.9; 15 / 30 / 45 years; planted trend 0 / 0.2 / 0.4 / 0.8 noise SDs per decade in
the left half only; independent or spatially correlated neighbours; 0% or 20% of months missing. Each setting runs on 10
independent 20 x 20 maps with fixed seeds, and every rate has a 95% t-interval across those maps (so the interval
reflects map-to-map variation, including spatial correlation). Measures: false-alarm rate, detection power, miss rate,
false discovery proportion, and the share of maps with any false alarm.

45 years, correlated neighbours, no missing months:

| phi | Pure noise: usual | Pure noise: pre-whitened | Pure noise: + FDR | Trend 0.8: power, + FDR | Trend 0.8: empty half flagged, + FDR |
|---|---|---|---|---|---|
| 0.0 | 5.3% | 5.5% | 0.0% | 100% | 6.4% |
| 0.5 | 22.4% | 2.9% | 0.0% | 100% | 7.0% |
| 0.7 | 39.0% | 4.8% | 0.0% | 100% | 6.0% |
| 0.9 | 65.1% | 5.7% | 0.0% | 97.8% | 7.2% |

With a real trend present, Benjamini-Hochberg at q = 0.10 flags about 7% of the trend-free half, so about 1 in 15 of its
flags is wrong: inside the promised false discovery rate. FDR control limits the share of wrong flags; it does not
promise zero false alarms.
