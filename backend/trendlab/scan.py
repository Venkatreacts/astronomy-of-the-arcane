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
import warnings
from typing import Callable

import numpy as np
import requests
from scipy import ndimage
from scipy.stats import norm, theilslopes

from . import mk as core
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

MAX_MISSING = 0.10   # a pixel is tested only if at most 10% of its months are missing
ALPHA = 0.05         # per-test level for the usual and the pre-whitened test
CLUSTER_THR = 1.96   # |z| that a pixel needs to join a cluster


def monthly_anomalies(cube: np.ndarray, months: np.ndarray) -> np.ndarray:
    out = np.full_like(cube, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-missing pixels: mean of empty slice
        for m in range(1, 13):
            sel = months == m
            if sel.any():
                out[sel] = cube[sel] - np.nanmean(cube[sel], axis=0)
    return out


def prewhiten(x: np.ndarray) -> np.ndarray:
    """Lag-1 pre-whitening per column (shared core; missing months stay missing)."""
    return core.prewhiten(x)


def mk_z(y: np.ndarray) -> np.ndarray:
    """Tie-corrected Mann-Kendall z for every column of y (time, pixels); NaN-aware."""
    return core.mk_test(y)["z"]


def sen_rate_per_decade(x: np.ndarray) -> np.ndarray:
    """Sen's slope per decade for each column, on real month positions (same estimator as the point test)."""
    t = np.arange(x.shape[0], dtype=float)
    out = np.full(x.shape[1], np.nan)
    for j in range(x.shape[1]):
        ok = np.isfinite(x[:, j])
        if ok.sum() >= 24:
            out[j] = theilslopes(x[ok, j], t[ok])[0] * 120.0
    return out


def find_clusters(zmap: np.ndarray, valid: np.ndarray, thr: float = CLUSTER_THR) -> list[dict]:
    """Same-sign 8-connected clusters of |z| > thr. Returns masks with mass = sum |z|."""
    found = []
    z = np.where(np.isfinite(zmap), zmap, 0.0)
    for sign in (1, -1):
        hot = valid & (sign * z > thr)
        labels, n = ndimage.label(hot, structure=EIGHT_NEIGHBOURS)
        for k in range(1, n + 1):
            mask = labels == k
            found.append({"sign": sign, "mask": mask, "size": int(mask.sum()),
                          "mass": float(np.abs(z[mask]).sum())})
    return found


def max_cluster_mass(zmap: np.ndarray, valid: np.ndarray, thr: float = CLUSTER_THR) -> float:
    return max((c["mass"] for c in find_clusters(zmap, valid, thr)), default=0.0)


def max_mass_null(series: list[tuple[np.ndarray, np.ndarray, np.ndarray]], shape: tuple[int, int],
                  n_perm: int = 199, seed: int = 0, thr: float = CLUSTER_THR) -> np.ndarray:
    """Null distribution of the LARGEST cluster mass over all variables of the scan.

    series: (pre-whitened anomalies (time, pixels), var(S) per pixel, valid map) for each variable.
    When the variables share a time axis, one shuffle of the months is applied to all of them, which keeps
    the spatial correlation and the correlation between variables. Comparing every cluster with the
    maximum over all maps controls the family-wise error across the whole scan, not per variable.
    Ties are unchanged by a shuffle, so var(S) is computed once.
    """
    rng = np.random.default_rng(seed)
    lengths = {y.shape[0] for y, _, _ in series}
    joint = len(lengths) == 1
    null = np.empty(n_perm)
    for i in range(n_perm):
        idx = rng.permutation(next(iter(lengths))) if joint else None
        best = 0.0
        for y, var, valid in series:
            order = idx if joint else rng.permutation(y.shape[0])
            z = core.mk_z(core.mk_s(y[order]), var).reshape(shape)
            best = max(best, max_cluster_mass(z, valid, thr))
        null[i] = best
    return null


# ---------------------------------------------------------------- scanning

def scan_cubes(data: dict[str, dict], n_perm: int = 199, alpha: float = ALPHA, alpha_fdr: float = 0.10,
               seed: int = 0) -> dict:
    """Scan already-loaded cubes. data[var] = {dates, lats, lons, cube}. Grids must match.

    Three stages per pixel, all at the same per-test level alpha:
      usual          plain Mann-Kendall on monthly anomalies, p < alpha
      pre-whitened   Mann-Kendall after lag-1 pre-whitening, p < alpha
      + FDR          pre-whitened p-values, Benjamini-Hochberg at q = alpha_fdr across every variable
                     and pixel of this scan (q = 2 alpha for correlated fields, Wilks 2016)
    Clusters are a separate test: same-sign groups of |z| > 1.96 whose mass beats the shuffled maps.
    """
    first = next(iter(data.values()))
    lats, lons = first["lats"], first["lons"]
    shape = (len(lats), len(lons))
    per_var, all_p, owners, null_inputs, observed = {}, [], [], [], {}
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
        present = np.isfinite(anom).mean(axis=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            spread = np.nanstd(anom, axis=0)
        # untestable: too many gaps, or constant (soil wetness pinned at 1 over ice)
        valid_flat = ((1 - present) <= MAX_MISSING) & (spread > 0)
        anom[:, ~valid_flat] = np.nan  # untested pixels stay missing; nothing is filled in
        valid = valid_flat.reshape(shape)

        plain = core.mk_test(anom)
        y_pw = core.prewhiten(anom)
        var_pw = core.mk_var(y_pw)
        z_map = np.where(valid, core.mk_z(core.mk_s(y_pw), var_pw).reshape(shape), np.nan)
        p_pw = np.where(valid, 2 * norm.sf(np.abs(z_map)), np.nan)
        p_naive = np.where(valid, plain["p"].reshape(shape), np.nan)
        naive_mask = valid & (p_naive < alpha)
        pw_mask = valid & (p_pw < alpha)
        naive_hits += int(naive_mask.sum())
        honest_raw_hits += int(pw_mask.sum())
        n_tests += int(valid.sum())
        all_p.append(p_pw.ravel())
        owners.append(v)
        null_inputs.append((y_pw, var_pw, valid))
        observed[v] = find_clusters(z_map, valid)
        rate = np.where(valid, sen_rate_per_decade(anom).reshape(shape), np.nan)
        name, units, up, down = SCAN_VARS.get(v, (v, "", "rising", "falling"))
        per_var[v] = {"name": name, "units": units, "word_up": up, "word_down": down,
                      "period": [dates[0], dates[-1]],
                      "z": z_map, "z_naive": np.where(valid, plain["z"].reshape(shape), np.nan),
                      "p_naive": p_naive, "p_prewhitened": p_pw,
                      "naive_mask": naive_mask, "prewhitened_mask": pw_mask,
                      "rate_per_decade": rate, "rate_method": "Sen's slope of monthly anomalies, per decade",
                      "valid": valid, "coverage": present.reshape(shape)}

    null = max_mass_null(null_inputs, shape, n_perm, seed)
    lat_a, lon_a = np.array(lats), np.array(lons)
    for v, clusters in observed.items():
        info = per_var[v]
        cl_map = np.zeros(shape, dtype=int)
        cl_out = []
        for i, c in enumerate(sorted(clusters, key=lambda c: -c["mass"]), start=1):
            c["p"] = float((1 + (null >= c["mass"]).sum()) / (1 + n_perm))
            ys, xs = np.nonzero(c["mask"])
            sig = c["p"] < alpha
            if sig:
                cl_map[c["mask"]] = i * c["sign"]
            cl_out.append({
                "id": i, "direction": "rising" if c["sign"] > 0 else "falling", "size": c["size"],
                "mass": c["mass"], "p": c["p"], "significant": bool(sig),
                "test": "cluster mass vs the largest cluster on time-shuffled maps of all variables",
                "center_lat": float(np.mean(lat_a[ys])), "center_lon": float(np.mean(lon_a[xs])),
                "mean_rate_per_decade": float(np.nanmean(info["rate_per_decade"][c["mask"]])),
                "pixels": [[int(a), int(b)] for a, b in zip(ys, xs)],
            })
        info.update({"cluster_map": cl_map, "clusters": cl_out,
                     "null_max_mass_95": float(np.quantile(null, 0.95))})

    # FDR across every variable and pixel together.
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
                    "significant_clusters": int(sig_clusters), "permutations": n_perm,
                    "alpha": alpha, "fdr_q": alpha_fdr, "max_missing": MAX_MISSING,
                    "fdr_scope": f"all {len(owners)} variables x every tested pixel of this box",
                    "cluster_scope": f"largest cluster over all {len(owners)} variables (family-wise {alpha:.0%})"},
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


# Bump when the method changes so cached scans made with the old method are not served.
# 2: tie correction, no zero-filled gaps, Sen rates, cluster null = max over all variables.
METHOD_VERSION = 2


def scan_key(bbox, variables, start, end, n_perm) -> str:
    raw = json.dumps([list(map(float, bbox)), sorted(variables), start, end, n_perm, METHOD_VERSION])
    return hashlib.sha1(raw.encode()).hexdigest()[:12]
