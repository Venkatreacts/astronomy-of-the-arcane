"""Trend regimes (unsupervised ML) and compound patterns on top of a scan result.

Regimes: k-means on each pixel's "trend fingerprint" (its Mann-Kendall z in every variable).
k is chosen from 2-5 by silhouette score; if no k separates the map well (silhouette < 0.25)
we report no regimes rather than inventing structure. Regimes describe; they do not prove.
"""

from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

STRONG_Z = 1.5  # centroid z at which a variable is named in the regime label


def trend_regimes(scan: dict, k_range=range(2, 6), min_silhouette: float = 0.25, seed: int = 0) -> dict:
    variables = list(scan["variables"])
    shape = (len(scan["lats"]), len(scan["lons"]))
    valid = np.all([scan["variables"][v]["valid"] for v in variables], axis=0)
    feats = np.stack([np.clip(scan["variables"][v]["z"], -6, 6)[valid] for v in variables], axis=1)
    empty = {"k": 0, "silhouette": None, "label_map": np.full(shape, -1), "regimes": [],
             "note": "No clear regimes: places are not changing in distinct combined ways."}
    if feats.shape[0] < 10:
        return empty

    best = None
    for k in k_range:
        if k >= feats.shape[0]:
            break
        km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(feats)
        if len(set(km.labels_)) < 2:
            continue
        s = silhouette_score(feats, km.labels_)
        if best is None or s > best[0]:
            best = (s, k, km)
    if best is None or best[0] < min_silhouette:
        out = dict(empty)
        if best is not None:
            out["silhouette"] = float(best[0])
        return out

    s, k, km = best
    label_map = np.full(shape, -1)
    label_map[valid] = km.labels_
    regimes = []
    for i, c in enumerate(km.cluster_centers_):
        words = []
        for v, cz in sorted(zip(variables, c), key=lambda t: -abs(t[1])):
            if abs(cz) >= STRONG_Z:
                info = scan["variables"][v]
                words.append(info["word_up"] if cz > 0 else info["word_down"])
        regimes.append({
            "id": i, "label": " + ".join(words[:3]) if words else "little change",
            "pixels": int((km.labels_ == i).sum()),
            "fingerprint": {v: float(cz) for v, cz in zip(variables, c)},
        })
    return {"k": int(k), "silhouette": float(s), "label_map": label_map, "regimes": regimes,
            "note": "Regimes group places with similar combined trends. They describe; they do not prove."}


def compound_patterns(scan: dict, min_overlap: int = 3) -> list[dict]:
    """Significant clusters of different variables that overlap on the map."""
    sig = []
    for v, info in scan["variables"].items():
        for c in info["clusters"]:
            if c["significant"]:
                mask = np.zeros((len(scan["lats"]), len(scan["lons"])), dtype=bool)
                for a, b in c["pixels"]:
                    mask[a, b] = True
                sig.append((v, c, mask))
    found = []
    for i in range(len(sig)):
        for j in range(i + 1, len(sig)):
            (v1, c1, m1), (v2, c2, m2) = sig[i], sig[j]
            if v1 == v2:
                continue
            overlap = int((m1 & m2).sum())
            if overlap >= min_overlap:
                ys, xs = np.nonzero(m1 & m2)
                i1, i2 = scan["variables"][v1], scan["variables"][v2]
                w1 = i1["word_up"] if c1["direction"] == "rising" else i1["word_down"]
                w2 = i2["word_up"] if c2["direction"] == "rising" else i2["word_down"]
                found.append({
                    "variables": [v1, v2], "overlap_pixels": overlap,
                    "center_lat": float(np.mean(np.array(scan["lats"])[ys])),
                    "center_lon": float(np.mean(np.array(scan["lons"])[xs])),
                    "text": f"{w1.capitalize()} and {w2} in the same place ({overlap} pixels)",
                })
    return sorted(found, key=lambda f: -f["overlap_pixels"])


def findings(scan: dict, regimes: dict, compounds: list[dict]) -> list[str]:
    """Plain-language findings, strongest first. Every number comes from the scan."""
    s = scan["summary"]
    out = [f"{s['n_tests']} trend tests run. The usual method would report {s['naive_hits']} 'significant' pixels; "
           f"after removing autocorrelation and controlling false discoveries, {s['fdr_hits']} remain, "
           f"and {s['significant_clusters']} cluster(s) pass the permutation test."]
    clusters = []
    for v, info in scan["variables"].items():
        for c in info["clusters"]:
            if c["significant"]:
                word = info["word_up"] if c["direction"] == "rising" else info["word_down"]
                clusters.append((c["mass"], f"{info['name']}: {word} across {c['size']} pixels around "
                                 f"{c['center_lat']:.1f}N, {c['center_lon']:.1f}E "
                                 f"({c['mean_rate_per_decade']:+.3g} {info['units']} per decade, cluster p = {c['p']:.3f})."))
    out += [t for _, t in sorted(clusters, key=lambda t: -t[0])]
    out += [f"Compound pattern: {c['text']} near {c['center_lat']:.1f}N, {c['center_lon']:.1f}E." for c in compounds[:3]]
    if regimes["k"]:
        names = "; ".join(f"{r['label']} ({r['pixels']} pixels)" for r in regimes["regimes"])
        out.append(f"Trend regimes found by clustering: {names}.")
    if s["significant_clusters"] == 0:
        out.append("No trend cluster here is stronger than chance. That is a real answer, not a failure.")
    return out
