"""Validation runs for the proof slide.

python -m trendlab.validate            (from backend/)
python -m trendlab.validate --quick    (fewer simulations, for a smoke test)

Prints false-alarm rates on trend-free noise and detection rates on injected trends,
for the plain Mann-Kendall test vs the pre-whitened Mann-Kendall test, plus a map test
with spatially correlated noise (naive p<0.05 vs FDR).
"""

from __future__ import annotations

import argparse

import numpy as np

from .stats import ar1_noise_cube, noise_trap, trend_test


def false_alarm_rates(phis=(0.0, 0.3, 0.6), n_sims=500, n_time=300, alpha=0.05, seed=1):
    rows = []
    for phi in phis:
        cube = ar1_noise_cube(n_time, 1, n_sims, phi, 1.0, 0.0, seed)
        naive = honest = 0
        for i in range(n_sims):
            s = cube[:, 0, i]
            naive += trend_test(s, "naive", alpha)["significant"]
            honest += trend_test(s, "honest", alpha)["significant"]
        rows.append({"phi": phi, "naive_false_alarms": naive / n_sims, "honest_false_alarms": honest / n_sims})
    return rows


def detection_rates(trends_per_decade=(0.1, 0.2, 0.4), phi=0.3, n_sims=300, n_time=300, alpha=0.05, seed=2):
    rows = []
    t_years = np.arange(n_time) / 12.0
    for trend in trends_per_decade:
        cube = ar1_noise_cube(n_time, 1, n_sims, phi, 1.0, 0.0, seed)
        naive = honest = 0
        for i in range(n_sims):
            s = cube[:, 0, i] + (trend / 10.0) * t_years
            naive += trend_test(s, "naive", alpha)["significant"]
            honest += trend_test(s, "honest", alpha)["significant"]
        rows.append({"trend_per_decade_in_sd": trend, "phi": phi,
                     "naive_detects": naive / n_sims, "honest_detects": honest / n_sims})
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args(argv)
    n1, n2, size = (120, 80, 15) if args.quick else (500, 300, 30)

    print("False alarms on pure noise (should be 5%):")
    for r in false_alarm_rates(n_sims=n1):
        print(f"  phi={r['phi']:.1f}  naive={r['naive_false_alarms']:.1%}  honest={r['honest_false_alarms']:.1%}")

    print("Detection of real trends (higher is better):")
    for r in detection_rates(n_sims=n2):
        print(f"  trend={r['trend_per_decade_in_sd']:.1f} SD/decade  naive={r['naive_detects']:.1%}  honest={r['honest_detects']:.1%}")

    res = noise_trap(ny=size, nx=size, phi=0.5, spatial_sigma=2.0, seed=0)
    print(f"Map of pure noise ({size}x{size}, phi=0.5, spatially correlated):")
    print(f"  naive pixels flagged = {res['naive_fraction']:.1%}   honest (FDR) = {res['honest_fraction']:.1%}")


if __name__ == "__main__":
    main()
