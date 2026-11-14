# Code audit, Sat 14 Nov 2026

Audited commit `78353e5` (whole repo). This report changes no code. The fixes are tasks in [`TASKS.md`](TASKS.md).
Numbers marked "measured" come from running the code on a laptop, not from reading it.

**What this repo does:** Noise Trap is a web app that tests whether a trend in NASA Earth data is real or just noise. A Python engine (`backend/trendlab`) runs two trend tests on a monthly series, a small web server (`backend/api`) hands the results to a React page (`web`), and scripts in `backend/data` download NASA data and save small case files.
**Load assumed:** a public demo link. A few judges and students clicking at the same time, on free hosting, with a live pitch where a 15 second wait is a failure.

## Must fix

1. **Rates of change are too big when months are missing** (`backend/trendlab/stats.py:58` and `:70`)
   - **What this is:** `trend_test` works out how fast a variable changes per year (the "Sen's slope", the middle value of all the point-to-point slopes).
   - **Problem:** Line 58 throws away the missing months, then line 70 multiplies by 12 as if no month were missing. Measured on a series with a true rate of 0.120 per year: 30% of months missing gives 0.167 (39% too big), a 36-month hole gives 0.141 (18% too big). GRACE has a real hole like that, and `monthly_from_daily` (`backend/data/build_cases.py:54-62`) drops empty months from the NO2 series.
   - **Fix:** Keep each value's real position in time: `ok = np.isfinite(x); slope, _, lo, hi = scipy.stats.theilslopes(x[ok], np.arange(x.size)[ok])`, then multiply by 12. Measured after the fix: 0.119 and 0.118. In `monthly_from_daily`, write every month between first and last, with `None` for empty ones.
   - **If we skip it:** The NO2 and GRACE numbers on screen are wrong, and a judge who checks one against Giovanni sees the mismatch.

2. **The NO2 rate prints as a 15-digit number** (`web/src/components/Verdict.jsx:6`)
   - **What this is:** `fmtRate` writes the rate of change under each verdict card.
   - **Problem:** It uses `toFixed(3)`. NO2 is stored in molecules/cm2, where a rate is about 1.2e13 per year. Measured: it prints `120000000000000.000 molecules/cm2 per decade`. NO2 is our headline case.
   - **Fix:** In `build_no2` (`backend/data/build_cases.py:90-99`) divide the values by 1e15 and set the units to `10^15 molecules/cm2`. One line, and the chart axis becomes readable too.
   - **If we skip it:** Case 1 shows an unreadable number in the video.

3. **The Noise Trap map is worked out on request and takes 15 to 58 seconds** (`backend/api/main.py:96-123`)
   - **What this is:** `/api/noise-trap` builds a map of random noise and runs both tests on every pixel. Results are kept in memory, and a background thread fills that memory at startup.
   - **Problem:** Measured: a 20 x 20 map took 14.5 s, a 40 x 40 map with a new `seed` took 58 s. `seed` can be any number, so every new seed is new work, and anyone with the link can keep the server busy. On Vercel each server copy starts with empty memory, so the cache and the warm-up thread do not help.
   - **Fix:** Work out the ten maps (phi 0.0 to 0.9) once with a script, save them as JSON files, and let the web app load those files. Remove `size`, `years`, `spatial` and `seed` from the public endpoint, or remove the endpoint. This deletes the cache and the warm-up thread.
   - **If we skip it:** The first click of the live demo waits 15 seconds or times out.

## Should fix

4. **The demo never shows our method saying "yes"** (`backend/trendlab/stats.py:221-229`, `web/src/views/NoiseTrapView.jsx`)
   - **What this is:** `noise_trap` makes a map with no trend at all, and the page shows that our method flags 0% of it.
   - **Problem:** A method that never flags anything would also score 0%. Measured, with a real trend added to half of a 20 x 20 map: our method finds 0% of a 0.2 SD/decade trend, 42% at 0.4 and 100% at 0.8.
   - **Fix:** Give `noise_trap` an optional `trend_sd_per_decade` that adds a trend to the left half of the cube (about three lines), save those maps too, and add a second button: "Now add a real trend". Use 0.8.
   - **If we skip it:** A judge says "it just never says yes" and the page has no answer.

5. **The GRACE case opens an empty page** (`web/src/views/CasesView.jsx:40-46`, `backend/data/build_cases.py:136-145`)
   - **What this is:** `build_grace` saves a map (slope and two masks). `CasesView` draws a case file.
   - **Problem:** `CasesView` only draws `series`. The GRACE file has no `series`, so its button appears and shows nothing.
   - **Fix:** Move `MaskMap` out of `NoiseTrapView.jsx` into `components/`, and draw two of them in `CasesView` when the case has `slope`. Or delete `build_grace` and `fetch_grace.py` if GRACE is cut.
   - **If we skip it:** A dead button in the demo, and the only real-data map is lost.

6. **Every `/api/point` error blames NASA** (`backend/api/main.py:85-93`)
   - **What this is:** The endpoint fetches a NASA POWER series and analyses it.
   - **Problem:** `except Exception` turns any failure into "NASA POWER request failed". A place with fewer than 24 usable months fails inside our own analysis and still reports a NASA outage.
   - **Fix:** Catch `requests.RequestException` for the 502. Catch `ValueError` and return 400 with its own message.
   - **If we skip it:** We debug the wrong system during the hackathon.

7. **The two data parsers and the API have no tests** (`backend/data/fetch_power.py:26-49`, `backend/data/build_cases.py:54-80`, `backend/api/main.py`)
   - **What this is:** One parser reads NASA POWER JSON (drops the fake month "13" and the -999 fill value). The other reads a Giovanni CSV (skips the header lines, then reads `time,value` rows).
   - **Problem:** Nothing fails if they break. If the Giovanni header line is not exactly `time`, the parser reads zero rows and the error surfaces later as "Need at least 24 monthly values".
   - **Fix:** Three small tests: a five-line POWER dict, a five-line Giovanni CSV string, and one `TestClient` call to `/api/cases/chennai` (add `httpx` to the dev requirements).
   - **If we skip it:** A broken case file is found during the pitch, not before it.

8. **Clicking two city buttons quickly can show the wrong city** (`web/src/views/InvestigateView.jsx:42-48`)
   - **What this is:** Each city button starts a fetch and shows the answer when it arrives.
   - **Problem:** The buttons stay active while a fetch is running. Click Delhi, then Chennai: if Chennai (already cached) answers first, Delhi's slower answer replaces it while the form still says Chennai.
   - **Fix:** Add `disabled={busy}` to the city buttons.
   - **If we skip it:** A chart that does not match the place named above it.

9. **One requirements file for the server, the data jobs and the tests** (`backend/requirements.txt`)
   - **What this is:** The list of Python packages to install.
   - **Problem:** The server needs six of them. `xarray`, `netCDF4`, `earthaccess` and `harmony-py` are only for the download scripts, `statsmodels` is used by one test line, and `h5netcdf` is not used anywhere. Vercel limits function size, so the full list may not deploy.
   - **Fix:** `requirements.txt` with numpy, scipy, pymannkendall, fastapi, uvicorn, requests. `requirements-dev.txt` with `-r requirements.txt` plus the rest. Drop `h5netcdf`. In the test, replace `multipletests` with `scipy.stats.false_discovery_control(p, method="bh") <= 0.10` (checked: same result) and drop `statsmodels`.
   - **If we skip it:** The deploy fails on size, or every cold start is slow.

## Nice to have

10. **The page downloads 4.9 MB of JavaScript** (`web/src/components/Plot.jsx:1`)
    - **What this is:** The chart library, Plotly, loaded as the full bundle.
    - **Problem:** Measured build output: one 4.9 MB file (1.5 MB compressed). We use only line charts and heatmaps.
    - **Fix:** Swap `plotly.js-dist-min` for `plotly.js-cartesian-dist-min`, which has both chart types and is much smaller. Not yet tried here.
    - **If we skip it:** A slow first load on venue Wi-Fi or a phone.

11. **`web/README.md` is the Vite template text** (`web/README.md`)
    - **What this is:** The default file created with the project.
    - **Problem:** It describes the template, not our app. The real instructions are in the root README.
    - **Fix:** Delete it.
    - **If we skip it:** A reader of the repo gets misled for a minute.

12. **A comment describes a method we do not use** (`backend/trendlab/stats.py:64-65`)
    - **What this is:** A comment about Hamed-Rao returning NaN.
    - **Problem:** Hamed-Rao is not in `METHODS`. The NaN guard below it is still useful; the comment is not.
    - **Fix:** Shorten it to "the library can return NaN; we treat that as not significant".
    - **If we skip it:** Nothing breaks.

13. **The browser console shows a 404 for the page icon** (`web/index.html`)
    - **What this is:** The browser asks for `/favicon.ico` and there is none.
    - **Problem:** One red error in the console on every load.
    - **Fix:** Add `<link rel="icon" href="data:," />` in `<head>`, or a real icon.
    - **If we skip it:** Only cosmetic.

14. **The AppEEARS script gives a confusing error if the task is not finished** (`backend/data/appeears_job.py:66-71`)
    - **What this is:** `status` and `download` call the AppEEARS service.
    - **Problem:** Neither checks the HTTP status. Downloading too early ends in `KeyError: 'files'`.
    - **Fix:** Add `raise_for_status()` after both requests.
    - **If we skip it:** A wasted five minutes on a busy day.

Two smaller items left out.

**Verdict:** Good shape for a one-day build: the engine is tested and the app runs. Fix 1, 2 and 3 before any real-data case goes on screen.
**Lean:** about -45 lines, -2 dependencies possible (`h5netcdf`, `statsmodels`).
**Not checked:** `harmony_jobs.py`, `appeears_job.py` and `fetch_grace.py` were read but not run (they need an Earthdata Login). `build_cases.py no2 / fingerprint / grace` were not run (no downloaded data). The full `trendlab.validate` run was not repeated. The page was checked at desktop width only, with no screen-reader test.
