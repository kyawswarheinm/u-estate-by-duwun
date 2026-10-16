# Source: Bank of Thailand Residential Property Price Index

Written by `fetch_bot.py` from the downloaded file and the BOT page it came from. Do not edit by hand.

- **Publisher:** Bank of Thailand, Data Management and Analytics Department
- **Table:** `EC_EI_008_S4` Residential Property Price Index
- **URL:** https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=993&language=ENG
- **Base:** 2011 = 100
- **Frequency:** monthly (BOT publishes a 3-month moving average)
- **BOT last updated:** 30 Sep 2026 14:32
- **Retrieved (BOT stamp):** 16 Oct 2026 05:27; script run 2026-10-16 05:27 ICT
- **BOT remark (verbatim from the page):** 1/ Single detached house including land, town house including land and condominium price indices are constructed by using hedonic regression method (rolling window and time dummy), and 3-month moving average, which are calculated from mortgage loan data reported by commercial banks and the Government Housing Bank. Additionally, starting from January 2023, mortgage loan data from other specialized financial institutions have been included. 2/ Quarterly price index is the data of the last month in each quarter. 3/ Semi-annual price index is the quarterly average price index. 4/ Annual price index is the semi-annual average price index.

| series_key | BOT row | first | last | months |
|---|---|---|---|---|
| `condo_bkk` | condominium price index → Bangkok and vicinities | 2011-01 | 2026-08 | 188 |
| `house_bkk` | single-detached house price index → Bangkok and vicinities | 2011-01 | 2026-08 | 188 |
| `townhouse_bkk` | town house price index → Bangkok and vicinities | 2011-01 | 2026-08 | 188 |

This is an index of mortgage-backed transaction prices for a region, not the value of any single property.
