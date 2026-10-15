# P2 analytics pipeline

Offline scripts that produce the market snapshots the app reads (`docs/TECH_STACK.md` §2, `docs/WORKPLAN.md` §5).
Outputs must pass the contract test: `npx vitest run src/lib/market-data`.

## Setup (once)

Python 3.11, CPU only. [uv](https://github.com/astral-sh/uv) is fastest; plain `python -m venv` + `pip` also works.

```bash
uv venv --python 3.11 pipeline/analytics/.venv
uv pip install --python pipeline/analytics/.venv/Scripts/python.exe -r pipeline/analytics/requirements.txt
```

The venv, `raw/`, `out/`, `cache/` and model weights are git-ignored.

## Commands

| Step | Command | Writes |
|---|---|---|
| P2T01 BOT index | `pipeline/analytics/.venv/Scripts/python.exe pipeline/analytics/fetch_bot.py` | `data/bot_rppi.csv`, `data/SOURCE.md` (raw file in `raw/`) |

On macOS/Linux use `pipeline/analytics/.venv/bin/python`.
