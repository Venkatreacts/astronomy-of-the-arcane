# Design: Region Scanner, Trend Regimes and AI Detective

Approved by the team on 14 Nov 2026. Builds on the existing `trendlab` engine.

## Why
The challenge asks users to find variables that are trending and say whether trends are significant.
Scanning a whole region across many variables is the natural next step, but it multiplies the
multiple-testing problem: 6 variables x 88 pixels = 528 tests, so about 26 fake "trends" at p < 0.05.
The scanner must find real patterns and prove they are not chance.

## Goals
- Scan a 2-5 degree box across 6 NASA POWER variables (no login) in about a minute.
- Report only trend clusters that survive a permutation test; control false discoveries across all tests.
- Group places with the same multi-variable trend fingerprint (ML regimes), labelled as description, not proof.
- An AI Detective that answers plain-English questions by calling our tested tools and shows its evidence.

## Non-goals / anti-goals
- No causal claims ("X caused Y"). No agent-written code. No numbers on screen that a tool did not compute.
- Not a replacement for gridded satellite products; POWER is MERRA-2-based reanalysis at 0.5 degrees and is labelled so.

## Approaches considered
1. **Pixel-wise FDR only:** simple, but says nothing about coherent regions. Kept as one layer.
2. **Cluster-based permutation (chosen core):** from neuroimaging, evaluated for environmental trends by
   Cortes et al. (2020, Environ. Ecol. Stat. 27:293-318). Permuting time jointly across the map keeps the
   spatial correlation. We permute pre-whitened series, so autocorrelation is removed first.
3. **Bayesian spatial model (Haug et al. 2020):** strongest, but too slow and complex for this weekend.

## Method
- Data: NASA POWER monthly regional API, one variable per call, 1981-2025, 0.5 x 0.625 degree grid.
  Variables: T2M, PRECTOTCORR, GWETROOT, RH2M, WS2M. (ALLSKY_SFC_SW_DWN dropped: coarser 1-degree grid; each variable uses its own date range.)
- Per pixel: monthly anomalies; lag-1 pre-whitening; vectorized Mann-Kendall (checked against pymannkendall);
  least-squares rate per decade for display.
- Cluster forming: |z| > 1.96, same sign, 8-connected. Cluster mass = sum |z|.
  Null: 199 joint time permutations of the pre-whitened map; max cluster mass per permutation.
  Cluster p = (1 + #null >= mass) / (1 + permutations). Controls the chance of any false cluster (family-wise).
- Global Benjamini-Hochberg FDR (alpha_FDR = 0.10) across all variables x pixels.
- Regimes: k-means on per-pixel z fingerprints (k = 2-5 chosen by silhouette; none if silhouette < 0.25).
- Compound patterns: significant clusters of different variables overlapping by >= 3 pixels.

## AI Detective
- Claude with tool use; tools: list_variables, analyze_point, scan_region, noise_check.
- Max 6 tool calls; must cite only tool outputs; must state uncertainty; UI shows every tool call and result.
- Rationale: agents that write their own code fail often (UnivEARTH benchmark: code failed to run 44% of the time).
- Runs only when ANTHROPIC_API_KEY is set on the server; the app works without it.

## Validation
- Noise maps: share of scans with any significant cluster should be about 5%.
- Planted regional trend: scanner must find it.
- Vectorized test matches pymannkendall pre-whitening p-values.

## Left to the builder
Exact cache layout, UI layout, regime naming words, agent prompt wording.
