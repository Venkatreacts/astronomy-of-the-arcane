# Astronomy of the Arcane

Team **Astronomy of the Arcane**, NASA International Space Apps Challenge 2026 (Aaruush '26, Chennai).

## Challenge
[Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)

## Team
- Venkatanathan O R V (captain)
- Dhruva Mishra
- Antik Ray
- Pranav Gupta

## Project Overview: Noise Trap
**Live app: [noise-trap.vercel.app](https://noise-trap.vercel.app)**

**Is that trend real, or just noise?** Noise Trap answers that question for any place on Earth, using NASA data. It also shows, side by side, how the standard test gets the answer wrong.

### The problem
The test most people use for trends (Mann-Kendall) assumes each month is independent. Climate data is not: a warm month is usually followed by another warm month, and wet soil stays wet. This "stickiness" (autocorrelation) makes the usual test far too confident.
- On simulated data with **no trend at all**, the usual test reports a trend **32%** of the time, where it should be 5%.
- On **real NASA data**, the usual test says root-zone soil wetness changed at **71%** of 721 land points. Only **19%** survive an honest test.
- Chennai warming: the usual test gives p = 0.0027, which looks certain. The honest answer is p = 0.054: **not proven yet**.

### Our approach: three stages, always shown together
1. **Usual test:** plain Mann-Kendall, kept on purpose so users can see where it goes wrong.
2. **Stickiness removed:** pre-whitening (Kulkarni & von Storch 1995). We chose it by simulation over **six** competing corrections. It was the only one near 5% false alarms at every level of stickiness.
3. **Honest verdict:** Benjamini-Hochberg false discovery rate control (q = 0.10) when many places, seasons or variables are tested at once.

Every answer is in plain words ("trend is real", "not proven yet", "the data point the other way"). It comes with Sen's slope per decade, a 95% range, and, when the trend is not proven, **how many more years of data would settle it** (Weatherhead et al. 1998). Noise Trap says *whether* something changed, never *why*.

### How it meets the challenge
| Challenge step | Where it lives in Noise Trap |
|---|---|
| 1. Choose a variable | 19 NASA POWER variables. Users who don't know the names answer three plain questions and get suggested variables, each with a one-line definition. |
| 2. Choose a region | Any point on a world map, nine preset regions, or the whole-globe atlas |
| 3. Choose a time frame | 1981-2025, any sub-period, any season |
| 4. Build the time series | Monthly NASA record, seasons removed; missing months stay missing and are never filled in |
| 5. Test significance | The three stages above, plus the years still needed |

### What you can do with it
- **Global Trend Atlas:** an interactive globe of 2,016 sample points and 5 variables. Switch from the usual test to the honest verdict and watch the false alarms disappear.
- **The trap:** pure noise with a stickiness slider. The usual test invents trends; the honest one stays clean.
- **Investigate one place, Scan a region, Case files**, including a satellite case: summer haze over Wisconsin from MODIS on Aqua, +0.071 per decade, honest p = 0.023.
- **Check a headline:** paste a claim and get a verdict (saved examples: Chennai, Sahel, Madrid).
- **Second witness:** a satellite record and a model record tested independently, to see whether they agree.
- **Train your eye:** a ten-round game. Guess real trend or sticky noise, then see both tests.
- **AI Detective:** ask in plain English. Gemini calls our tools, and every number in its answer is checked against the tool output.
- **MCP connector:** Claude, ChatGPT, Cursor or any MCP client can call the same 10 tools at `/mcp`.

### NASA data used
- **NASA POWER** (MERRA-2 reanalysis): monthly, 1981-2025. It is labelled as a model everywhere it appears.
- **NASA Giovanni** area averages: **MODIS Aqua** aerosol optical depth, **GPM IMERG** rainfall, **MERRA-2** aerosols. The dataset, box and missing-value code are read from each file's header, and a case file carries a `reproduce` link to the exact Giovanni request.
- **NASA Worldview** imagery (illustration only; the charts are the evidence).

### Proof, where the truth is known ([`docs/validation.md`](docs/validation.md))
| Check | Usual test | Noise Trap |
|---|---|---|
| False alarms on sticky noise (phi = 0.6, should be 5%) | 32.0% | **3.8%** |
| A 30x30 map of pure noise: pixels flagged | 15.6% | **0.0%** |
| False discoveries when a real trend is planted in half a map | n/a | about 1 in 15 (target: under 1 in 10) |
| 95% range contains the true rate, with 30% of months missing | n/a | **93-98%** |

On the real NASA atlas, strong signals barely move (air temperature: 87% of points with the usual test, 79% with the honest verdict), while sticky ones collapse (soil wetness: 71% to 19%). So we are not claiming that nothing changes. We show which changes the data can prove.

### Built to be checked
- Our Mann-Kendall matches the reference library `pymannkendall` to **1e-10** (`backend/tests/test_mk.py`).
- **153 backend tests** (pytest) and **5 frontend tests** (node) cover the statistics, the scanner, the atlas, the lab, the Detective, the MCP connector and every published data file.
- There is no database: every result is a static JSON file anyone can open. Most of the app works with no server at all.
- API keys stay on the server. Live AI questions need a passcode, so a public link cannot use up the key.

### Limits (stated in the app too)
- Simulations model one-month memory (AR(1)) only.
- Only straight-line (monotonic) trends are tested.
- With very sticky data (phi ≥ 0.8), the honest test needs a longer record before it can detect a trend.
- MERRA-2 is a reanalysis model, not a direct observation.

See [`PLAN.md`](PLAN.md) for roles and schedule.

## Getting Started

### Backend (Python 3.11+)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt  # the server alone needs only requirements.txt
pytest -q tests                  # statistics, scanner, atlas, lab, detective and published-data checks
python -m trendlab.validate      # proof numbers (~1 min)
uvicorn api.main:app --port 8000 # API docs at http://localhost:8000/docs
```

### Web app (Node 20+)
```bash
cd web
npm install
npm run dev                      # http://localhost:5173 (calls the API on port 8000)
```

### Offline data the web app serves (`web/public/data/`)
| Command (from `backend/`) | What it writes |
|---|---|
| `python scripts/build_atlas.py --download` then `python scripts/build_atlas.py` | Global Trend Atlas: `atlas/*.json` and one `cells/*.json` per 5° sample point |
| `python scripts/build_years.py` | Yearly anomalies for the globe's time playback: `atlas/years_*.json` (from the point files) |
| `python scripts/build_scans.py` | The nine Region Scanner presets in `scans/` |
| `python scripts/build_lab.py` | The simulation lab (240 settings x 10 maps) in `lab/lab.json` |
| `python scripts/build_static.py` | Case files and the original noise maps |

### Data (needs an Earthdata Login for everything except NASA POWER)
| Command (from `backend/`) | What it does |
|---|---|
| `python data/build_cases.py chennai` | Chennai case from NASA POWER (no login) |
| `python data/harmony_jobs.py --list` | NASA Harmony subset jobs (MERRA-2 levels, GPM, OMI NO2) |
| `python data/appeears_job.py submit` | MODIS land temperature for Chennai via AppEEARS |
| `python data/fetch_grace.py` | GRACE/GRACE-FO water storage (one file) |
| `python data/build_cases.py no2 --india ... --china ...` | NO2 case from two Giovanni area-averaged CSVs |

Downloads go to `backend/data/raw/` (not committed). Small cached case files go to `backend/data/cases/` (committed, so the demo works offline).

## AI Detective
- **Saved answers** open instantly on the site with no AI call. They are made once with `python scripts/build_detective.py` (see the top of that file) and stored in `web/public/data/detective/`.
- **Live questions** need two things on the server: an AI key (`GEMINI_API_KEY`, or `ANTHROPIC_API_KEY`) and `DETECTIVE_PASSCODE`. The page asks for the passcode, so a public link cannot use up the key. For local use put them in `backend/.env` (never committed).
- What the Detective knows before it answers: `docs/detective-notes.md` plus a summary of every saved case and region scan. Edit the notes to teach it more; keep only measured numbers in them.

## MCP connector (use Noise Trap from another app or AI)
The API server also speaks the Model Context Protocol at `/mcp` (streamable HTTP, stateless). Any MCP client, such as Claude, ChatGPT, Cursor or your own script, can call the same 10 tools the Detective uses: `atlas_point`, `analyze_point`, `scan_region`, `noise_check` and the rest. No AI key or passcode is needed, because the caller's assistant does the talking and our server only runs the tests.
- **URL:** `https://<your-render-service>.onrender.com/mcp` (locally `http://localhost:8000/mcp`).
- **Claude:** Settings → Connectors → Add custom connector, paste the URL.
- **Any client config:** `{"mcpServers": {"noise-trap": {"type": "http", "url": "https://<your-render-service>.onrender.com/mcp"}}}`
- Every tool is read-only. Only `analyze_point` calls NASA POWER live; the other tools read the pre-computed files.

## Deploy
- **API on Render:** `render.yaml` describes the service. In the Render dashboard create a web service from this repo and set `GEMINI_API_KEY`, `DETECTIVE_PASSCODE` and `ALLOWED_ORIGINS` (the web app's URL). The free plan sleeps when idle and takes about a minute to wake; the page says so while it waits.
- **Web app on Vercel:** project root `web/`, environment variable `VITE_API_URL` set to the Render URL.
- The globe, the Noise Trap, the case files, the listed region scans and the saved Detective answers are static files and work with no server at all.

## License
MIT
