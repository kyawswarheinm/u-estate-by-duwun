# P2 analytics pipeline

Offline scripts that produce the market snapshots the app reads (`docs/TECH_STACK.md` §2, `docs/WORKPLAN.md` §5).
Outputs must pass the contract test: `npx vitest run src/lib/market-data`.

## Setup (once)

Python 3.11, CPU only. [uv](https://github.com/astral-sh/uv) is fastest; plain `python -m venv` + `pip` also works.
Keep the venv **outside the repo**: ESLint scans the repo folder and fails on JavaScript files bundled inside torch.

```bash
uv venv --python 3.11 ~/.venvs/u-estate-analytics
uv pip install --python ~/.venvs/u-estate-analytics/Scripts/python.exe -r pipeline/analytics/requirements.txt
```

Below, `PY` means `~/.venvs/u-estate-analytics/Scripts/python.exe` (macOS/Linux: `~/.venvs/u-estate-analytics/bin/python`).
`raw/`, `out/` and `cache/` are git-ignored.

## Commands

| Step | Command | Writes |
|---|---|---|
| P2T01 BOT index | `PY pipeline/analytics/fetch_bot.py` | `data/bot_rppi.csv`, `data/SOURCE.md` (raw file in `raw/`) |
| P2T02/T03 forecast + backtest | `PY pipeline/analytics/forecast.py` (default `--method blend`; also `timesfm`, `loglinear`). Add `HF_HUB_OFFLINE=1` once the model is cached | `src/data/market/forecast.json`, `data/backtest.csv` |
| P2T04 market stats | `PY pipeline/analytics/describe.py` (`--listings <path> --out <path>`; `--min-count 1` only for the fixture) | `src/data/market/stats.json` |
| Charts for the deck | `PY pipeline/analytics/chart.py` | `charts/forecast.png`, `charts/backtest.png` |

**Model:** TimesFM 2.5 200M (`google/timesfm-2.5-200m-pytorch`, Apache-2.0, ~925 MB, downloaded once to the Hugging Face cache in your home folder). We don't use the TimesFM 3.0 checkpoint: its weights are under Google's non-commercial licence.

**Why the blend:** over 30 rolling backtest windows the simple trend was most accurate (MAPE 1.28%), TimesFM 2.5 alone 1.61%, their average 1.31% (see `data/backtest.csv`). The BOT index is a smooth 3-month moving average, which a trend fits well. The team chose the average (16 Oct): near-best accuracy with TimesFM in the loop.

**P1's real listings before merge** (never commit P1's file on this branch):

```bash
git fetch && git show origin/P1:src/data/market/listings.json > pipeline/analytics/out/listings-p1.json
PY pipeline/analytics/describe.py --listings pipeline/analytics/out/listings-p1.json --out pipeline/analytics/out/stats-p1.json
```

