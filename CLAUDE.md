# WIND FORECASTING LLM PROJECT - COMPLETE CONTEXT

## PROJECT GOAL
Build an LLM-based wind forecasting system for ocean sports enthusiasts at location AGXC1 (near Los Angeles). The system predicts wind speed (WSPD) and gusts (GST) for the next 5 days using NWS coastal forecasts.

## CONCEPT OF OPERATION (PRODUCTION - LIVE)

The system automatically generates LLM wind forecasts whenever NWS publishes a new coastal waters forecast. NWS typically issues forecasts 3-4 times daily (~4 AM, ~10 AM, ~4 PM, ~10 PM PST).

### Forecast Generation Triggers

**1. Scheduled Cron Job (Primary)**
- Runs daily at **9:00 AM PST** (17:00 UTC)
- Compares NWS issuance time with cached forecast; generates new LLM forecast only if NWS is newer

**2. User Page Load (On-Demand)**
- Checks for new NWS data on page load
- If `allowOnDemandGeneration: true` AND NWS has a newer forecast → generates and caches new LLM forecast
- Rate limited to 6 LLM calls/day to control costs

### Data Flow

```
NWS Forecast (weather.gov)
        ↓
Is NWS newer than cached? ──No──→ Return cached forecast
        │Yes
        ↓
[Generate LLM Forecast]
- Load few-shot examples (15 examples, month/time-specific)
- Extract inner waters forecast text
- Call Claude Sonnet 4 API
        ↓
[Store to Vercel Postgres (Neon)] → Return predictions to UI
```

### Cache Behavior
- **Cache Key**: NWS forecast issuance timestamp (minute precision)
- **Storage**: Vercel Postgres (persistent across deployments)
- **Deduplication**: SHA256 hash prevents storing duplicate forecasts

---

## KEY DESIGN DECISIONS

### 1. Why LLM?
Forecast data is TEXT — LLMs read it directly with no feature engineering. Few-shot learning captures implicit relationships (e.g., "Small Craft Advisory" → stronger winds).

### 2. Time Window: 11 AM – 6 PM PST
Most relevant for ocean sports; peak thermal wind development period.

### 3. Wind Data Aggregation
- **WSPD**: Simple average of 6-minute measurements during window
- **GST**: MAXIMUM value during window (sailors care about peak gust, not average)

### 4. Output Format (JSON)
```json
{
  "predictions": {
    "today": {
      "hourly": [{"hour": "11:00", "wspd_kt": 12, "gst_kt": 16}, ...],
      "summary": {"avg_wspd": 13.5, "max_gst": 18}
    },
    "tomorrow": {...}
  }
}
```
5-day horizon (D+0 through D+4), single LLM call for all days.

---

## LLM MODEL CONFIGURATION

All parameters are in `web-ui/config/model_config.json` (single source of truth for all components):

```json
{
  "model": "claude-sonnet-4-20250514",
  "temperature": 1.0,
  "top_p": 1.0,
  "max_tokens": { "forecast": 2500, "validation": 2000 },
  "maxDailyLlmCalls": 6,
  "enableRateLimit": true,
  "allowOnDemandGeneration": true,
  "allowLocalLlmCalls": false,
  "skipDatabaseInDevelopment": true,
  "convertForecastDaysToRelative": false,
  "includeGeographicContext": true
}
```

Edit this file to change any parameter — no code changes needed. All three components use it: `/api/llm-forecast`, `/api/validation-variance`, and `scripts/analysis/variance_test.py`.

**Temperature override for testing:**
- CLI: `python3 scripts/analysis/variance_test.py 5 0.0`
- API: `/api/python-variance-test?temperature=0.0`

### Prompt Configuration
Prompt text is in `config/prompt_config.json`, including the `geographicContext` field (helps LLM interpret sub-area mentions like "Malibu to Santa Monica"). Edit without code changes. Disable with `includeGeographicContext: false`.

---

## PRODUCTION ARCHITECTURE

### API Endpoints

**`/api/llm-forecast`** — Main forecast endpoint
- `force=true`: Force regeneration (requires admin key)
- `cron=true`: Cron-triggered, bypasses on-demand restrictions
- `test=true`: Returns diagnostic info

**`/api/cron/generate-forecast`** — Called by Vercel Cron at 9 AM PST; authenticates via `CRON_SECRET`

### Database Schema (Vercel Postgres — `forecasts` table)

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `forecast_hash` | TEXT | SHA256(nws_issued_at + forecast_text) |
| `nws_issued_at` | TIMESTAMP | When NWS issued the forecast |
| `llm_generated_at` | TIMESTAMP | When LLM generated predictions |
| `nws_forecast_text` | TEXT | Raw NWS inner waters forecast |
| `llm_prompt` | TEXT | Full prompt sent to Claude |
| `predictions` | JSONB | `{ day_0: [...], day_1: [...], ... }` |
| `model` | TEXT | Model identifier |
| `temperature` | FLOAT | Temperature used |
| `top_p` | FLOAT | Top-p used |
| `max_tokens` | INT | Max tokens used |
| `source` | TEXT | Origin tag |
| `stored_at` | TIMESTAMP | When stored |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `DATABASE_URL` | Vercel Postgres connection (pooled) |
| `CRON_SECRET` | Cron job authentication |
| `ADMIN_SECRET` | Force-refresh authentication |

### Rate Limiting & Source Tags

Rate limit counts only `source='fresh_llm'` records; resets midnight PST. Override: `enableRateLimit: false` or `maxDailyLlmCalls: -1`.

| Source | Meaning |
|--------|---------|
| `fresh_llm` | Newly generated by LLM |
| `db_current` | Cached (NWS unchanged) |
| `db_cron_only` | Cached (on-demand disabled) |
| `db_nws_failed` | Cached (NWS fetch failed) |
| `db_extraction_failed` | Cached (NWS parse failed) |
| `db_rate_limited` | Cached (rate limit hit) |

### Cron Schedule (UTC — vercel.json)

| Job | UTC | PST | Purpose |
|-----|-----|-----|---------|
| `store-wind-actuals` | 10:00 | 2:00 AM | Store previous day's actuals |
| `generate-forecast` | 17:00 | 9:00 AM | Generate LLM forecast |

---

## TECHNICAL DETAILS

### Data Files

**Forecasts:** `data/raw/forecasts/`
- `coastal_waters_2019_2025.txt` (92 MB)
- `area_forecast.txt` (74 MB, displayed in UI but not used in LLM prompt)

**Wind (AGXC1):** `data/raw/wind/`
- Training (2016-2024): `2016.txt` through `2024.txt`
- Testing (2025, reserved): `2025.txt`

**Cleaned:** `data/cleaned/wind_YYYY_processed.txt`, `inner_waters_forecasts_relative_periods.txt`

### Units & Format

- **Time**: PST ISO 8601 (`YYYY-MM-DDTHH:MM:SS-08:00`)
- **Wind**: m/s → knots (1 m/s = 1.9 kt); WSPD 1 decimal, GST 1 decimal
- **WDIR**: integer degrees; **PRES**: 1 decimal hPa; **ATMP**: 1 decimal °C
- **Invalid sentinels**: WSPD/GST ≥ 99.0, temp ≥ 999.0 (but WDIR=99° is valid)

### Timestamp Utilities (`web-ui/src/lib/timezone-utils.ts`)

Always use these — never hardcode -8/-7 offsets:

| Function | Purpose |
|----------|---------|
| `getPacificISOString(date)` | ISO string with Pacific offset |
| `formatPacificDateTime(date)` | Human-readable PST/PDT |
| `getPacificDateString(date)` | YYYY-MM-DD in Pacific |
| `getPacificDateHour(date)` | Date+hour for forecast comparisons |
| `getPacificYesterday()` | Yesterday DST-safe |

---

## DEPLOYMENT ENVIRONMENT CONSTRAINTS

### Vercel Project (DO NOT create new projects — already configured)

| Setting | Value |
|---------|-------|
| Project Name | `wind-la` |
| Project ID | `prj_qRAoBWtOhrBYd1UQkw9gLDK3MyhO` |
| Team/Org ID | `team_0TSkl9HjWTYubgs7dM1tC54t` |
| GitHub Repo | `davidelasi/wind-llm` |
| Root Directory | `web-ui` |
| Production Branch | `main` (auto-deploys on push) |

**Deploy by pushing to `main`** — do not use `vercel --prod` or `vercel link`.

### Critical: Read-Only Filesystem

Vercel serverless has a **read-only filesystem** except `/tmp` (ephemeral, cleared between invocations).

**Rules:**
- ✅ Use `/tmp` for any file writes in production
- ✅ Bundle static files in `web-ui/` directory
- ✅ Use paths relative to `process.cwd()` (no `../`)
- ✅ Use external DB/storage for persistent data
- ❌ Do not write to project directories
- ❌ Do not reference parent directories (`../config`)

**Serverless detection:**
```typescript
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const cachePath = isServerless ? path.join('/tmp', '.cache') : path.join(process.cwd(), '.cache');
```

Always wrap file I/O in try/catch — even `/tmp` can fail. Log and continue.

### Other Vercel Constraints
- Execution: 60s max (Pro plan)
- Memory: 1024 MB default
- Bundle: < 50 MB uncompressed
- Cold starts: don't rely on in-memory state between requests

### Local Development: No Database

All database calls are **automatically skipped** locally (`skipDatabaseInDevelopment: true`). Returns empty arrays/null. Rate limit count returns 0 (allows LLM testing). No local PostgreSQL needed.

**Pattern for all DB functions:**
```typescript
import { shouldSkipDatabase, logDatabaseSkipped } from '@/lib/db/db-utils';

export async function getForecasts() {
  if (shouldSkipDatabase()) { logDatabaseSkipped('getForecasts'); return []; }
  // ... actual query
}
```

### Pre-Deploy Checklist
- [ ] No filesystem writes outside `/tmp`
- [ ] All required files bundled in `web-ui/`
- [ ] No `../` path references
- [ ] Graceful error handling for all I/O
- [ ] Serverless environment detection in place
- [ ] Tested with `NODE_ENV=production` locally

---

## PROJECT STRUCTURE

```
wind-llm/
├── config/               # Source config (copied to web-ui/config/ for deploy)
│   ├── model_config.json
│   └── prompt_config.json
├── data/
│   ├── raw/forecasts/    # Raw NWS forecast data
│   ├── raw/wind/         # Raw NOAA buoy measurements (2016-2025)
│   ├── cleaned/          # Processed data
│   └── training/few_shot_examples_json/  # 48 curated JSON files (source)
├── scripts/
│   ├── processing/       # Core data pipeline
│   ├── training/         # Few-shot example generation
│   ├── analysis/         # Variance tests, diagnostics
│   ├── utilities/        # Batch operations
│   └── archive/          # Legacy scripts (reference only)
├── web-ui/               # Next.js app (Vercel root directory)
│   ├── config/           # model_config.json, prompt_config.json (bundled)
│   ├── data/training/    # few_shot_examples/*.json (48 files, bundled)
│   └── src/app/
│       └── _trash/debug/ # Removed debug page (kept for reference)
└── logs/                 # Prompt and execution logs
```

---

## SCRIPTS INVENTORY

**⚠️ ALL new scripts go in a subfolder — never in `/scripts/` root. Use full paths when referencing.**

### processing/ — Core Data Pipeline
- `process_wind_data.py` — GMT→PST, filter columns, remove sentinels, aggregate hourly (10AM-7PM)
- `process_forecast_data.py` — Parse/clean NWS forecasts, convert day-of-week to relative format
- Supporting: `convert_timestamps.py`, `filter_wind_columns.py`, `filter_inner_waters.py`, etc.

### training/ — Few-Shot Example Generation
- `generate_training_data.py` — Combine forecasts + actuals into JSON training format
- `curate_few_shot_examples.py` — 48 monthly files (12 months × 4 forecast numbers, 15 examples each; 4 calm / 8 moderate / 3 strong)
- `identify_complete_days.py` — Find days with complete 10AM-7PM wind data

### analysis/ — Diagnostics & Testing
- `variance_test.py` — LLM prediction variance (supports temperature override via CLI arg)
- `validate_processed_data.py`, `analyze_specific_forecast.py`, `diagnose_*.py`

### utilities/
- `batch_process_wind_data.py` — Process multiple years in batch

### archive/ — Legacy (reference only)
- `correct_prediction_test.py` — Validated accuracy baseline (1.0kt WSPD, 1.4kt GST error)
- `test_2025_forecast.py`, `batch_test_2025.py`

---

## DATA PROCESSING PRINCIPLES

**Always use scripts for bulk processing — never feed large files to the LLM directly.**

### Hourly Aggregation Rules
- **Window**: 10 AM – 7 PM PST only
- **WSPD**: Mean of all valid 6-minute measurements per hour
- **GST**: MAXIMUM per hour (not average)
- **WDIR/PRES/ATMP**: Mean
- **Assignment**: Values assigned to hour start (e.g., 15:00 = 15:00–16:00 window)

### Invalid Data
- Sentinels: ~99, ~999, ~9999 (±0.01 tolerance); WDIR=99° IS valid
- **Essential** (WDIR, WSPD, GST): skip entire hour record if missing/invalid
- **Non-essential** (PRES, ATMP): use `null`, preserve record

### Quality Stats (Training 2016-2024)
- 2,872 total days → 2,690 complete wind-data days (93.7%)
- 25,288 validated hourly measurements

---

## FEW-SHOT PREDICTION METHODOLOGY

### Data Sources
1. **Forecast**: `data/cleaned/inner_waters_forecasts_relative_periods.txt` — use morning issuance (~8AM), "Issued:" timestamps, D0_DAY/D0_NIGHT format
2. **Examples**: Month + forecast-number specific file (e.g., `jul_fc2_examples.json`) — use ALL 15 examples, no cherry-picking
3. **Actuals**: `data/cleaned/wind_YYYY_processed.txt` — space-separated: `DATETIME_PST WDIR WSPD GST PRES ATMP`

### Accuracy Baseline
- WSPD error: ~1.0–1.54 kt average
- GST error: ~1.4–2.02 kt average

### Reference Implementation
`scripts/archive/correct_prediction_test.py` — functions: `find_forecast_for_date()`, `load_all_examples()`, `load_processed_wind_data()`, `create_comprehensive_prompt()`
