# Battle plan: Noise Trap

**Challenge:** [Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)
**Event:** Aaruush '26, Chennai. **Offline submission closes Sun 15 Nov, 5:00 PM. We submit by 4:00 PM.**

> One line: most trend tools tell students a trend is "significant" when it is random noise.
> We show that happening live, fix it, and then let students solve real cases.

---

## 0. Rules we must not break
- Demo: **30-second video OR max 7 slides** (title slide counts). Over the limit = not eligible for global judging.
- English everywhere (subtitles if anyone speaks another language). No one under 18 in the video.
- Use at least one NASA dataset as the core of the project.
- List **every** library, dataset, paper and image in References. Label AI-generated code/images.
- "Use of SI" field: say honestly what AI did (research, data checks, code help). The idea and decisions are the team's.
- Every link public, no login. Test in an incognito window.

## 1. Who does what (swap names to match skills)

| Person | Role | Owns |
|---|---|---|
| Venkatanathan | Captain + frontend + integration | `web/`, deploy, project page, final submission |
| Dhruva | Data lead + API | `backend/data/`, `backend/api/`, cached case files |
| Antik | Stats lead | `backend/trendlab/`, validation numbers, methods page |
| Pranav (joins later) | Story + design + intake | 3-question intake, plain-language text, 30 s video, 7 slides, Q&A |

Interfaces everyone codes against (do not change without telling the team):
- Series JSON: `{ "name", "units", "source", "dates": ["YYYY-MM", ...], "values": [...] }`
- Analysis JSON: see `trendlab.stats.analyze_series` output.
- Map JSON: `{ "lat": [...], "lon": [...], "slope": [[...]], "p": [[...]], "naive_mask": [[...]], "honest_mask": [[...]] }`

## 2. Step by step

### Saturday 14 Nov
| When | Step | Owner | Done when |
|---|---|---|---|
| Now | Team agrees the idea in its own words; README filled | All | README "Project Overview" written by the team |
| Now | Earthdata Login works; GES DISC app authorized; Aaruush participant form filled | All | Everyone can log in |
| Now | Start slow data jobs: `python backend/data/harmony_jobs.py`, `python backend/data/appeears_job.py`, `python backend/data/fetch_grace.py` | Dhruva | Jobs submitted |
| Now-13:00 | `pytest backend/tests` green (done: 10 tests); validation numbers in `docs/validation.md` (done) | Antik | Re-run after any engine change |
| Now-13:00 | `web/` shows a live Chennai series from the API | Venkatanathan | Chart on screen with real NASA POWER data |
| 13:00-17:00 | Case 1 (NO2 India vs China) end to end; Noise Trap button on a small map | All | Click-through works |
| 17:00-24:00 (remote) | Cases 2-3; years-to-detect card; intake; deploy v1 | All | Live URL by midnight |
| 02:00 | **Feature freeze** | Captain | Only bug fixes after this |

### Sunday 15 Nov
| When | Step | Owner |
|---|---|---|
| 09:00-12:00 | Polish, accessibility (colour-blind safe, readable), 2 user tests (students/mentor), fix confusion | All |
| 09:00-12:00 | Record 30 s video with English subtitles + a backup screen recording | Pranav |
| 12:00-14:00 | Project page (order below), References, Use of SI | Venkatanathan + Pranav |
| 14:00-15:00 | Two mock pitches with the Q&A drill | All |
| **15:00-16:00** | **Submit. Test every link in incognito.** | Captain |

Project page order (same as the 2025 winners): Summary, Demo link, Project link, Project details, Use of SI, NASA data, Partner and other data.

## 3. The three case files
1. **Two countries, one gas.** OMI NO2 (OMNO2d v004): India rises, eastern China falls after 2012.
2. **Same cause, opposite sign.** MERRA-2 temperature by pressure level: CO2 warms the lower atmosphere and cools the upper atmosphere.
3. **Is my city changing?** Chennai via NASA POWER (live) or MODIS LST: real yet, and years until detectable.

## 4. What wins (check before submitting)
- [ ] The hook works live: pure noise, naive method lights up, ours stays quiet.
- [ ] One proof number on a slide and in the video (from `trendlab.validate`).
- [ ] Years-to-detect card on at least one case.
- [ ] Every number on screen has a plain-language sentence under it.
- [ ] Limits shown on screen (data gaps, reanalysis vs observation, linear trends only).
- [ ] Demo runs from cached data with no Wi-Fi.
- [ ] Mentor feedback taken on Saturday afternoon.

## 5. Facts for Q&A (verified in the papers)
- Wilks (2016, BAMS): of 281 *Journal of Climate* papers (first half of 2014), 97 showed significance maps; only 3 (1.1%) considered multiple testing. FDR rule: largest p(i) with p(i) <= alpha_FDR * i/N; for correlated maps use alpha_FDR = 2 * alpha_global (0.10).
- Weatherhead et al. (1998; restated 2000, eq. 2): n* = [((2+z)/|w0|) * sigma_N * sqrt((1+phi)/(1-phi))]^(2/3) years. 2 = 50% chance of detection, 3.3 = 90%.
- Honest test = Mann-Kendall after pre-whitening (Kulkarni & von Storch 1995). We tested 6 corrections; only this one kept false alarms near 5% (see `docs/validation.md`). Hamed & Rao (1998) gave 10-15%.
- Our proof numbers: on noise with autocorrelation 0.6 the plain test flags 32% of series, ours 3.8%; on a noise map, 15.6% of pixels vs 0%.
- Critique to raise ourselves: Schutte et al. 2026 (EGU preprint) on global FDR with spatially coherent signals.
