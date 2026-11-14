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
