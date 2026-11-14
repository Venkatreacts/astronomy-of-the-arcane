"""Region Scanner: honest multi-variable trend scanning over a map.

Steps for each variable (see docs/design/region-scanner.md):
1. Monthly anomalies (seasonal cycle removed).
2. Lag-1 pre-whitening, then a vectorized Mann-Kendall test on every pixel at once.
3. Clusters of same-sign pixels with |z| > 1.96, scored by mass (sum |z|), tested against
   199 joint time permutations of the pre-whitened map (Cortes et al. 2020 style).
4. Benjamini-Hochberg FDR across ALL variables x pixels.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from typing import Callable

import numpy as np
import requests
from scipy import ndimage
from scipy.stats import norm

from .stats import fdr_bh

POWER_REGIONAL = "https://power.larc.nasa.gov/api/temporal/monthly/regional"
RAW = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw" / "power_region"

# id: (name, units, word when rising, word when falling)
SCAN_VARS = {
    "T2M": ("Air temperature", "degC", "warming", "cooling"),
    "PRECTOTCORR": ("Rainfall", "mm/day", "wetter", "drier"),
    "GWETROOT": ("Root-zone soil wetness", "0-1", "wetter soil", "drying soil"),
    "RH2M": ("Relative humidity", "%", "more humid", "less humid"),
    "WS2M": ("Wind speed at 2 m", "m/s", "windier", "calmer"),
}
# Not scanned: ALLSKY_SFC_SW_DWN (sunlight) comes on a coarser 1-degree grid from a different product;
# stretching it to the 0.5-degree grid would duplicate pixels and inflate the statistics.

EIGHT_NEIGHBOURS = np.ones((3, 3), dtype=int)


# ---------------------------------------------------------------- data access

def validate_bbox(bbox: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    lat_min, lat_max, lon_min, lon_max = map(float, bbox)
    if not (-90 <= lat_min < lat_max <= 90 and -180 <= lon_min < lon_max <= 180):
        raise ValueError("Box must be lat_min < lat_max and lon_min < lon_max.")
    if not (2 <= lat_max - lat_min <= 5 and 2 <= lon_max - lon_min <= 5):
        raise ValueError("Box sides must be between 2 and 5 degrees (NASA POWER regional limit).")
    return lat_min, lat_max, lon_min, lon_max


def parse_power_regional(payload: dict, param: str) -> dict:
    """GeoJSON from POWER (one feature per grid point) -> dates, lats, lons, cube[time, lat, lon]."""
    if "features" not in payload:
        raise RuntimeError("NASA POWER error: " + "; ".join(payload.get("messages", ["unknown"])))
    feats = payload["features"]
    lats = sorted({round(f["geometry"]["coordinates"][1], 4) for f in feats})
    lons = sorted({round(f["geometry"]["coordinates"][0], 4) for f in feats})
    keys = sorted(k for k in feats[0]["properties"]["parameter"][param] if not k.endswith("13"))
    cube = np.full((len(keys), len(lats), len(lons)), np.nan)
    li = {v: i for i, v in enumerate(lats)}
    lo = {v: i for i, v in enumerate(lons)}
    for f in feats:
        lon, lat = f["geometry"]["coordinates"][:2]
        series = f["properties"]["parameter"][param]
        vals = np.array([series.get(k, np.nan) for k in keys], dtype=float)
        vals[vals <= -998] = np.nan
        cube[:, li[round(lat, 4)], lo[round(lon, 4)]] = vals
    dates = [f"{k[:4]}-{k[4:]}" for k in keys]
    return {"dates": dates, "lats": lats, "lons": lons, "cube": cube}


def fetch_power_region(param: str, bbox, start: int = 1981, end: int = 2025, cache: bool = True) -> dict:
    lat_min, lat_max, lon_min, lon_max = validate_bbox(bbox)
    key = f"{param}_{lat_min}_{lat_max}_{lon_min}_{lon_max}_{start}_{end}.json"
    path = RAW / key
    if cache and path.is_file():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        r = requests.get(POWER_REGIONAL, params={
            "parameters": param, "community": "AG", "format": "JSON", "start": start, "end": end,
            "latitude-min": lat_min, "latitude-max": lat_max,
            "longitude-min": lon_min, "longitude-max": lon_max}, timeout=180)
        r.raise_for_status()
        payload = r.json()
        if cache and "features" in payload:
            RAW.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload), encoding="utf-8")
    return parse_power_regional(payload, param)


# ---------------------------------------------------------------- statistics

def monthly_anomalies(cube: np.ndarray, months: np.ndarray) -> np.ndarray:
    out = np.full_like(cube, np.nan)
    for m in range(1, 13):
        sel = months == m
        if sel.any():
            out[sel] = cube[sel] - np.nanmean(cube[sel], axis=0)
    return out


def fill_short_gaps(anom: np.ndarray, max_missing: float = 0.1) -> tuple[np.ndarray, np.ndarray]:
    """Columns (pixels) with <= 10% missing get gaps set to 0 (the normal value); others are invalid."""
    missing = np.isnan(anom).mean(axis=0)
    valid = missing <= max_missing
    filled = np.where(np.isnan(anom), 0.0, anom)
    return filled, valid


def prewhiten(x: np.ndarray) -> np.ndarray:
    """Lag-1 pre-whitening per column, matching pymannkendall: y_t = x_t - r1 * x_{t-1}."""
    xc = x - x.mean(axis=0)
    denom = (xc ** 2).sum(axis=0)
    r1 = np.where(denom > 0, (xc[1:] * xc[:-1]).sum(axis=0) / np.where(denom > 0, denom, 1), 0.0)
    return x[1:] - r1 * x[:-1]


def mk_z(y: np.ndarray) -> np.ndarray:
    """Vectorized Mann-Kendall z for every column of y (time, pixels). No tie correction."""
    n = y.shape[0]
    s = np.zeros(y.shape[1])
    for k in range(1, n):
        s += np.sign(y[k:] - y[:-k]).sum(axis=0)
    sd = np.sqrt(n * (n - 1) * (2 * n + 5) / 18.0)
    return np.where(s > 0, (s - 1) / sd, np.where(s < 0, (s + 1) / sd, 0.0))


def mk_z_original(x: np.ndarray) -> np.ndarray:
    """Plain Mann-Kendall z (no pre-whitening), for the 'usual method' count."""
    return mk_z(x)


def ls_rate_per_decade(x: np.ndarray) -> np.ndarray:
    """Least-squares slope per decade for each column of monthly data."""
    t = np.arange(x.shape[0]) / 120.0
    tc = t - t.mean()
    return (tc[:, None] * (x - x.mean(axis=0))).sum(axis=0) / (tc ** 2).sum()


def find_clusters(zmap: np.ndarray, valid: np.ndarray, thr: float = 1.96) -> list[dict]:
    """Same-sign 8-connected clusters of |z| > thr. Returns masks with mass = sum |z|."""
    found = []
    for sign in (1, -1):
        hot = valid & (sign * zmap > thr)
        labels, n = ndimage.label(hot, structure=EIGHT_NEIGHBOURS)
        for k in range(1, n + 1):
            mask = labels == k
            found.append({"sign": sign, "mask": mask, "size": int(mask.sum()),
                          "mass": float(np.abs(zmap[mask]).sum())})
    return found


def max_cluster_mass(zmap: np.ndarray, valid: np.ndarray, thr: float = 1.96) -> float:
    cl = find_clusters(zmap, valid, thr)
    return max((c["mass"] for c in cl), default=0.0)


def cluster_test(y_pw: np.ndarray, shape: tuple[int, int], valid: np.ndarray, n_perm: int = 199,
                 seed: int = 0, thr: float = 1.96) -> tuple[np.ndarray, list[dict], np.ndarray]:
    """Observed z map, clusters with permutation p-values, and the null distribution of max mass.

    Time is permuted jointly for all pixels, which keeps the spatial correlation intact.
    """
    z = mk_z(y_pw).reshape(shape)
    clusters = find_clusters(z, valid, thr)
    rng = np.random.default_rng(seed)
    null = np.empty(n_perm)
    for i in range(n_perm):
        idx = rng.permutation(y_pw.shape[0])
        null[i] = max_cluster_mass(mk_z(y_pw[idx]).reshape(shape), valid, thr)
    for c in clusters:
        c["p"] = float((1 + (null >= c["mass"]).sum()) / (1 + n_perm))
    return z, clusters, null


# ---------------------------------------------------------------- scanning

def scan_cubes(data: dict[str, dict], n_perm: int = 199, alpha: float = 0.05, alpha_fdr: float = 0.10,
               seed: int = 0) -> dict:
    """Scan already-loaded cubes. data[var] = {dates, lats, lons, cube}. Grids must match."""
    first = next(iter(data.values()))
    lats, lons = first["lats"], first["lons"]
    shape = (len(lats), len(lons))
    per_var, all_p, owners = {}, [], []
    naive_hits = honest_raw_hits = n_tests = 0
    spans = []

    for v, d in data.items():
        # Variables can cover different years (e.g. sunlight starts in 1984), so each uses its own dates.
        cube, dates = d["cube"], d["dates"]
        if cube.shape[1:] != shape:
            raise ValueError(f"{v}: grid {cube.shape[1:]} does not match {shape}")
        months = np.array([int(x[5:7]) for x in dates])
        spans.append((dates[0], dates[-1]))
        anom = monthly_anomalies(cube, months).reshape(len(dates), -1)
        filled, valid_flat = fill_short_gaps(anom)
        valid = valid_flat.reshape(shape)
        y_pw = prewhiten(filled)
        z, clusters, null = cluster_test(y_pw, shape, valid, n_perm, seed)
        p = np.where(valid, 2 * norm.sf(np.abs(z)), np.nan)
        z_naive = mk_z_original(filled).reshape(shape)
        naive_hits += int((valid & (2 * norm.sf(np.abs(z_naive)) < alpha)).sum())
        honest_raw_hits += int((valid & (p < alpha)).sum())
        n_tests += int(valid.sum())
        all_p.append(p.ravel())
        owners.append(v)
        rate = ls_rate_per_decade(filled).reshape(shape)
        cl_map = np.zeros(shape, dtype=int)
        cl_out = []
        for i, c in enumerate(sorted(clusters, key=lambda c: -c["mass"]), start=1):
            ys, xs = np.nonzero(c["mask"])
            sig = c["p"] < alpha
            if sig:
                cl_map[c["mask"]] = i * c["sign"]
            cl_out.append({
                "id": i, "direction": "rising" if c["sign"] > 0 else "falling", "size": c["size"],
                "mass": c["mass"], "p": c["p"], "significant": bool(sig),
                "center_lat": float(np.mean(np.array(lats)[ys])), "center_lon": float(np.mean(np.array(lons)[xs])),
                "mean_rate_per_decade": float(np.nanmean(rate[c["mask"]])),
                "pixels": [[int(a), int(b)] for a, b in zip(ys, xs)],
            })
        name, units, up, down = SCAN_VARS.get(v, (v, "", "rising", "falling"))
        per_var[v] = {"name": name, "units": units, "word_up": up, "word_down": down,
                      "period": [dates[0], dates[-1]],
                      "z": z, "rate_per_decade": rate, "valid": valid, "cluster_map": cl_map,
                      "clusters": cl_out, "null_max_mass_95": float(np.quantile(null, 0.95))}

    # Global FDR across every variable and pixel together.
    stacked = np.concatenate(all_p)
    mask_all, thr_p = fdr_bh(stacked, alpha_fdr)
    k = shape[0] * shape[1]
    for i, v in enumerate(owners):
        per_var[v]["fdr_mask"] = mask_all[i * k:(i + 1) * k].reshape(shape)

    sig_clusters = sum(c["significant"] for pv in per_var.values() for c in pv["clusters"])
    return {
        "lats": lats, "lons": lons, "dates": [min(s[0] for s in spans), max(s[1] for s in spans)],
        "variables": per_var,
        "summary": {"n_tests": n_tests, "naive_hits": naive_hits, "prewhitened_hits": honest_raw_hits,
                    "fdr_hits": int(mask_all.sum()), "fdr_threshold": thr_p,
                    "significant_clusters": int(sig_clusters), "permutations": n_perm},
    }


def scan_region(bbox, variables=None, start: int = 1981, end: int = 2025, n_perm: int = 199,
                fetch: Callable = fetch_power_region) -> dict:
    """Fetch each variable for the box from NASA POWER and scan it."""
    variables = list(variables or SCAN_VARS)
    data = {v: fetch(v, bbox, start, end) for v in variables}
    res = scan_cubes(data, n_perm=n_perm)
    res["bbox"] = list(validate_bbox(bbox))
    res["source"] = ("NASA POWER monthly regional API (MERRA-2-based reanalysis and satellite products), "
                     f"{start}-{end}, ~0.5 x 0.625 degree grid")
    return res


def scan_key(bbox, variables, start, end, n_perm) -> str:
    raw = json.dumps([list(map(float, bbox)), sorted(variables), start, end, n_perm])
    return hashlib.sha1(raw.encode()).hexdigest()[:12]
