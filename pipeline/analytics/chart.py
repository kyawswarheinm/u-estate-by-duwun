"""Charts for the deck and the model card, drawn only from the pipeline outputs.

    python pipeline/analytics/chart.py

Reads  src/data/market/forecast.json, pipeline/analytics/data/backtest.csv
Writes pipeline/analytics/charts/forecast.png   BOT index since 2019 + 12-month p10–p90 range and p50
       pipeline/analytics/charts/backtest.png   mean error per method over the rolling backtest
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates
import matplotlib.pyplot as plt
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = HERE / "charts"
# U-Estate palette (src/app/globals.css)
MIDNIGHT, DEEP, BLUE_GREY, SILVER, BLUE, ICE = "#101e32", "#253e5b", "#5f7186", "#c7d4de", "#2f7df6", "#eef3f8"

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.edgecolor": SILVER, "axes.labelcolor": DEEP,
                     "xtick.color": BLUE_GREY, "ytick.color": BLUE_GREY, "axes.spines.top": False, "axes.spines.right": False})


def forecast_chart(doc: dict) -> None:
    series = doc["series"]
    fig, axes = plt.subplots(1, len(series), figsize=(13.33, 4.6), sharey=False)
    for ax, s in zip(axes, series):
        h = pd.DataFrame(s["history"])
        h = h[h.period >= "2019-01"]
        f = pd.DataFrame(s["forecast"])
        hx, fx = pd.PeriodIndex(h.period, freq="M").to_timestamp(), pd.PeriodIndex(f.period, freq="M").to_timestamp()
        ax.plot(hx, h.value, color=MIDNIGHT, lw=2, label="Bank of Thailand index")
        ax.fill_between(fx, f.p10, f.p90, color=BLUE, alpha=0.18, lw=0, label="p10–p90 (80% range)")
        ax.plot([hx[-1], fx[0]], [h.value.iloc[-1], f.p50.iloc[0]], color=BLUE, lw=2, ls="--")
        ax.plot(fx, f.p50, color=BLUE, lw=2, ls="--", label="p50 forecast")
        last, end = h.iloc[-1], f.iloc[-1]
        title = s["label"].replace(" (Bank of Thailand)", "")
        title = title.replace(", including land", "\n(including land)") if "including land" in title else title + "\n "  # blank line keeps the three titles aligned
        ax.set_title(title, color=MIDNIGHT, fontsize=12, loc="left")
        ax.annotate(f"{end.period}: {end.p50:.1f}\n({end.p10:.1f}–{end.p90:.1f})", (fx[-1], end.p50), xytext=(-4, 18),
                    textcoords="offset points", ha="right", color=BLUE, fontsize=9)
        ax.scatter([hx[-1]], [last.value], color=MIDNIGHT, s=18, zorder=3)
        ax.annotate(f"{last.period}: {last.value:.1f}", (hx[-1], last.value), xytext=(0, -34), textcoords="offset points", ha="center",
                    color=MIDNIGHT, fontsize=9, arrowprops={"arrowstyle": "-", "color": BLUE_GREY, "lw": 0.8})
        ax.xaxis.set_major_locator(matplotlib.dates.YearLocator(2))
        ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%Y"))
        ax.grid(axis="y", color=ICE)
        ax.set_ylabel(s["unit"] if ax is axes[0] else "")
    axes[0].legend(frameon=False, fontsize=9, loc="upper left")
    m = doc["meta"]
    fig.suptitle("Bangkok and vicinities: residential price index and 12-month forecast", color=MIDNIGHT, fontsize=14, x=0.01, ha="left")
    fig.text(0.01, 0.01, f"Source: {m['series_source']}. Model: {m['model']}. A forecast of a regional index, not of any single property; not a guarantee.",
             fontsize=8, color=BLUE_GREY, wrap=True)
    fig.tight_layout(rect=(0, 0.05, 1, 0.94))
    fig.savefig(OUT / "forecast.png", dpi=200, facecolor="white")
    plt.close(fig)


def backtest_chart(bt: pd.DataFrame, tested_on: str) -> None:
    names = {"loglinear": "Trend line", "timesfm": "TimesFM 2.5", "blend": "Average\n(shipped)"}
    order = ["loglinear", "timesfm", "blend"]
    mean = bt.groupby("method")["mape"].mean().reindex(order)
    windows = bt.groupby(["series", "origin"]).ngroups
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    bars = ax.bar([names[m] for m in order], mean.values, color=[SILVER, BLUE_GREY, BLUE], width=0.6)
    for b, v in zip(bars, mean.values):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.03, f"{v:.2f}%", ha="center", color=MIDNIGHT, fontsize=11)
    ax.set_ylabel("Mean absolute % error, 12 months ahead")
    ax.set_ylim(0, max(mean.values) * 1.25)
    ax.grid(axis="y", color=ICE)
    ax.set_title(f"Backtest: {windows} rolling 12-month windows, 3 BOT series", color=MIDNIGHT, fontsize=12, loc="left")
    fig.text(0.01, 0.01, f"Lower is better. Trend = {tested_on}.", fontsize=7.5, color=BLUE_GREY, wrap=True)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(OUT / "backtest.png", dpi=200, facecolor="white")
    plt.close(fig)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    doc = json.loads((REPO / "src" / "data" / "market" / "forecast.json").read_text(encoding="utf-8"))
    forecast_chart(doc)
    backtest_chart(pd.read_csv(HERE / "data" / "backtest.csv"), doc["meta"]["backtest"]["baseline"])
    print(f"Wrote {OUT / 'forecast.png'} and {OUT / 'backtest.png'}")


if __name__ == "__main__":
    main()
