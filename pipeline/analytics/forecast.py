"""P2T02 + P2T03: 12-month forecast of the BOT price index with Google TimesFM 2.5, backtested against
the app's log-linear method (src/lib/valuation/forecast.ts).

    python pipeline/analytics/forecast.py              # TimesFM (source "timesfm")
    python pipeline/analytics/forecast.py --fallback   # log-linear only (source "fallback")

Reads  pipeline/analytics/data/bot_rppi.csv (+ SOURCE.md for the download stamp)
Writes src/data/market/forecast.json (contract: src/lib/market-data/types.ts ForecastFile)

Model: google/timesfm-2.5-200m-pytorch (Apache-2.0). The TimesFM 3.0 checkpoint is under a non-commercial
licence, so we don't use it. Quantile columns: 0 = mean, 1..9 = 10th..90th percentile; the point forecast is
column 5 (the median), which the script asserts.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DATA = HERE / "data" / "bot_rppi.csv"
SOURCE_MD = HERE / "data" / "SOURCE.md"
OUT = REPO / "src" / "data" / "market" / "forecast.json"
CHECKPOINT = "google/timesfm-2.5-200m-pytorch"
ICT = timezone(timedelta(hours=7))
Z80 = 1.2815515655446004  # 80% two-sided range, same as the app's 1.28

SERIES = {
    "condo_bkk": ("condo", "Condominium price index (Bank of Thailand)"),
    "house_bkk": ("house", "Single-detached house price index, including land (Bank of Thailand)"),
    "townhouse_bkk": ("townhouse", "Townhouse price index, including land (Bank of Thailand)"),
}


def load() -> dict[str, pd.Series]:
    d = pd.read_csv(DATA, dtype={"period": str})
    out = {}
    for key in SERIES:
        s = d[d.series_key == key].sort_values("period").set_index("period")["value"].astype(float)
        months = pd.period_range(s.index[0], s.index[-1], freq="M").astype(str)
        if list(s.index) != list(months):
            raise SystemExit(f"{key}: months are missing; rerun fetch_bot.py")
        out[key] = s
    return out


def next_periods(last: str, n: int) -> list[str]:
    p = pd.Period(last, freq="M")
    return [str(p + i) for i in range(1, n + 1)]


# ---------- baseline: the app's log-linear method, monthly ----------

def loglinear(values: np.ndarray, horizon: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """g = slope of log(index) over the last 60 months x 12; sigma = std-dev of 12-month log changes.
    Monthly step h: central = V e^{g h/12}, range = V e^{g h/12 +- 1.28 sigma sqrt(h/12)}."""
    recent = np.log(values[-60:])
    x = np.arange(len(recent))
    g = np.polyfit(x, recent, 1)[0] * 12
    changes = np.log(values[12:]) - np.log(values[:-12])
    sigma = float(np.std(changes, ddof=1)) if len(changes) > 1 else 0.0
    t = np.arange(1, horizon + 1) / 12
    v = values[-1]
    return v * np.exp(g * t - Z80 * sigma * np.sqrt(t)), v * np.exp(g * t), v * np.exp(g * t + Z80 * sigma * np.sqrt(t))


# ---------- TimesFM 2.5 ----------

_model = None


def timesfm_forecast(contexts: list[np.ndarray], horizon: int) -> list[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    global _model
    import timesfm
    import torch

    torch.manual_seed(0)
    if _model is None:
        _model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(CHECKPOINT)
        _model.compile(timesfm.ForecastConfig(
            max_context=512, max_horizon=64, normalize_inputs=True, use_continuous_quantile_head=True,
            force_flip_invariance=True, infer_is_positive=True, fix_quantile_crossing=True,
        ))
    point, q = _model.forecast(horizon=horizon, inputs=[c.astype(np.float32) for c in contexts])
    if not np.allclose(point, q[..., 5], rtol=1e-4, atol=1e-4):
        raise SystemExit("Quantile layout changed: point forecast is not column 5. Check the timesfm version.")
    out = []
    for i in range(len(contexts)):
        p10, p50, p90 = np.sort(np.stack([q[i, :, 1], q[i, :, 5], q[i, :, 9]]), axis=0)
        out.append((p10, p50, p90))
    return out


def mape(actual: np.ndarray, pred: np.ndarray) -> float:
    return float(np.mean(np.abs(pred - actual) / actual) * 100)


def coverage(actual: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    return float(np.mean((actual >= lo) & (actual <= hi)) * 100)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fallback", action="store_true", help="log-linear only, no TimesFM")
    ap.add_argument("--horizon", type=int, default=12)
    ap.add_argument("--holdout", type=int, default=12)
    a = ap.parse_args()
    series = load()
    keys = list(series)

    # Backtest: fit on everything except the last `holdout` months, score on them.
    ctx = [series[k].values[: -a.holdout] for k in keys]
    act = [series[k].values[-a.holdout:] for k in keys]
    base_bt = [loglinear(c, a.holdout) for c in ctx]
    model_bt = base_bt if a.fallback else timesfm_forecast(ctx, a.holdout)
    rows = []
    for k, y, b, m in zip(keys, act, base_bt, model_bt):
        rows.append({"series": k, "mape_model": mape(y, m[1]), "mape_baseline": mape(y, b[1]),
                     "cover80_model": coverage(y, m[0], m[2]), "cover80_baseline": coverage(y, b[0], b[2])})
    bt = pd.DataFrame(rows)
    print(f"Backtest: last {a.holdout} months held out ({series[keys[0]].index[-a.holdout]} … {series[keys[0]].index[-1]})")
    print(bt.round(2).to_string(index=False))
    mm, mb = float(bt.mape_model.mean()), float(bt.mape_baseline.mean())
    print(f"Mean MAPE  model {mm:.2f}%  baseline {mb:.2f}%   |  mean p10–p90 coverage  model {bt.cover80_model.mean():.0f}%  baseline {bt.cover80_baseline.mean():.0f}%")

    # Final forecast on the full history.
    full = [series[k].values for k in keys]
    fc = [loglinear(c, a.horizon) for c in full] if a.fallback else timesfm_forecast(full, a.horizon)

    stamp = re.search(r"Retrieved \(BOT stamp\):\*\*\s*([^;]+)", SOURCE_MD.read_text(encoding="utf-8"))
    updated = re.search(r"BOT last updated:\*\*\s*(.+)", SOURCE_MD.read_text(encoding="utf-8"))
    r1 = lambda v: round(float(v), 1)
    doc = {
        "meta": {
            "source": "fallback" if a.fallback else "timesfm",
            "is_sample": False,
            "model": "Log-linear trend (app baseline)" if a.fallback else f"Google TimesFM 2.5 200M ({CHECKPOINT}, Apache-2.0), zero-shot",
            "series_source": "Bank of Thailand, Residential Property Price Index (table EC_EI_008_S4), Bangkok and vicinities"
                             + (f"; BOT updated {updated.group(1).strip()}" if updated else ""),
            "series_url": "https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=993&language=ENG",
            "downloaded_at": stamp.group(1).strip() if stamp else "",
            "generated_at": datetime.now(ICT).isoformat(timespec="minutes"),
            "frequency": "monthly",
            "backtest": {
                "holdout_periods": a.holdout,
                "mape_model_pct": round(mm, 2),
                "mape_baseline_pct": round(mb, 2),
                "baseline": "log-linear trend over the last 60 months (src/lib/valuation/forecast.ts)",
            },
            "note": "Forecast of a regional price index (3-month moving average of mortgage-backed prices), not of any single property. "
                    "p10–p90 is an 80% range. Not a guarantee.",
        },
        "series": [],
    }
    for k, (lo, mid, hi) in zip(keys, fc):
        typ, label = SERIES[k]
        s = series[k]
        doc["series"].append({
            "key": k, "type": typ, "region": "Bangkok and vicinities", "label": label, "unit": "index, 2011 = 100",
            "history": [{"period": p, "value": r1(v)} for p, v in s.items()],
            "forecast": [{"period": p, "p10": r1(l), "p50": r1(m), "p90": r1(h)}
                         for p, l, m, h in zip(next_periods(s.index[-1], a.horizon), lo, mid, hi)],
        })
        f = doc["series"][-1]["forecast"]
        print(f"{k}: last {s.index[-1]} = {s.iloc[-1]:.1f} → {f[-1]['period']} p50 {f[-1]['p50']} (p10 {f[-1]['p10']}, p90 {f[-1]['p90']})")
    OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)} (source {doc['meta']['source']})")


if __name__ == "__main__":
    main()
