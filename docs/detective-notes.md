# Notes for the Noise Trap Detective

These notes are added to the AI Detective's instructions before every question. Keep them short, true, and in plain
words. Every number here is copied from `docs/validation.md`; update both together. Do not add a number that was not
measured.

## The three stages of evidence
1. **Usual test**: plain Mann-Kendall, p < 0.05. It asks whether later months tend to be higher (or lower) than
   earlier ones, and it assumes each month is independent of the month before.
2. **Stickiness removed**: the same test after lag-1 pre-whitening (Kulkarni and von Storch 1995), p < 0.05. We first
   remove the part of each month that just repeats the month before, then test what is left. For one place, this is
   the honest verdict.
3. **Honest (maps and the atlas)**: stage 2 plus false-discovery control across every place tested at once
   (Benjamini-Hochberg, false discovery rate 10%; Wilks 2016).

- Why it matters: real monthly Earth data is "sticky" (autocorrelated). A wet month tends to follow a wet month.
  Sticky noise makes long runs that look like trends, and the usual test is fooled by them.
- Stage 3 can keep slightly more places than stage 2. When many places really trend, the false-discovery bar can be
  looser than 0.05 (for atlas temperature it is 0.078). It is not a subset of stage 2.
- **Region clusters are a separate test.** A cluster of neighbouring pixels counts only if it is larger than the
  largest cluster on 95% of time-shuffled maps, with one shuffle applied to all five variables together. Never call
  a cluster "significant" because of stage 1, 2 or 3; say it beat the shuffle test.
- **Rate of change** = Sen's slope (the middle value of all point-to-point slopes), per decade, on the real month
  positions when months are missing. Its 95% range is widened for stickiness; this widening is an approximation.
- **Seasons** are removed first: each month is compared with the average of the same calendar month.
- Ties in the data are handled by the tie-corrected Mann-Kendall variance.

## What we measured about the methods (synthetic data, where the truth is known)
- Single series, 25 years, phi 0.6: the usual test called 32.0% of pure-noise series a trend; the pre-whitened test
  3.8%. A correct 5% test should be near 5%.
- Noise Trap demo map (20 x 20, 25 years, phi 0.5): the usual test flagged 21% of pure noise; the honest method 0%.
  With a real trend of 0.8 noise-widths per decade in the left half, both found 100% of it; on the empty half the
  usual test flagged 24% and the honest method 5%.
- At phi 0.8 the honest method found only 55% of that trend in 25 years, and at phi 0.9 none: very sticky data needs a
  longer record. Weak trends need more years too.
- Simulation lab, 45 years, correlated neighbours: on pure noise the usual test flagged 5.3% (phi 0), 22.4% (0.5),
  39.0% (0.7) and 65.1% (0.9); with false-discovery control, 0.0% at every phi. With a 0.8 trend present, the honest
  method flagged about 7% of the trend-free half: inside the promised 10% false discovery rate, not zero.
- The 95% range contained the true rate in 95.3% to 96.3% of simulated complete series, and 93.0% to 98.0% with 30% of
  months missing.
- "Years until detectable" (Weatherhead et al. 1998, 90% chance with a 5% test) is slightly optimistic for sticky data:
  at exactly that length the pre-whitened test found the trend in 90% (phi 0), 88% (0.3 and 0.6) and 85% (0.8) of
  simulated series.

## The global atlas
- One NASA POWER point every 5 degrees, 1981-2025: the value at the centre of each cell, not an average over it. Shares
  are shares of sampled points, never shares of the Earth's area.
- Soil wetness is the stickiest variable (median phi 0.84, against 0.09-0.50 for the others). The usual test calls 71%
  of its 721 land points changing; after removing stickiness 29%; honest 19%. For temperature: 87%, 76%, 79%.

## How to word a verdict
- Usual says trend, honest says no: "The data cannot yet rule out noise." Never say "there is no trend" and never say
  "the trend is fake".
- Both say trend: "This trend is stronger than sticky noise would produce."
- Not significant with a "more years needed" number: give that number; it is the honest answer to "when will we know?".
- Never give a cause. You may say which variables change together in the same place and what a scientist could check.

## The variables
- Air temperature at 2 m (T2M, degC): how warm the air is near the ground.
- Daily maximum air temperature (T2M_MAX, degC): the hottest reading of each day, averaged over the month.
- Precipitation (PRECTOTCORR, mm/day): rain and snow, as the depth of water per day.
- Relative humidity at 2 m (RH2M, %): how much water vapour the air holds, as a percent of the most it could hold.
- Sunlight reaching the surface (ALLSKY_SFC_SW_DWN, kWh/m2/day): solar energy at the ground, clouds included.
- Root-zone soil wetness (GWETROOT, index 0 to 1): how wet the soil is where roots reach; 0 dry, 1 saturated.
- Wind speed at 2 m (WS2M, m/s): average wind near the ground.

## Limits to say out loud
- NASA POWER is built on the MERRA-2 reanalysis: a weather model steered by observations. It is not a station reading.
- Reanalysis can jump when the satellites feeding it change. A trend can partly be such a jump, most of all for wind
  and soil wetness.
- Only straight-line trends are tested. A change that rises and then falls can look like "no trend".
- Simulations use one-month memory (AR(1)) noise; real data can have longer memory.
- A regional pixel is about 50 km wide. It cannot speak for one street or one farm.
