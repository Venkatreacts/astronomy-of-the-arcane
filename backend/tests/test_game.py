"""Train your eye: game.json equals a fresh build, real rounds pass the map rule, noise twins have no trend."""

import json
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
import build_game as bg  # noqa: E402


def test_game_file_equals_fresh_build():
    stored = json.loads((bg.WEB / "game.json").read_text(encoding="utf-8"))
    assert stored == json.loads(json.dumps(bg.build()))


def test_pools_are_balanced_and_labelled():
    rounds = json.loads((bg.WEB / "game.json").read_text(encoding="utf-8"))["rounds"]
    real = [r for r in rounds if r["kind"] == "real"]
    noise = [r for r in rounds if r["kind"] == "noise"]
    assert len(real) == len(noise) >= 10
    for r in real:  # every real round is an atlas point that passes the map rule
        cell = json.loads((bg.CELLS / f"{r['lat']:+.1f}_{r['lon']:+.1f}.json").read_text(encoding="utf-8"))
        assert cell["vars"][r["var"]]["fdr"]
    for k, r in enumerate(noise):  # each twin keeps its real record's missing months
        twin_of = real[k]
        assert [v is None for v in r["anomalies"]] == [v is None for v in twin_of["anomalies"]]
        assert "lat" not in r and 0 <= r["phi_model"] <= 0.95
