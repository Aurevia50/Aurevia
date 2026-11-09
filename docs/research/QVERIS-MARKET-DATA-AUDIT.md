# QVeris Market-Data Audit

## Executive summary

**Recommendation: limited, non-production evaluation only; do not adopt QVeris as a production provider or replace any existing provider.**

The public QVeris catalog exposed 28 distinct, potentially relevant tool records, which were inspected through the documented public-readonly REST interface. The records describe quote, candle, and indicator operations, but the inspected metadata does not establish that the operations work: all 28 report `callable: false`; 23 are `unverified` and five are `failed`. Returned Inspect records contain no output schema or return contract. No provider response, fresh quote, candle, stream, depth snapshot, or indicator result was obtained.

`QVERIS_API_KEY` was unavailable in the agent process environment, so authenticated Discover/Inspect and Probe could not be performed. No Probe was attempted. Official documentation says Probe is free and non-executing, but it is outside public-readonly access and would require authenticated access. No Call or paid operation was performed.

The evidence does not establish Nigeria eligibility, commercial/redistribution rights, provider-specific prices or limits, freshness guarantees, or a usable streaming endpoint. No inspected candidate establishes brokerage execution. Keep Aurevia’s existing providers and account-mode behavior unchanged.

## Scope and method

- Repository root: `/workspaces/Aurevia`; the application is in [`Aurevia-Exchange-main/aurevia`](../../Aurevia-Exchange-main/aurevia/).
- Read current official [QVeris REST API documentation](https://qveris.ai/docs/rest-api) and [QVeris documentation](https://qveris.ai/docs).
- Used the documented `POST /search` Discover and `POST /tools/by-ids` Inspect endpoints at `https://qveris.ai/api/v1`, with `X-Qveris-Access-Mode: public-readonly` and no credentials. Searches used short keywords because several multiword searches returned no results. Search responses are relevance-ranked and capped at 20.
- Inspected 28 distinct market-data candidate records, including returned provider/tool identity, verification status/checks, input parameters, output-schema presence, callable flag, restrictions, and billing fields.
- Public-readonly Discover/Inspect are not account-specific. The documented mode supports only Discover and Inspect, and omits private metadata and raw examples. A returned catalog description is not a live-data test, entitlement, or execution permission.
- Checked only the process-level availability of `QVERIS_API_KEY`; its value was never read or displayed. It was unavailable. To resume authenticated checks, make it available to the agent process through the runtime’s secret/environment manager and restart or reopen the agent. Do not paste it into chat, source, logs, or this report.

## Discover and Inspect results

The tool IDs below are the IDs returned by Discover and supplied to Inspect. The parameter lists are abbreviated to the fields most relevant to the requested capabilities; `!` denotes a required field. **For every row**, Inspect returned `output_schema: null` and `returns: null`, `callable: false`, and no `expected_cost` or `billing_rule`. None returned a provider response example or a timestamp/timezone contract.

| Provider as returned by Inspect | Tool ID | Tool name | Verification | Relevant input schema returned |
|---|---|---|---|---|
| QVeris Finance | `qveris_finance.mkt_bars_intraday` | Intraday OHLCV Bars | `failed` (schema check failed; authentication, provider identity, permissions, freshness and live check missing) | `symbol!`, `interval!` = 1/2/5/10/15/30/45/60 minutes, 1/2/4 hours; `start_date`, `end_date` |
| QVeris Finance | `qveris_finance.mkt_l1_rt` | Real-time Level 1 Quotes | `unverified` | `symbol!` |
| QVeris Finance | `qveris_finance.mkt_bars_adjusted` | Split & Dividend Adjusted Prices | `failed` (schema check failed; other evidence checks missing) | `symbol!`, date range, interval = day/week/month |
| QVeris Finance | `qveris_finance.analytics_macd` | MACD (Chinese-language catalog name) | `unverified` | `symbol!`, interval = 1/5/15/30/60 minutes, day/week/month; date range; `period` |
| QVeris Finance | `qveris_finance.analytics_atr` | ATR (Chinese-language catalog name) | `failed` (schema check failed; other evidence checks missing) | `symbol!`, interval = 1/5/15/30/60 minutes, day/week/month; date/time range; `period` |
| Twelve Data API (Market Data) | `twelvedata.quote.retrieve.v1.affbefe3` | Quote | `unverified` | `symbol` or identifiers; optional interval, exchange, country, timezone, asset type |
| Twelve Data API (Market Data) | `twelvedata.timeseries.retrieve.v1.736574ba` | Time series | `unverified` | `symbol`, interval = 1/5/15/30/45 minutes, 1/2/4/5 hours, day/week/month; output size, start/end/date, timezone, adjustment |
| Twelve Data API (Market Data) | `twelvedata.sma.retrieve.v1.0b0e20d9` | Simple moving average | `unverified` | Time-series inputs plus series type, `time_period`, optional OHLC |
| Twelve Data API (Market Data) | `twelvedata.rsi.retrieve.v1.91d81651` | Relative strength index | `unverified` | Time-series inputs plus series type, `time_period`, optional OHLC |
| Twelve Data API (Market Data) | `twelvedata.macd.retrieve.v1.9735a694` | MACD | `unverified` | Time-series inputs plus series type, fast/slow/signal periods, optional OHLC |
| Twelve Data API (Market Data) | `twelvedata.atr.retrieve.v1.87d6487e` | Average true range | `unverified` | Time-series inputs plus `time_period`, optional OHLC |
| EODHD (Market Data) | `eodhd.technical_indicators.retrieve.v1.241704ea` | Retrieve Technical Indicators | `unverified` | `function` enum includes SMA/EMA/RSI/MACD/ATR; period, date range, aggregation day/week/month and indicator parameters |
| EODHD (Market Data) | `eodhd.eod.retrieve.v1.7b3edfe5` | End of Day Historical Stock Market Data | `unverified` | `symbol!`, period = day/week/month, date range, order |
| EODHD (Market Data) | `eodhd.live_prices.retrieve.v1.178541d4` | Live (Delayed) Stock Prices | `unverified` | `ticker!`, `s` |
| EODHD (Market Data) | `eodhd.live_v2.us_quote_delayed.retrieve.v1.f0e13d45` | Retrieve Delayed US Stock Quotes (Live v2) | `unverified` | `s!`, page limit/offset, format |
| Alpha Vantage (Market Data) | `alphavantage.time-series.daily.v1` | Retrieve Daily Time Series | `unverified` | Function fixed to daily, `symbol!`, compact/full output, JSON/CSV |
| Alpha Vantage (Market Data) | `alphavantage.macd.retrieve.v1.467a92c0` | MACD | `unverified` | Function fixed to MACD, `symbol!`, interval includes 1/5/15/30/60 minutes and day/week/month, periods |
| Alpha Vantage (Market Data) | `alphavantage.technical_indicators.atr.retrieve.v1.7aca3c4a` | ATR Technical Indicator | `unverified` | Function fixed to ATR, `symbol!`, same intraday/daily interval family, `time_period!` |
| Financial Modeling Prep (Market Data) | `financialmodelingprep.stable.historicalchart.15min.retrieve.v1.8228aa32` | 15 Min Interval Stock Chart | `failed` (schema check failed; other evidence checks missing) | `symbol!`, `from`, `to`, `nonadjusted` |
| Financial Modeling Prep (Market Data) | `financialmodelingprep.stable.historicalchart.30min.retrieve.v1.1ff3708a` | 30 Min Interval Stock Chart | `failed` (schema check failed; other evidence checks missing) | `symbol!`, `from`, `to`, `nonadjusted` |
| Binance | `binance.klines.query.v1.4454d6b8` | Get Klines (Candlestick Bars) | `unverified` | `symbol!`, interval = 1/3/5/15/30 minutes, 1/2/4/6/8/12 hours, day/3-day/week/month; start/end time, limit |
| Binance | `binance.ticker_24hr.query.v1.e90dd34e` | Get 24hr Ticker Price Change Statistics | `unverified` | `symbol` or `symbols`, response type |
| Binance | `binance.ticker.price.list.v3.8675eca0` | Get Live Ticker Price | `unverified` | `symbol` or `symbols` |
| Bybit P2P API (Crypto P2P) | `bybitp2p.market.orderbook.retrieve.v5.9900f38c` | Get Order Book (Depth) | `unverified` | category = spot/linear/inverse/option, `symbol!`, limit |
| Bybit P2P API (Crypto P2P) | `bybitp2p.market.rpi_orderbook.retrieve.v5.f91e384f` | RPI Orderbook Retrieve | `unverified` | category = spot/linear/inverse, `symbol!`, `limit!` |
| **Onchain DEX API (Demo)** | `coingecko.coins.marketchart.retrieve.v3.ceee2841` | Coin Historical Chart Data by ID | `unverified` | `id!`, `vs_currency!`, `days!`, interval = 5m/hourly/daily |
| **Onchain DEX API (Demo)** | `coingecko.coins.marketchart.range.retrieve.v3.08904542` | Coin Historical Chart Data within Time Range by ID | `unverified` | `id!`, `vs_currency!`, `from!`, `to!`, interval = 5m/hourly/daily |
| **Onchain DEX API (Demo)** | `coingecko.coins.history.retrieve.v3.12f1f333` | Coin Historical Data by ID | `unverified` | `id!`, `date!`, localization |

The three `coingecko.*` IDs were returned with provider identity **“Onchain DEX API (Demo)”**, not “CoinGecko”; this identity mismatch is unresolved. The Bybit records are attributed to “Bybit P2P API (Crypto P2P)”; their catalog names and inputs do not establish that they provide production exchange order-book depth.

Finnhub search results in the inspected public catalog pages included news, earnings, profiles, and recommendation-related tools, but no directly relevant quote or OHLCV tool was identified in those results. This is not proof that no such capability exists elsewhere in the catalog.

## Probe results and evidence

**No Probe was attempted**, so there are no successful or failed Probe results. The REST documentation states that `POST /tools/probe` is free, validates parameters, returns a pre-call quote, and does not execute the provider operation. The same documentation restricts public-readonly mode to Discover and Inspect; Probe requires authenticated access. Because the key was unavailable, an authenticated Probe was not available.

**No Call, Execute, subscription, brokerage action, or paid operation was performed.** No provider output was fabricated or represented as a successful test.

## Capability comparison

| Capability | Catalog evidence | Audit conclusion |
|---|---|---|
| Real-time stock quotes | QVeris Finance Level 1 quote and delayed EODHD quote descriptions; Twelve Data Quote schema | Descriptions only. No live quote, freshness, exchange coverage, or successful operation verified. |
| Real-time crypto quotes | Binance ticker-price and 24-hour ticker descriptions | No current price was retrieved; supported symbols, exchange scope, freshness, and rights remain unverified. |
| Historical stock OHLCV | QVeris Finance intraday/adjusted bars, Twelve Data time series, EODHD EOD, Alpha Vantage daily, FMP 15/30-minute charts | Several schemas name intervals/date inputs, but no output schema, live result, maximum history, or coverage guarantee was returned. QVeris intraday and both FMP interval records failed verification. |
| Historical crypto OHLCV | Binance Klines and Coin chart records | Binance Klines declares intervals, including 1/5/15-minute bars. Coin chart records declare 5-minute/hourly/daily intervals, but their provider identity is “Onchain DEX API (Demo).” No candle data or historical depth was verified. |
| One-, five-, and fifteen-minute candles | Present in input enums for several candidates, including QVeris Finance intraday, Twelve Data, Alpha Vantage indicators, and Binance Klines | Enum presence is not operational support. No Probe or data request confirmed these intervals. |
| Long history / YTD | Some records accept date ranges or output size | No documented maximum lookback, YTD coverage, pagination behavior, data retention, or completeness evidence in returned records. |
| Streaming / WebSocket | Short `streaming`/`WebSocket` catalog searches did not surface a relevant market-data tool in their returned first pages | No streaming endpoint, protocol, subscription schema, or update cadence verified. |
| Bid/ask / Level 1 | QVeris Finance Level 1 and delayed-quote descriptions; Binance price tools | No response schema or live bid/ask values. No spread freshness evidence. |
| Order-book depth / Level 2 | Two Bybit P2P-attributed order-book descriptions | Depth, market scope, levels, timestamps, commercial rights, and actual exchange applicability are unverified. |
| RSI, MACD, EMA, SMA, ATR | Twelve Data, EODHD, Alpha Vantage, and QVeris Finance indicator names/inputs | Catalog metadata identifies indicator functions/parameters only; no computed results or output contract. |
| Buy/sell execution, cancel, orders, balances, positions | No inspected candidate established brokerage operations | Not established. QVeris routing/catalog presence cannot be treated as brokerage authorization or execution capability. |

Across all 28 inspected records, the catalog’s `verification` evidence was incomplete: only the five marked `failed` reported a schema check failure; for the `unverified` records, schema and the other required verification checks were missing. Authentication, provider identity, permissions, freshness, and live-check evidence were missing across the inspected set. All records had `callable: false`.

## Pricing, limits, licensing, and geographic eligibility

- **QVeris operation pricing:** The official REST documentation says Discover and Inspect are free; Probe is free and non-executing; Call may consume credits under the selected tool’s billing rule. No paid Call was made.
- **Provider/API pricing:** `expected_cost` and `billing_rule` were null in all inspected public records. The public-readonly documentation says this projection omits private pricing details. Provider prices, free tiers, quote/call costs, and estimated usage costs are therefore **not verified**.
- **Rate limits:** The official REST documentation states public Discover and Inspect share a 30-requests-per-minute budget keyed to observed client IP; shared egress may share the bucket. No provider-specific data API rate limits were disclosed in the inspected records.
- **Licensing / redistribution:** `execution_restrictions.license` and `commercial_use` were `unknown` for all 28 records. Display, redistribution, derived-data, and exchange-specific rights are **not verified**.
- **Geography / Nigeria:** `region_status` was `unknown`, with empty allow/deny lists in the inspected metadata. No Nigeria eligibility or restriction was verified.
- **Freshness / timestamps:** `freshness` was `unknown` for all candidates. Because return schemas were absent, timestamp format, timezone, market-time semantics, and update frequency could not be assessed.
- **Usage restrictions:** The candidate-specific restrictions did not disclose usable provider terms. Public-readonly access itself explicitly cannot perform Probe or Call.

## Comparison with Aurevia’s existing architecture

The existing application already uses multiple data paths; this audit made no changes:

- [`lib/live-market.ts`](../../Aurevia-Exchange-main/aurevia/lib/live-market.ts) provides normalized quote/candle structures and the supported chart timeframe mapping. The stock quote path selects configured Alpaca market data first, then Finnhub, with internal fallback; crypto can use Alpaca crypto data. Stock history uses Alpaca and Finnhub with internal history fallback.
- [`lib/providers/finnhub-market-data.ts`](../../Aurevia-Exchange-main/aurevia/lib/providers/finnhub-market-data.ts) implements Finnhub quote and candle requests. Its candle-resolution map includes 1-, 5-, 15-, and 30-minute, hourly, daily, weekly, and monthly resolutions.
- [`lib/providers/alpaca-stock-market-data.ts`](../../Aurevia-Exchange-main/aurevia/lib/providers/alpaca-stock-market-data.ts) and [`lib/providers/alpaca-crypto.market-data.ts`](../../Aurevia-Exchange-main/aurevia/lib/providers/alpaca-crypto.market-data.ts) implement Alpaca stock and crypto market data.
- [`lib/market-data/provider-manager.ts`](../../Aurevia-Exchange-main/aurevia/lib/market-data/provider-manager.ts) contains optional FMP, Twelve Data, and Alpha Vantage adapters, caching/pacing, and a production license-confirmation gate. This is existing application functionality, not evidence that QVeris exposes the same provider accounts or rights.
- [`app/api/orderbook/route.ts`](../../Aurevia-Exchange-main/aurevia/app/api/orderbook/route.ts) returns REAL-mode top-of-book quote fields and explicitly sets `depthAvailable: false`; DEMO mode constructs a simulated book.
- [`app/api/orders/route.ts`](../../Aurevia-Exchange-main/aurevia/app/api/orders/route.ts) routes the REAL account mode through `submitAlpacaPaperOrder` and DEMO through the internal `placeOrder` path. [`lib/alpaca-paper-orders.ts`](../../Aurevia-Exchange-main/aurevia/lib/alpaca-paper-orders.ts) reconciles confirmed paper-order fills against Aurevia’s internal ledger and positions. This is not evidence of live-money brokerage execution. No QVeris candidate reviewed here demonstrates brokerage account access, live orders, cancellation, execution reports, balances, or positions.

Consequently, QVeris has not been shown to replace even a verified subset of Aurevia’s live market-data path, and it cannot be considered a replacement for Alpaca paper execution. Keep all existing integrations and REAL/DEMO separation unchanged.

## Missing information and risks

1. Authenticated, account-specific Discover/Inspect results and any permission, entitlement, or account-level restriction.
2. Safe Probe results for candidate symbol/exchange/interval combinations and the current cost quote; no Probe was available.
3. Actual provider identity, operational status, output schema, error behavior, and sample result for each candidate.
4. Freshness, timestamps/timezone, exchange coverage, instrument mapping, historical retention, pagination, and adjustment semantics.
5. Provider and QVeris costs, rate limits, quotas, commercial display/redistribution terms, and Nigeria eligibility.
6. Streaming support and market-depth scope.
7. Brokerage capabilities and regulatory authorization. No reviewed evidence supports treating QVeris as a broker.
8. The `coingecko.*` versus “Onchain DEX API (Demo)” identity mismatch and the Bybit P2P identity/scope need resolution.

## Recommendation and next steps

**Recommendation: limited trial, restricted to a separately authorized, non-production, read-only evaluation; no production adoption now.** This is a recommendation to gather evidence, not a finding that any candidate is available, suitable, or free to use.

1. Have the operator securely expose `QVERIS_API_KEY` to the agent process through an approved secret manager/environment mechanism; do not send the key in chat or commit it.
2. Re-run authenticated Discover and Inspect for a narrowed candidate set. Confirm exact provider identity, callable/blocked actions, account permissions, and complete request/response contracts.
3. Use Probe only for explicitly selected market-data requests after confirming the official documentation and current quote; Probe must remain non-executing and zero-cost. Do not use Call without explicit budget approval.
4. Obtain written provider terms covering commercial display/redistribution, data retention, geography (including Nigeria), supported exchanges, licensing fees, and rate limits.
5. If authorized, validate a non-production read-only sample across stock and crypto quote, 1/5/15-minute candles, YTD history, indicator outputs, timestamps, and failure cases. Record observed freshness and cost before considering an adapter.
6. Treat streaming and order-book coverage as unsupported until a current, documented endpoint and test evidence exist.
7. Keep brokerage/execution evaluation separate. Do not route orders, alter wallet/ledger logic, or describe trades as live unless an independently authorized brokerage integration proves execution, cancellation, fills, and reconciliation.
8. Only after evidence and licensing review, implement an isolated server-side market-data adapter with normalized responses, bounded caching/rate limits, observability, and a safe fallback. Do not remove Alpaca/Finnhub or change account-mode behavior based on catalog metadata alone.

## Final verification

- Authentication: **No** — the key was unavailable in the agent process; no authenticated request was made.
- Distinct candidates discovered and inspected: **28**.
- Safe Probes: **0 attempted; none succeeded or failed**. Official docs describe Probe as zero-cost and non-executing, but it is unavailable in public-readonly mode and authenticated access was unavailable.
- Paid operation performed: **NO**.
- Production or application changes made: **NO**.
- Database, environment configuration, wallet/ledger, user accounts, and existing provider configuration changed: **NO**.
- Report: `docs/research/QVERIS-MARKET-DATA-AUDIT.md`.
- Recommendation: **limited non-production, read-only evaluation only; do not adopt in production or replace any existing provider on current evidence.**

## Follow-up: Codespaces environment visibility (2026-11-09)

### Verified workspace and environment findings

- The Codespace repository is `Aurevia50/Aurevia`, checked out at `/workspaces/Aurevia` on branch `main`.
- The current agent/tool working directory is `/workspaces/Aurevia`. The Aurevia Next.js application root is the nested `/workspaces/Aurevia/Aurevia-Exchange-main/aurevia`.
- The app-root `.env` file exists and has a `QVERIS_API_KEY` assignment. Its value was not read or displayed. Git confirms this `.env` is ignored.
- The current terminal/tool process and a child Node process both reported the variable absent. No QVeris credential was available to the agent process.
- Aurevia’s [`server.ts`](../../Aurevia-Exchange-main/aurevia/server.ts) calls `loadEnvConfig(process.cwd())` before starting Next.js. Running the same Next environment loader from the app root confirmed the variable becomes present in that process; only presence was reported, not its value. This confirms the local app runtime can load the app-root `.env` when started with the app directory as its working directory.
- No running Node/Next process with the app root as its working directory was found, so there was no live application process environment to inspect.
- `gh secret list` could not inspect configured Codespaces secret names because GitHub CLI is not authenticated in this environment. No Codespaces secret was added, edited, or overwritten.
- No authenticated QVeris Discover, Inspect, or Probe was performed. No paid operation was performed, and no application, production, database, or secret configuration was changed.

### Cause

The `.env` entry is app-local configuration, not a global Codespace or agent environment variable. The agent starts at the repository root, and environment values in an app-root `.env` do not become inherited variables in an already-running parent shell or agent process. The Aurevia custom server loads the file because it explicitly invokes Next’s env loader using its current working directory. Starting a new Node child from the repo root alone does not load the nested app `.env`.

### Exact correction

- **To run Aurevia with its existing local app configuration:** start it from the app root, e.g. `cd /workspaces/Aurevia/Aurevia-Exchange-main/aurevia && npm run dev`. The server loads that directory’s `.env` at startup. This affects the app process only; it does not make the key available to the already-running agent shell.
- **To make the variable available to future Codespace/agent processes:** use an approved Codespaces secret/environment manager to expose the name `QVERIS_API_KEY` to this repository’s Codespace. First check whether that secret name already exists and has access to `Aurevia50/Aurevia`; the secret list could not be checked here. Do not create a duplicate, replace, rotate, or overwrite an existing secret, and do not copy its value into chat, commands, source, or this report. After a change made by an authorized operator, stop and restart the Codespace, then start a fresh terminal/agent process and verify only whether the variable is present. GitHub’s [Codespaces secrets documentation](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces) states that secrets are made available when a Codespace is created or restarted.

Authenticated QVeris work remains blocked until the agent has an authorized, safely provisioned credential. Once provisioned, use the official REST docs cited above; Probe is documented as free and non-executing but is not available in public-readonly mode. No Call should be made without explicit cost approval.
