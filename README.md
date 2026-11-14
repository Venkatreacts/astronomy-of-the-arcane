# Astronomy of the Arcane

Team **Astronomy of the Arcane**, NASA International Space Apps Challenge 2026 (Aaruush '26, Chennai).

## Challenge
[Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)

## Team
- Venkatanathan O R V (captain)
- Dhruva Mishra
- Antik Ray
- Pranav Gupta

## Project Overview
_The team writes this section in its own words (what problem, for whom, our approach, NASA data used)._

See [`PLAN.md`](PLAN.md) for roles and schedule, and [`docs/validation.md`](docs/validation.md) for the test results.

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

## Deploy
- **API on Render:** `render.yaml` describes the service. In the Render dashboard create a web service from this repo and set `GEMINI_API_KEY`, `DETECTIVE_PASSCODE` and `ALLOWED_ORIGINS` (the web app's URL). The free plan sleeps when idle and takes about a minute to wake; the page says so while it waits.
- **Web app on Vercel:** project root `web/`, environment variable `VITE_API_URL` set to the Render URL.
- The globe, the Noise Trap, the case files, the listed region scans and the saved Detective answers are static files and work with no server at all.

## License
MIT
