# Task sheet: parts 1-5 (Venkat)

Written Sat 14 Nov 2026, 12:45, against commit `78353e5`. Pranav handles testing, the code audit and the Vercel deploy, so those are not here.
Who takes what: every item marked **Part 1** is data work and only touches `backend/data/`, so the separate data session can take those. Parts 2 to 5 are Venkat's. Where an item says "Parts 1 + 5", the data half is the `backend/data/` file named in it.
Pranav fetches and re-tests after the build work is pushed, not during it.
"Audit #n" points to the finding in [`audit.md`](audit.md), which has the measured numbers and the reason for each fix.
Work top to bottom inside each priority. Tick the box in this file when the "Done when" check passes.

## Already working (tested, do not redo)
- Part 2: trend engine. 11 tests pass (`pytest -q tests`, 54 s).
- Part 4: `/api/health`, `/api/params`, `/api/cases`, `/api/cases/{id}`, `/api/point`, `/api/noise-trap` all answer. Bad input is rejected (latitude 95, unknown variable, under 5 years, path tricks in the case id).
- Part 5: all three tabs work in the browser with live NASA POWER data. `npm run lint` is clean and `npm run build` succeeds.
- Part 1: `fetch_power.py` works live. Case file `chennai` is built and committed.

## P0: must be done before any real-data case goes on screen

- [x] **Part 2. Fix the rate of change when months are missing** (Audit #1). `backend/trendlab/stats.py:58,70`.
  Use `scipy.stats.theilslopes(x[ok], np.arange(x.size)[ok])` so each value keeps its real month. It returns the slope and its low and high bounds in one call.
  Done when: a new test with 30% of months removed from a 0.12-per-year series gives a slope within 5% of 0.12 (today it gives 0.167).
- [x] **Part 2. Add the confidence interval to the Analysis JSON.** The challenge asks for it. New field `slope_ci_per_year: [low, high]` from the same `theilslopes` call. Nothing existing changes.
  That interval ignores autocorrelation, so it is too narrow for sticky series. Widen its half-width by `sqrt((1 + phi) / (1 - phi))` with `phi` from `noise_params`, and say on the methods page that this is an approximation.
  Done when: the field is in `/api/point` and the test above also checks that the interval contains 0.12.
  Note (Venkat): one series cannot pass that check reliably: a 95% interval misses the true value 5% of the time, and seed 0 of the test above does miss it (0.110 to 0.120). The test checks coverage instead: 88+ of 100 series must contain 0.12 (measured 95% over 300).
- [ ] **Part 1. Keep empty months as `null`** (Audit #1). `backend/data/build_cases.py:54-62`, `monthly_from_daily`. Write every month from first to last.
  Done when: a test feeds daily rows with one month missing and gets that month back as `None`.
- [ ] **Part 1. Store NO2 in units of 10^15 molecules/cm2** (Audit #2). `build_no2`, `backend/data/build_cases.py:90-99`.
  Done when: the NO2 verdict card shows a rate like `+0.12`, not a 15-digit number.
- [x] **Parts 4 + 5. Pre-compute the Noise Trap maps** (Audit #3). A script writes the ten maps (phi 0.0 to 0.9, 20 x 20, seed 0) as JSON under `web/public/data/noise/`. The web app loads those files instead of calling `/api/noise-trap`.
  Done when: clicking "Run on pure noise" answers in under 1 s with the API stopped.
  Checked: 59 ms with the API stopped. Script: `backend/scripts/build_static.py`. `/api/noise-trap` now only serves these files (the cache and warm-up thread are gone); the AI Detective's noise check reads them too.
- [x] **Parts 2 + 5. Positive control** (Audit #4). `noise_trap(..., trend_sd_per_decade=0.8)` adds a real trend to the left half of the map. Save those ten maps too. Second button: "Now add a real trend".
  Done when: with the trend on, our map is filled on the left half and near empty on the right.
  Checked (phi 0.5, API stopped): left half 200/200 pixels, right half 10/200. At phi >= 0.8 the honest method loses power (55%, then 0% of the trend half); the page says so when it happens. Full table: `docs/validation.md` section 5.
- [x] **Parts 4 + 5. Serve case files as static files.** Put the case JSON (and a small `index.json` list) under `web/public/data/cases/` and load them from there.
  Why: with this and the Noise Trap change, only "Investigate a place" needs a live server. The demo then works with no Wi-Fi, which the plan requires, and the Vercel deploy needs one small function.
  Done when: the Case files tab works with the API stopped.
  Checked: works with the API stopped. `build_static.py` re-runs the analysis with the current engine when it copies each case, so `backend/data/cases/` is never edited here. Data session: after adding or changing a case file, run `python scripts/build_static.py --cases-only`.

## P1: needed to meet the challenge fully

- [ ] **Parts 1 + 5. One-line plain definition for every variable.** Add a third entry to each item in `PARAMS` (`backend/data/fetch_power.py:14-20`), return it from `/api/params`, show it under the variable dropdown.
  Example: "Relative humidity: how much water vapour the air holds, as a percent of the most it could hold."
  Status (Venkat): Parts 4 + 5 half done: `/api/params` returns `definition` (the optional third entry of each `PARAMS` item, `None` if absent) and the page shows it under the dropdown. Not ticked: waiting on the Part 1 half, the text itself in `fetch_power.py`. Nothing else is needed after that.
- [x] **Part 5. Pick a place on a map.** Today the place is four Indian cities or typed latitude and longitude. Add a click-to-pick world map. Plotly's `scattergeo` can do it with no new library, but check it is in the Plotly bundle we ship.
  Done when: clicking the map fills latitude and longitude and runs the investigation.
  Checked: a map click (sent as Plotly's own click event; the browser pane could not draw for a mouse click) filled 50 / 11.25 and ran the investigation in about 1 s. `scattergeo` is in the bundle we ship. Clicks snap to an invisible 2.5-degree grid (Plotly only reports clicks on points); the boxes allow fine-tuning.
- [x] **Part 5. Show the confidence interval** on both verdict cards: `Rate +0.065 degC per decade (-0.004 to +0.13)`.
  Checked: Chennai shows `Rate +0.0651 degC per decade (95% range +0.00213 to +0.125)` on both cards. Numbers use 3 significant figures and switch to scientific notation for very large or tiny values, so a raw NO2 rate would print as `+1.20e+14`, not 15 digits (the real fix is still the Part 1 unit change).
- [ ] **Part 1. Case 1 data, NO2.** In Giovanni, make two "Time Series, Area-Averaged" plots of OMNO2d tropospheric column (cloud-screened), 2005-01 to 2025-12, boxes 75,22,88,30 (India) and 113,34,120,40 (China). Download both CSVs, then
  `python data/build_cases.py no2 --india raw/giovanni_india.csv --china raw/giovanni_china.csv`.
  Done when: `no2.json` exists and India is rising while China is falling after 2012. If the result does not show that, tell the team before building the story on it.
- [x] **Part 4. Honest error messages on `/api/point`** (Audit #6). `requests.RequestException` gives 502, `ValueError` gives 400 with its own text.
- [x] **Part 5. Disable the city buttons while a fetch runs** (Audit #8). `disabled={busy}`.
- [x] **Part 3. Three small tests** (Audit #7): the POWER parser, the Giovanni CSV parser, one `TestClient` call to a case file.
  Done: `backend/tests/test_api_and_parsers.py` (POWER parser, Giovanni CSV parser, `/api/cases/chennai` + path tricks). `monthly_from_daily` is deliberately not tested: the data session is changing it (empty months -> null).
- [ ] **Part 1. Split the requirements file** (Audit #9). Note for the data session: the API tests need `httpx` (FastAPI's TestClient); put it in `requirements-dev.txt`. The Region Scanner and AI Detective added `scikit-learn` and `anthropic`, which the server needs. `requirements.txt` for the server, `requirements-dev.txt` for data scripts and tests. Drop `h5netcdf` and `statsmodels`.

## P2: only if P0 and P1 are done

- [x] **Part 5. Draw map cases in Case files** (Audit #5), so the GRACE case is not an empty page. Reuse `MaskMap`. If GRACE is cut, delete `build_grace` and `fetch_grace.py` instead.
  Done: Case files draws both masks with `MaskMap` when a case has `slope` (checked with a temporary synthetic map case; no real GRACE case exists yet). Fields match `build_grace`.
- [ ] **Part 1. Case 2 data, MERRA-2 levels.** `python data/harmony_jobs.py merra2_temp_levels`, then `python data/build_cases.py fingerprint`. If the job is not done by 15:00, use Giovanni area-averaged CSVs for two levels (850 hPa and 50 hPa) and build the case from those.
- [ ] **Part 5. Smaller chart library** (Audit #10).
  Not done (Venkat): `plotly.js-cartesian-dist-min` has no `scattergeo`, which the P1 map picker needs, so the suggested swap would break the map. Options: keep the full bundle (1.5 MB gzipped), or lazy-load the map. Left as is.
- [ ] Clean-ups (Audit #11 to #14).
  Status (Venkat): #11 done (template `web/README.md` deleted), #12 done (the misleading Hamed-Rao comment went with the audit #1 fix), #13 done (empty icon link, no more 404). #14 is in `backend/data/appeears_job.py`, a Part 1 file, so left for the data session. Box not ticked until #14 is done.

## Do not change without telling the team
- The Series, Analysis and Map JSON shapes in `PLAN.md` section 1. Adding a field is fine. Renaming or removing one breaks the cached case files.
- The honest test (pre-whitened Mann-Kendall). Its numbers are on the proof slide.

## How Pranav will check each push
```
cd backend && pytest -q tests
cd web && npm run lint && npm run build
```
Then a click-through of all three tabs on the Vercel preview link, with the API stopped for the Noise Trap and Case files tabs.
