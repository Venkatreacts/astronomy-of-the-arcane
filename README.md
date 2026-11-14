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
pip install -r requirements.txt
pytest -q tests                  # 11 tests
python -m trendlab.validate      # proof numbers (~1 min)
uvicorn api.main:app --port 8000 # API docs at http://localhost:8000/docs
```

### Web app (Node 20+)
```bash
cd web
npm install
npm run dev                      # http://localhost:5173 (calls the API on port 8000)
```

### Data (needs an Earthdata Login for everything except NASA POWER)
| Command (from `backend/`) | What it does |
|---|---|
| `python data/build_cases.py chennai` | Chennai case from NASA POWER (no login) |
| `python data/harmony_jobs.py --list` | NASA Harmony subset jobs (MERRA-2 levels, GPM, OMI NO2) |
| `python data/appeears_job.py submit` | MODIS land temperature for Chennai via AppEEARS |
| `python data/fetch_grace.py` | GRACE/GRACE-FO water storage (one file) |
| `python data/build_cases.py no2 --india ... --china ...` | NO2 case from two Giovanni area-averaged CSVs |

Downloads go to `backend/data/raw/` (not committed). Small cached case files go to `backend/data/cases/` (committed, so the demo works offline).

## License
MIT
