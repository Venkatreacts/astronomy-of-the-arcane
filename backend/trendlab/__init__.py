"""Noise Trap trend engine: honest trend detection for Earth science time series."""

from .stats import (
    deseasonalize,
    trend_test,
    noise_params,
    years_to_detect,
    fdr_bh,
    analyze_series,
    map_trends,
    ar1_noise_cube,
    noise_trap,
)

__all__ = [
    "deseasonalize",
    "trend_test",
    "noise_params",
    "years_to_detect",
    "fdr_bh",
    "analyze_series",
    "map_trends",
    "ar1_noise_cube",
    "noise_trap",
]
