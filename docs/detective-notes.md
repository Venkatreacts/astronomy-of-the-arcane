# Notes for the Noise Trap Detective

These notes are read by the AI Detective before every question. Keep them short, true, and in plain words.
Numbers here come from `docs/validation.md` and from our own runs. Do not add a number that was not measured.

## What the two tests do
- **Usual test** = plain Mann-Kendall. It asks: do later months tend to be higher (or lower) than earlier ones? It assumes each month is independent of the month before.
- **Honest test** = the same test after pre-whitening (Kulkarni and von Storch 1995): we first remove the part of each month that just repeats the month before, then test what is left.
- Why it matters: real monthly Earth data is "sticky" (autocorrelated). A warm month tends to follow a warm month. Sticky noise makes long runs that look like trends, and the usual test is fooled by them.
- **Rate of change** = Sen's slope (the middle value of all point-to-point slopes), given per decade, with a 95% range that is widened for stickiness. The range is an approximation.
- **Seasons** are removed first: each month is compared with the average of the same calendar month.

## Maps: many tests at once
- Testing 400 places at 5% each gives about 20 false alarms by chance alone. So across a map we control the false discovery rate at 10% (Benjamini-Hochberg; Wilks 2016).
- In a region scan, a cluster of neighbouring pixels trending the same way must also beat 199 shuffles of time (a permutation test) before we report it.
- "Pass the false-discovery check" is not a subset of "honest test p < 0.05". When many pixels really trend, the false-discovery bar can be looser than 0.05, so the count can be a little higher.

## What we measured about the tests themselves
- On pure noise with stickiness phi = 0.6, the usual test called 32% of series a trend; the honest test 3.8%. A correct 5% test should be near 5%.
- On a pure-noise map (phi = 0.5), the usual test flagged about 21% of pixels; ours 0% after false-discovery control.
- With a real trend of 0.8 noise-widths per decade planted in half a map, both tests found all of it; on the empty half the usual test still flagged about 25%, ours about 5%.
- The cost of honesty: in 25 years the honest map finds about 42% of a 0.4 trend and almost none of a 0.2 trend. Weak real trends need more years. The "years until detectable" number says how many (Weatherhead et al. 1998).
- The 95% range contained the true rate about 95% of the time in simulations up to phi = 0.5, and about 91% at phi = 0.9.

## How to word a verdict
- Usual says trend, honest says no: "The data cannot yet rule out noise." Never say "there is no trend" and never say "the trend is fake".
- Both say trend: "This trend is stronger than sticky noise would produce."
- Not significant with a "more years needed" number: give that number; it is the honest answer to "when will we know?".
- Never give a cause. You may say which variables change together in the same place and what a scientist could check next.

## The variables
- Air temperature at 2 m (T2M, degC): how warm the air is near the ground.
- Daily maximum air temperature (T2M_MAX, degC): the average of each day's hottest reading.
- Precipitation (PRECTOTCORR, mm/day): rain and snow, as depth of water per day.
- Relative humidity at 2 m (RH2M, %): how much water vapour the air holds, as a percent of the most it could hold.
- Sunlight reaching the surface (ALLSKY_SFC_SW_DWN, kWh/m2/day): solar energy arriving at the ground, clouds included.
- Root-zone soil wetness (GWETROOT, 0 to 1): how wet the soil is where roots reach; 0 is dry, 1 is saturated.
- Wind speed at 2 m (WS2M, m/s): average wind near the ground.

## Limits to say out loud
- The data is NASA POWER, built on the MERRA-2 reanalysis: a weather model steered by observations, on a grid of about 0.5 degrees. It is not a direct measurement at a station.
- Reanalysis can jump when the satellites feeding it change. A trend can partly be such a jump, most of all for wind and for soil wetness.
- Only straight-line trends are tested. A change that rises and then falls can look like "no trend".
- One grid box is about 50 km wide. It cannot speak for one street or one farm.
