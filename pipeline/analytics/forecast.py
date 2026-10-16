"""P2T02 + P2T03: 12-month forecast of the BOT price index with Google TimesFM 2.5, backtested against
the app's log-linear method (src/lib/valuation/forecast.ts) over rolling windows.

    python pipeline/analytics/forecast.py                      # average of TimesFM 2.5 and the trend (team choice, 16 Oct)
    python pipeline/analytics/forecast.py --method timesfm     # TimesFM 2.5 only
    python pipeline/analytics/forecast.py --method loglinear   # trend only, no model download (source "fallback")

The backtest always prints all three methods, so the choice can be revisited from script output.

Reads  pipeline/analytics/data/bot_rppi.csv (+ SOURCE.md for the download stamp)
Writes src/data/market/forecast.json (contract: src/lib/market-data/types.ts ForecastFile)
       pipeline/analytics/data/backtest.csv (every backtest window, every method: the model card quotes this)

Model: google/timesfm-2.5-200m-pytorch (Apache-2.0). The TimesFM 3.0 checkpoint is under a non-commercial
licence, so we don't use it. Quantile columns: 0 = mean, 1..9 = 10th..90th percentile; the point forecast is
column 5 (the median), which the script asserts.
"""
from __future__ import annotations

import argparse
import json
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
BACKTEST = HERE / "data" / "backtest.csv"
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


def blend(a: tuple, b: tuple) -> tuple:
    """Equal-weight average of two forecasts, quantile by quantile."""
    return tuple((np.asarray(x) + np.asarray(y)) / 2 for x, y in zip(a, b))


METHOD_MODEL = {
    "blend": f"Average of Google TimesFM 2.5 200M ({CHECKPOINT}, Apache-2.0, zero-shot) and the log-linear trend",
    "timesfm": f"Google TimesFM 2.5 200M ({CHECKPOINT}, Apache-2.0), zero-shot",
    "loglinear": "Log-linear trend over the last 60 months (app baseline)",
}


def mape(actual: np.ndarray, pred: np.ndarray) -> float:
    return float(np.mean(np.abs(pred - actual) / actual) * 100)


def coverage(actual: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    return float(np.mean((actual >= lo) & (actual <= hi)) * 100)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", choices=list(METHOD_MODEL), default="blend")
    ap.add_argument("--horizon", type=int, default=12)
    ap.add_argument("--holdout", type=int, default=12, help="months scored after each backtest origin")
    ap.add_argument("--origins", type=int, default=10, help="rolling backtest origins (1 = single last window)")
    ap.add_argument("--step", type=int, default=6, help="months between backtest origins")
    a = ap.parse_args()
    series = load()
    keys = list(series)

    # Rolling-origin backtest: for each origin, fit on the months before it and score the next `holdout` months.
    n = len(series[keys[0]])
    ends = [n - a.holdout - i * a.step for i in range(a.origins)][::-1]
    jobs = [(k, e) for e in ends for k in keys]
    ctx = [series[k].values[:e] for k, e in jobs]
    act = [series[k].values[e:e + a.holdout] for k, e in jobs]
    preds = {"loglinear": [loglinear(c, a.holdout) for c in ctx]}
    if a.method != "loglinear":
        preds["timesfm"] = timesfm_forecast(ctx, a.holdout)
        preds["blend"] = [blend(t, b) for t, b in zip(preds["timesfm"], preds["loglinear"])]
    rows = []
    for i, ((k, e), y) in enumerate(zip(jobs, act)):
        for name, ps in preds.items():
            lo, mid, hi = ps[i]
            rows.append({"series": k, "origin": series[k].index[e - 1], "method": name, "mape": mape(y, mid), "cover80": coverage(y, lo, hi)})
    bt = pd.DataFrame(rows)
    bt.round(4).to_csv(BACKTEST, index=False)
    idx = series[keys[0]].index
    print(f"Backtest: {len(ends)} rolling origins every {a.step} months x {len(keys)} series, each scored on the next {a.holdout} months "
          f"(scored periods {idx[ends[0]]} … {idx[-1]})")
    print(bt.pivot_table(index="series", columns="method", values=["mape", "cover80"], aggfunc="mean").round(2).to_string())
    summary = bt.groupby("method").agg(mape=("mape", "mean"), cover80=("cover80", "mean"))
    print("Mean over all windows (MAPE %, share of actuals inside the p10–p90 range %):")
    print(summary.round(2).to_string())
    wide = bt.pivot_table(index=["series", "origin"], columns="method", values="mape")
    if a.method != "loglinear":
        print(f"More accurate than the trend in: TimesFM {int((wide.timesfm < wide.loglinear).sum())}/{len(wide)} windows, "
              f"average {int((wide.blend < wide.loglinear).sum())}/{len(wide)}")
    mm, mb = float(summary.loc[a.method, "mape"]), float(summary.loc["loglinear", "mape"])

    # Final forecast on the full history.
    full = [series[k].values for k in keys]
    trend = [loglinear(c, a.horizon) for c in full]
    if a.method == "loglinear":
        fc = trend
    else:
        tfm = timesfm_forecast(full, a.horizon)
        fc = tfm if a.method == "timesfm" else [blend(t, b) for t, b in zip(tfm, trend)]

    stamp = re.search(r"Retrieved \(BOT stamp\):\*\*\s*([^;]+)", SOURCE_MD.read_text(encoding="utf-8"))
    updated = re.search(r"BOT last updated:\*\*\s*(.+)", SOURCE_MD.read_text(encoding="utf-8"))
    r1 = lambda v: round(float(v), 1)
    doc = {
        "meta": {
            "source": "fallback" if a.method == "loglinear" else "timesfm",
            "is_sample": False,
            "model": METHOD_MODEL[a.method],
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
                "baseline": f"a simple trend line over the last 60 months; error averaged over {len(ends)} rolling {a.holdout}-month tests "
                            f"on {len(keys)} series, {idx[ends[0]]} to {idx[-1]}",
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
