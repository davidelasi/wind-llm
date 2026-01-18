# WIND FORECASTING LLM PROJECT - COMPLETE CONTEXT

## PROJECT GOAL
Build an LLM-based wind forecasting system for ocean sports enthusiasts at location AGXC1 (near Los Angeles). The system predicts wind speed (WSPD) and gusts (GST) for the next 5 days using NWS coastal forecasts.

## CONCEPT OF OPERATION (PRODUCTION - LIVE)

The system automatically generates LLM wind forecasts whenever NWS publishes a new coastal waters forecast. NWS typically issues forecasts 3-4 times daily (~4 AM, ~10 AM, ~4 PM, ~10 PM PST).

### Forecast Generation Triggers

**1. Scheduled Cron Job (Primary)**
- Runs daily at **9:00 AM PST** (17:00 UTC)
- Fetches latest NWS coastal waters forecast from weather.gov
- Compares NWS issuance time with cached forecast
- If NWS forecast is newer → generates new LLM forecast → stores to database
- If NWS forecast is same/older → returns cached forecast (no LLM call)

**2. User Page Load (On-Demand)**
- When a user loads the home page, the system checks for new NWS data
- If `allowOnDemandGeneration: true` (current setting) AND NWS has a newer forecast:
  - Generates new LLM forecast
  - Stores to Vercel Postgres database
  - Returns fresh predictions
- If NWS forecast unchanged → returns cached forecast from database
- Rate limited to prevent excessive API costs (default: 6 LLM calls/day)

### Data Flow

```
NWS Forecast (weather.gov)
        ↓
   [Fetch & Compare]
        ↓
Is NWS newer than cached? ──No──→ Return cached forecast
        │
       Yes
        ↓
   [Generate LLM Forecast]
   - Load few-shot examples (15 examples, month/time-specific)
   - Extract inner waters forecast text
   - Call Claude Sonnet 4 API
        ↓
   [Store to Database]
   - Vercel Postgres (Neon)
   - Keyed by NWS issuance time
   - Includes full prompt for debugging
        ↓
   Return predictions to UI
```

### Cache Behavior

- **Cache Key**: NWS forecast issuance timestamp (minute precision)
- **Cache Duration**: Until NWS publishes a new forecast
- **Storage**: Vercel Postgres database (persistent across deployments)
- **Deduplication**: SHA256 hash prevents storing duplicate forecasts

---

## KEY DESIGN DECISIONS MADE

### 1. Why LLM Instead of Traditional ML?
**User's insight:** Forecast data is TEXT. Why extract features when LLMs can read text directly?
**Decision:** Use LLM approach with few-shot learning
- Let LLM find patterns in unstructured forecast text
- No manual feature engineering
- LLM learns implicit relationships (e.g., "Small Craft Advisory" → stronger winds)

### 2. Time Window: Peak Hours Only
**Decision:** Use 11 AM - 6 PM PST as standard window, because this time frame is both the most relevant for ocean sports and the time where typical wind patterns develop

### 3. Wind Data Aggregation
- **WSPD (average wind):** Simple average of all 6-minute measurements during 11 AM-6 PM
- **GST (gusts):** MAXIMUM value during 11 AM-6 PM (not average)
**Rationale:** Sailors care about peak gust, not average gust



### 7. Output Format
LLM returns structured predictions (JSON):

**A. Structured predictions (JSON):**
```json
{
  "predictions": {
    "today": {
      "hourly": [{"hour": "11:00", "wspd_kt": 12, "gst_kt": 16}, ...],
      "summary": {"avg_wspd": 13.5, "max_gst": 18}
    },
    "tomorrow": {...},
    "day_after": {...}
  }
}
```

Human-readable summaries are planned but not implemented in production.

### 8. Scope Decisions
**MVP includes:**
- ✅ Coastal Waters Forecast and Area Forecast text (Area Forecast displayed in UI)
- ✅ WSPD + GST predictions (not direction yet)
- ✅ 5-day horizon (D+0 through D+4)
- ✅ Single LLM call → all 5 days at once
- ✅ Few-shot learning (10-15 examples)
- ✅ Claude Sonnet 4

**Future enhancements:**
- Area Forecast deeper integration (beyond display)
- Wind direction modeling
- El Niño/La Niña indicators
- Fine-tuning vs few-shot

---

## LLM MODEL CONFIGURATION

### Central Configuration File
All LLM model parameters are controlled by a single configuration file: `config/model_config.json`

**Configuration Structure:**
```json
{
  "model": "claude-sonnet-4-20250514",
  "temperature": 1.0,
  "top_p": 1.0,
  "max_tokens": {
    "forecast": 2500,
    "validation": 2000
  }
}
```

### Parameter Definitions

**temperature** (Default: 1.0)
- **Range**: 0.0 to 1.0
- **Purpose**: Controls randomness/creativity in model responses
- **Effect**:
  - `1.0` = Maximum diversity, natural variance (default)
  - `0.5` = Balanced determinism and creativity
  - `0.0` = Near-deterministic, consistent outputs
- **Use Case**: Higher values allow model to express forecast uncertainty naturally

**top_p** (Default: 1.0)
- **Range**: 0.0 to 1.0
- **Purpose**: Nucleus sampling constraint
- **Effect**:
  - `1.0` = No constraint, consider all tokens (default)
  - `0.95` = Consider tokens in top 95% probability mass
  - Lower values = More constrained, deterministic vocabulary
- **Use Case**: Combine with low temperature for controlled determinism

**model** (Default: "claude-sonnet-4-20250514")
- Claude Sonnet 4 model identifier
- All forecast components use the same model for consistency

**max_tokens**
- `forecast`: 2500 tokens (5-day forecast with detailed output)
- `validation`: 2000 tokens (single-day validation tests)

### Consistency Across Components

**ALL three forecasting components use the same configuration:**
1. **Production LLM Forecast API** (`/api/llm-forecast`)
2. **Production Validation API** (`/api/validation-variance`)
3. **Python Variance Test Script** (`scripts/analysis/variance_test.py`)

This ensures:
- Consistent behavior across production and testing
- Fair apple-to-apple comparisons
- Reproducible results
- Single source of truth for model parameters

### Modifying Configuration

**To change model parameters:**
1. Edit `config/model_config.json`
2. All components automatically use new values on next run
3. No code changes required

**To test different temperatures:**
- Python script supports temperature override: `python3 scripts/analysis/variance_test.py 5 0.0`
- API endpoint supports temperature parameter: `/api/python-variance-test?temperature=0.0`
- Results are cached separately per temperature value

### Prompt Configuration

Prompt text blurbs are stored in a separate configuration file for easy tuning: `config/prompt_config.json`

**Key settings in model_config.json:**
- `convertForecastDaysToRelative`: If false (default), keeps original weekday names and tells LLM the day mapping via prompt instruction
- `includeGeographicContext`: If true (default), includes geographic context to help LLM interpret sub-area mentions

**Geographic Context Feature:**
NWS forecasts sometimes mention sub-areas (e.g., "Malibu to Santa Monica" vs "Otherwise"). The geographic context helps the LLM understand which conditions apply to the AGXC1 station location.

The geographic context text is stored in `config/prompt_config.json` and can be edited without code changes:
```json
{
  "geographicContext": "=== GEOGRAPHIC CONTEXT ===\nThe forecast target is AGXC1 station..."
}
```

**To tune the geographic context:**
1. Edit `config/prompt_config.json`
2. Modify the `geographicContext` field
3. Changes take effect on next forecast generation

**To disable geographic context (for A/B testing):**
1. Set `includeGeographicContext: false` in `config/model_config.json`

### Variance Testing

**Natural Variance Baseline (temperature=1.0):**
- WSPD Error: 1.54 ± 0.19kt
- GST Error: 2.02 ± 0.16kt
- Represents natural LLM uncertainty expression

**Deterministic Mode (temperature=0.0):**
- Significantly reduced variance (expected ~80-90% reduction)
- Consistent predictions for same inputs
- May lose nuanced uncertainty expression

**Trade-offs:**
- **High temperature (1.0)**: Natural variance, expresses uncertainty, more human-like
- **Low temperature (0.0)**: Deterministic, consistent, reliable for automation
- **Current choice**: Default 1.0 for all components (consistent baseline)

---

## PRODUCTION ARCHITECTURE

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VERCEL DEPLOYMENT                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐  │
│  │  Home Page  │────→│ /api/llm-forecast │────→│ Vercel Postgres │  │
│  │  (Next.js)  │←────│                  │←────│     (Neon)      │  │
│  └─────────────┘     └──────────────────┘     └─────────────────┘  │
│         ↑                     │                                     │
│         │                     ↓                                     │
│  ┌─────────────┐     ┌──────────────────┐                          │
│  │ Vercel Cron │     │   Claude API     │                          │
│  │  (9 AM PST) │     │  (Sonnet 4)      │                          │
│  └─────────────┘     └──────────────────┘                          │
│                               │                                     │
│                               ↓                                     │
│                      ┌──────────────────┐                          │
│                      │   weather.gov    │                          │
│                      │  (NWS Forecast)  │                          │
│                      └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

### API Endpoints

**`/api/llm-forecast`** - Main forecast endpoint
- **GET**: Returns current forecast (from cache or freshly generated)
- **Query params**:
  - `force=true`: Force regeneration even if cache is current (requires admin key)
  - `cron=true`: Indicates cron-triggered request (bypasses on-demand restrictions)
  - `test=true`: Returns diagnostic information

**`/api/cron/generate-forecast`** - Cron trigger endpoint
- Called by Vercel Cron at 9 AM PST daily
- Authenticates via `CRON_SECRET` Bearer token
- Calls `/api/llm-forecast?force=true&cron=true`

### Database Schema (Vercel Postgres)

**Table: `forecasts`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `forecast_hash` | TEXT | SHA256(nws_issued_at + forecast_text) - unique |
| `nws_issued_at` | TIMESTAMP | When NWS issued the forecast |
| `llm_generated_at` | TIMESTAMP | When LLM generated predictions |
| `nws_forecast_text` | TEXT | Raw NWS inner waters forecast |
| `llm_prompt` | TEXT | Full prompt sent to Claude (for debugging) |
| `predictions` | JSONB | `{ day_0: [...], day_1: [...], ... }` |
| `model` | TEXT | Model identifier (claude-sonnet-4-20250514) |
| `temperature` | FLOAT | Temperature setting used |
| `top_p` | FLOAT | Top-p setting used |
| `max_tokens` | INT | Max tokens setting used |
| `source` | TEXT | Origin tag (fresh_llm, db_current, etc.) |
| `stored_at` | TIMESTAMP | When record was stored |

### Configuration Files

**`web-ui/config/model_config.json`** - LLM and rate limiting settings
```json
{
  "model": "claude-sonnet-4-20250514",
  "temperature": 1.0,
  "top_p": 1.0,
  "max_tokens": { "forecast": 2500 },
  "maxDailyLlmCalls": 6,
  "enableRateLimit": true,
  "allowOnDemandGeneration": true,
  "allowLocalLlmCalls": false
}
```

**`web-ui/src/config/app-config.json`** - UI feature flags
```json
{
  "llmForecast": {
    "enabled": true  // Must be true to fetch forecasts on page load
  }
}
```

### Environment Variables (Vercel Dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for forecast generation |
| `DATABASE_URL` | Yes | Vercel Postgres connection string (pooled) |
| `CRON_SECRET` | Yes | Authentication for cron jobs |
| `ADMIN_SECRET` | Yes | Authentication for force-refresh |

### Rate Limiting

- **Default limit**: 6 LLM calls per day (PST timezone)
- **Counted**: Only `source='fresh_llm'` records (actual LLM generations)
- **Reset**: Midnight PST
- **Override**: Set `enableRateLimit: false` in model_config.json
- **Disable limit**: Set `maxDailyLlmCalls: -1`

### Source Tags (for debugging)

| Source | Meaning |
|--------|---------|
| `fresh_llm` | Newly generated by LLM |
| `db_current` | Returned from database (NWS unchanged) |
| `db_cron_only` | Returned from database (on-demand disabled) |
| `db_nws_failed` | Returned from database (couldn't fetch NWS) |
| `db_extraction_failed` | Returned from database (couldn't parse NWS) |
| `db_rate_limited` | Returned from database (rate limit hit) |

### Cron Schedule (vercel.json)

**Important**: Vercel cron jobs run on UTC time. The schedules below show both UTC and Pacific time equivalents.

```json
{
  "crons": [
    {
      "path": "/api/cron/store-wind-actuals",
      "schedule": "0 10 * * *"   // 10:00 UTC = 2:00 AM PST
    },
    {
      "path": "/api/cron/generate-forecast",
      "schedule": "0 17 * * *"   // 17:00 UTC = 9:00 AM PST
    }
  ]
}
```

**Cron Job Details:**

| Job | Schedule (UTC) | Schedule (PST) | Purpose |
|-----|----------------|----------------|---------|
| `store-wind-actuals` | 10:00 UTC | 2:00 AM PST | Store previous day's actual wind measurements |
| `generate-forecast` | 17:00 UTC | 9:00 AM PST | Generate LLM forecast from latest NWS data |

**Verification:**
- Each cron job logs detailed timestamps and run IDs to Vercel logs
- Check Vercel dashboard > Functions > Logs to verify cron execution
- Logs include both UTC and Pacific timestamps for debugging

---

## TECHNICAL DETAILS

### Data Files Available

**Forecasts:** Located in `data/raw/forecasts/`
- `coastal_waters_2019_2025.txt` (92 MB, NWS coastal forecasts)
- `area_forecast.txt` (74 MB, not used in MVP)

**Wind measurements (AGXC1 station):** Located in `data/raw/wind/`
- **Training Data (2016-2024)**: `2016.txt` through `2024.txt`
- **Testing Data (2025)**: `2025.txt` (consolidated from monthly files)

**Note:** All data through 2024 (inclusive) represents training data. The 2025 data is reserved for testing and validation. The system is targeting live production deployment with real-time forecasts starting January 1, 2026.

### Data Format
**Wind data columns:**
- Date/time (GMT)
- Wind direction (WDIR, degrees)
- Wind speed (WSPD, m/s)
- Gust speed (GST, m/s)
- Temperature, pressure, etc.

**Invalid sentinel values to filter:**
- WSPD or GST >= 99.0
- Temperature >= 999.0

**Forecast format:**
```
.THU...NW wind 15 to 25 kt, becoming 20 to 30 kt in the afternoon.
Seas 10 to 12 ft. Small Craft Advisory in effect.
```

### Units

- **Time**: Convert all time data to PST in ISO 8601 format (YYYY-MM-DDTHH:MM:SS-08:00)
- **Wind Data**: Convert all m/s wind data to knots (1.0 m/s = 1.9 knots)
  - **WSPD**: Average wind speed in knots, 1 decimal place
  - **GST**: Maximum gust speed in knots, 1 decimal place
- **Other Data**:
  - **WDIR**: Wind direction in degrees, integer
  - **PRES**: Pressure in hPa, 1 decimal place
  - **ATMP**: Air temperature in °C, 1 decimal place

### Timestamp Storage Standard

**Format**: All timestamps use ISO 8601 with Pacific timezone offset (DST-aware):
- PST (winter): `2025-01-15T10:23:00-08:00`
- PDT (summer): `2025-07-15T10:23:00-07:00`

**Key Rules**:
1. **Never hardcode timezone offsets** (-8 or -7 hours) - use library functions
2. **Always use timezone-utils.ts** - centralized DST-aware utilities
3. **Use getPacificDateHour()** for forecast vs actuals comparisons

**Available Utilities** (`web-ui/src/lib/timezone-utils.ts`):
| Function | Purpose |
|----------|---------|
| `getPacificISOString(date)` | ISO string with Pacific offset |
| `formatPacificDateTime(date)` | Human-readable with PST/PDT indicator |
| `getPacificDateString(date)` | YYYY-MM-DD in Pacific timezone |
| `getPacificDateHour(date)` | Extract date+hour for forecast comparisons |
| `getPacificYesterday()` | Yesterday's date in Pacific (DST-safe) |

## DEPLOYMENT ENVIRONMENT CONSTRAINTS

### Production Deployment: Vercel Serverless

The web-ui application is deployed on **Vercel** as serverless functions. This imposes critical constraints that MUST be considered when implementing new features.

#### Vercel Project Configuration

**⚠️ CRITICAL: DO NOT create new Vercel projects. The deployment is already configured.**

| Setting | Value |
|---------|-------|
| **Vercel Project Name** | `wind-la` |
| **Vercel Project ID** | `prj_qRAoBWtOhrBYd1UQkw9gLDK3MyhO` |
| **Vercel Team/Org ID** | `team_0TSkl9HjWTYubgs7dM1tC54t` |
| **GitHub Repository** | `davidelasi/wind-llm` |
| **Root Directory** | `web-ui` (configured in Vercel dashboard) |
| **Framework** | Next.js (auto-detected) |
| **Node Version** | 18.x |

#### GitHub Integration

The Vercel project is **connected to GitHub** with automatic deployments:

- **Production Branch**: `main` → deploys to production automatically
- **Preview Deployments**: Pull requests get preview URLs automatically
- **Build Trigger**: Any push to `main` triggers a new production deployment

**Deployment Workflow:**
```
1. Make changes locally
2. Commit to git
3. Push to origin/main (or create PR)
4. Vercel automatically builds and deploys
5. Check Vercel dashboard for deployment status
```

**DO NOT:**
- ❌ Run `vercel` CLI to create new projects
- ❌ Run `vercel link` (already linked via `.vercel/project.json`)
- ❌ Manually deploy with `vercel --prod` (use git push instead)
- ❌ Create new Vercel projects for this codebase

**DO:**
- ✅ Push to GitHub to trigger deployments
- ✅ Check Vercel dashboard for logs and deployment status
- ✅ Use Vercel dashboard to manage environment variables
- ✅ Use `vercel env pull` to sync env vars locally (if needed)

#### Project Structure for Deployment

```
wind-llm/                    ← GitHub repository root
├── web-ui/                  ← Vercel root directory (configured in dashboard)
│   ├── .vercel/
│   │   └── project.json     ← Links to Vercel project (DO NOT DELETE)
│   ├── vercel.json          ← Build config, crons, headers
│   ├── src/app/             ← Next.js app router
│   ├── config/              ← Model config (bundled for production)
│   └── data/training/       ← Few-shot examples (bundled for production)
├── .vercel/
│   └── project.json         ← Also links to same project
├── data/                    ← NOT deployed (training data, too large)
├── scripts/                 ← NOT deployed (Python scripts)
└── config/                  ← NOT deployed (source config, copied to web-ui/)
```

#### Critical Constraint: Read-Only Filesystem

**⚠️ CRITICAL:** Vercel's serverless environment has a **read-only filesystem** except for `/tmp`.

**What this means:**
- You CANNOT write files to the project directory in production
- You CANNOT create directories in the project root or subdirectories
- The ONLY writable directory is `/tmp`
- `/tmp` is ephemeral and cleared between function invocations

**Implementation Rules:**

1. **File Caching**
   - ✅ **CORRECT:** Use `/tmp` directory for cache in production
   - ❌ **WRONG:** Write to `.cache`, `data/`, or any project directory
   - **Example:** `lib/cache/file-cache.ts` detects serverless environment and uses `/tmp/.cache`

2. **Data Storage**
   - ✅ **CORRECT:** Use external services (database, object storage, Redis, etc.)
   - ✅ **CORRECT:** Store data in memory (with awareness of function cold starts)
   - ✅ **CORRECT:** Read static files bundled with deployment
   - ❌ **WRONG:** Write persistent data to filesystem
   - ❌ **WRONG:** Expect filesystem state to persist between requests

3. **Configuration Files**
   - ✅ **CORRECT:** Bundle configuration files in `web-ui/` directory
   - ✅ **CORRECT:** Use environment variables (set in Vercel dashboard)
   - ❌ **WRONG:** Reference files outside `web-ui/` directory (parent paths like `../config`)
   - **Example:** `config/model_config.json` copied into `web-ui/config/` for deployment

4. **Training Data & Static Files**
   - ✅ **CORRECT:** Bundle necessary data files within `web-ui/` directory
   - ✅ **CORRECT:** Use paths relative to `process.cwd()` (which is `web-ui/` root in production)
   - ❌ **WRONG:** Reference parent directories (`../data/`)
   - **Example:** Training examples in `web-ui/data/training/few_shot_examples/`

#### Serverless Environment Detection

Use these environment variables to detect serverless deployment:

```typescript
const isServerless = process.env.VERCEL ||
                     process.env.AWS_LAMBDA_FUNCTION_NAME ||
                     process.env.LAMBDA_TASK_ROOT;

if (isServerless) {
  // Use /tmp for any file operations
  const cachePath = path.join('/tmp', '.cache');
} else {
  // Development: use project directory
  const cachePath = path.join(process.cwd(), '.cache');
}
```

#### Graceful Degradation

Always implement graceful error handling for filesystem operations:

```typescript
try {
  await fs.writeFile(cachePath, data);
} catch (error) {
  // Log warning but don't crash - continue without cache
  console.warn('[Cache] Unable to write, continuing without cache:', error);
}
```

**Why:** Even `/tmp` can fail if:
- Function has insufficient permissions
- Disk quota exceeded
- Filesystem errors in cloud infrastructure

#### Other Vercel Constraints

1. **Execution Time Limits:**
   - Hobby plan: 10 seconds maximum
   - Pro plan: 60 seconds maximum
   - Design APIs to complete quickly or use background jobs

2. **Memory Limits:**
   - Default: 1024 MB
   - Large data processing must be optimized for memory

3. **Function Size:**
   - Keep deployment bundle under 50 MB (uncompressed)
   - Large datasets may need external storage

4. **Cold Starts:**
   - Functions may be "cold" (newly initialized) on each request
   - Don't rely on in-memory state persisting between requests
   - Use external caching (Redis, KV store) for shared state

#### Local Development: No Database Required

**⚠️ PHILOSOPHY:** We do NOT maintain a local copy of the production database.

When running locally (`localhost` or `NODE_ENV=development`), all database calls are **automatically skipped** and return empty/default results. This is controlled by `skipDatabaseInDevelopment: true` in `config/model_config.json`.

**Why this approach:**
- Production database (Vercel Postgres/Neon) is cloud-only
- No need to set up local PostgreSQL infrastructure
- UI development can proceed without database connectivity
- Actual data is only needed for production validation

**How it works:**

```typescript
// All database services use this pattern:
import { shouldSkipDatabase, logDatabaseSkipped } from '@/lib/db/db-utils';

export async function getForecasts() {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('getForecasts');
    return [];  // Return appropriate empty result
  }
  // ... actual database query
}
```

**Affected services:**
- `lib/services/forecast-storage.ts` - All forecast CRUD operations
- `lib/services/wind-actuals-storage.ts` - All wind actuals operations
- `lib/services/forecast-comparison.ts` - Statistics comparisons
- `api/admin/purge-forecasts/route.ts` - Admin operations

**Local development behavior:**
| Operation | Local Return Value | Notes |
|-----------|-------------------|-------|
| Store forecast | `null` | Silently skipped |
| Get forecasts | `[]` | Empty array |
| Get wind actuals | `[]` | Empty array |
| Rate limit count | `0` | Allows LLM testing if enabled |
| Forecast exists check | `false` | Treats as "no existing forecast" |

**To test with actual database (advanced):**
1. Set up Vercel Postgres locally (complex, not recommended)
2. Or set `skipDatabaseInDevelopment: false` in config
3. Ensure `DATABASE_URL` environment variable is configured

**Best practice for new database features:**
1. Add `shouldSkipDatabase()` check at the start of each database function
2. Return appropriate empty/default value (not an error)
3. Use `logDatabaseSkipped()` to log for debugging
4. Test that UI handles empty data gracefully

#### Testing for Production Compatibility

Before deploying new features, verify:

1. ✅ No filesystem writes outside `/tmp`
2. ✅ All required files bundled in `web-ui/` directory
3. ✅ No parent directory references (`../`)
4. ✅ Graceful error handling for all I/O operations
5. ✅ Environment detection for serverless-specific code paths
6. ✅ Test with `NODE_ENV=production` locally

#### Real-World Issues Encountered

**Issue 1: Cache Directory Not Writable**
- **Error:** `ENOENT: no such file or directory, open '/var/task/web-ui/.cache/'`
- **Cause:** Attempted to write cache to project directory
- **Fix:** Modified `lib/cache/file-cache.ts` to use `/tmp` in serverless environment
- **Commit:** `132cc82` (Dec 2025)

**Issue 2: External File Dependencies**
- **Error:** API routes failing to find `config/model_config.json`
- **Cause:** Configuration file referenced from parent directory (`../config`)
- **Fix:** Copied config file into `web-ui/config/` and updated all path references
- **Commit:** `fe9577c` (Dec 2025)

#### Summary Checklist

When implementing ANY new feature that involves file I/O:

- [ ] Use `/tmp` for writable files in production
- [ ] Implement serverless environment detection
- [ ] Add graceful error handling for file operations
- [ ] Bundle all required static files in `web-ui/`
- [ ] Use relative paths from `process.cwd()` (no `../`)
- [ ] Test locally with `NODE_ENV=production`
- [ ] Consider memory and execution time constraints

**REMEMBER:** If a feature works locally but fails on Vercel, filesystem operations are the most likely culprit.

## PROJECT STRUCTURE
```
wind-llm/
├── config/               # Configuration files
│   └── model_config.json
├── data/
│   ├── raw/
│   │   ├── forecasts/    # Raw NWS forecast data
│   │   └── wind/         # Raw NOAA buoy measurements
│   ├── cleaned/          # Processed/cleaned data
│   └── training/         # LLM training examples
│       └── few_shot_examples_json/  # JSON format (production)
├── scripts/
│   ├── processing/       # Core data pipeline scripts
│   ├── training/         # ML/training related scripts
│   ├── analysis/         # Analysis & debugging tools
│   ├── utilities/        # Batch operations and utilities
│   └── archive/          # Legacy/testing scripts
├── web-ui/               # Next.js web interface
│   └── src/app/
│       └── _trash/       # Deprecated pages for future removal
│           └── debug/    # Former Debug & Diagnostics page (removed from nav 2026-01-10)
└── logs/                 # Prompt and execution logs
```

### Web UI Changes

**Removed Pages (2026-01-10):**
- **Debug & Diagnostics page** (`/debug`) - Moved to `web-ui/src/app/_trash/debug/`
  - Removed from navigation menu
  - Page kept in _trash folder for potential future elimination
  - Debug section on home page still available via config: `appConfig.debug.showDebugSection`
  - Rationale: Simplify navigation menu, reduce clutter for end users
```

## SCRIPTS INVENTORY

### 📁 **Organized Structure (Target)**

The scripts directory is being organized into logical folders for better maintenance and clarity:

```
scripts/
├── processing/          # Core data pipeline scripts
├── training/           # ML/training related scripts
├── analysis/           # Analysis & debugging tools
├── utilities/          # Batch operations and utilities
└── archive/            # Legacy/testing scripts
```

**⚠️ IMPORTANT FOR FUTURE SESSIONS:**
- ALL new scripts MUST follow this folder structure
- When creating new scripts, place them in the appropriate folder
- When referencing existing scripts, use the full path (e.g., `scripts/processing/process_wind_data.py`)
- This structure is designed to maintain logical separation of concerns
- DO NOT place scripts back in the root `/scripts/` directory

### 🏭 **processing/** - Core Data Pipeline Scripts

**`process_wind_data.py`** - Master wind data processing pipeline
- Converts GMT to PST timestamps
- Filters columns (WDIR, WSPD, GST, PRES, ATMP)
- Removes invalid sentinel values (99.0, 999.0)
- Aggregates hourly averages for 10 AM - 7 PM PST
- Identifies complete days without gaps

**`process_forecast_data.py`** - Master forecast processing pipeline
- Diagnoses corrupted forecast data
- Converts day-of-week references to relative day format
- Extracts and formats weather warnings
- Cleans and standardizes forecast content

**Supporting utilities:**
- `convert_timestamps.py` - GMT to PST timestamp conversion
- `convert_wind_timestamps.py` - Wind-specific timestamp processing
- `convert_forecast_periods.py` - Day-of-week to relative day conversion
- `filter_wind_columns.py` - Extract relevant wind measurement columns
- `filter_inner_waters.py` - Extract inner waters forecast sections

### 🤖 **training/** - ML/Training Related Scripts

**`generate_training_data.py`** - LLM training data generation
- Combines forecast data with actual wind measurements
- Creates JSON format suitable for LLM training
- Validates data completeness and quality

**`curate_few_shot_examples.py`** - Few-shot example curation
- Creates 48 monthly/forecast-number specific example files
- Implements wind strength targets (4 calm, 8 moderate, 3 strong)
- Ensures temporal and year diversity
- **Fixed critical bug**: Now properly selects 15 examples per file

**`identify_complete_days.py`** - Find days with complete hourly wind data
- Essential for selecting high-quality training examples
- Identifies complete 10AM-7PM data windows

### 🔍 **analysis/** - Analysis & Debugging Tools

**`validate_processed_data.py`** - Data quality validation and verification
**`analyze_specific_forecast.py`** - Deep dive analysis of individual forecasts
**`diagnose_corrupted_forecasts.py`** - Identify data corruption patterns
**`diagnose_day_offsets.py`** - Debug relative day assignment issues
**`variance_test.py`** - LLM prediction variance analysis
- Runs multiple LLM predictions to measure natural variance
- Supports temperature override via command line
- Outputs statistics (mean, std dev, min, max) for WSPD and GST errors

### ⚙️ **utilities/** - Batch Operations & Utilities

**`batch_process_wind_data.py`** - Bulk wind data processing across years
- Processes multiple years of wind data in batch
- Maintains consistent formatting and quality standards

### 📁 **archive/** - Legacy/Testing Scripts

Contains earlier development iterations, testing scripts, and deprecated tools preserved for reference. Not used in production pipeline.

**Key archived scripts:**
- `correct_prediction_test.py` - Validated prediction testing framework (1.0kt WSPD, 1.4kt GST accuracy)
- `test_2025_forecast.py`, `batch_test_2025.py` - 2025 validation testing
- Various legacy processing scripts and development iterations

### 📊 **Script Status Summary**
- **Total Scripts**: 27+ including archive
- **Production Ready**: 5 core scripts + 3 testing scripts
- **Active Development**: Few-shot prediction framework
- **Deprecated**: Archive folder contents (preserved for reference)

### 🎯 **Future Session Guidelines (CRITICAL)**

**When Adding New Scripts:**
1. **Identify Purpose**: Determine which folder the script belongs in
2. **Follow Naming**: Use verb_object pattern (e.g., `analyze_wind_patterns.py`)
3. **Update Documentation**: Add script description to the appropriate section above
4. **Maintain Structure**: Never place scripts directly in `/scripts/` root

**When Referencing Scripts:**
- Always use full paths: `scripts/processing/process_wind_data.py`
- Check folder first: Use `ls scripts/` to see organized structure
- Follow dependencies: Processing → Training → Analysis flow

**When Debugging:**
- Check `analysis/` folder for existing diagnostic tools
- Add new diagnostic scripts to `analysis/` folder
- Archive old testing scripts to `archive/` folder

### Data Processing Principles (CRITICAL):

**ALWAYS use scripts for bulk data processing to save tokens:**
- **Rule**: Never use LLM to process large text files directly
- **Method**: Create Python scripts for all data transformations
- **Testing**: Use LLM for small-scale testing and validation only
- **Rationale**: Preserves tokens and ensures reproducible processing

**Wind Data Processing Standards:**

**1. Hourly Aggregation Procedure:**
- **Time Intervals**: Aggregate data within each hour (e.g., 3:00-4:00 PM)
- **Assignment**: Assign aggregated values to the beginning of interval (3:00 PM)
- **Time Window**: Process only 10 AM - 7 PM (peak wind hours)
- **WSPD (Wind Speed)**: Simple arithmetic mean of all valid measurements in each hour
- **GST (Wind Gust)**: MAXIMUM value during each hour (not average) - sailors care about peak gust
- **Other parameters**: Simple arithmetic mean (PRES, ATMP, WDIR)

**2. Invalid Data Filtering:**
- **Sentinel Values**: Ignore ~99, ~999, ~9999 (sensor malfunction indicators)
  - Handles decimal precision: 99, 99.0, 99.00 all treated as invalid
  - Uses approximate comparison (±0.01) to catch formatting variations
- **Essential vs Non-Essential Parameters**:
  - **Essential**: WDIR, WSPD, GST (must have valid data to keep hourly record)
  - **Non-Essential**: PRES, ATMP (use "null" if no valid data available)
- **Wind Direction Special Case**: 99 degrees IS valid for WDIR (rare but real)
- **Strategy**: Skip entire hourly record if essential wind parameters are missing
- **Action**: Exclude invalid values from aggregation; use "null" for missing non-essential data

**3. Time Range Filtering:**
- **Keep**: 10 AM - 7 PM PST only (core wind hours for ocean sports)
- **Delete**: All data outside this window
- **Rationale**: Focus on peak sailing/surfing hours, reduce noise

## WIND DATA PROCESSING METHODOLOGY

### Overview
This section documents the complete data preprocessing pipeline used to transform raw meteorological measurements from NOAA buoy AGXC1 into high-quality datasets for the wind forecasting LLM model.

### 1. Raw Data Characteristics
**Source**: NOAA buoy AGXC1, Los Angeles area
**Temporal Coverage**:
- **Training Data**: 2016-2024 (9 years)
- **Testing Data**: 2025 (reserved for validation)
**Measurement Frequency**: 6-minute intervals
**Original Format**: Tab-separated values with GMT timestamps
**Raw Parameters**: Wind direction (WDIR), wind speed (WSPD), gust speed (GST), pressure (PRES), air temperature (ATMP), plus auxiliary measurements

### 2. Timestamp Standardization
**Objective**: Convert all temporal data to consistent Pacific Standard Time
**Process**:
- Transform GMT timestamps to PST (UTC-8) by subtracting 8 hours
- Convert from discrete columns (YYYY MM DD HH mm) to ISO 8601 format (YYYY-MM-DDTHH:MM:SS-08:00)
- Apply timezone conversion accounting for date rollover at midnight boundaries
- Standardize to PST year-round (ignore daylight saving transitions for consistency)

### 3. Temporal Filtering and Aggregation
**Time Window Selection**: 10:00-18:00 PST (9 hours daily)
**Rationale**: Peak thermal wind development period relevant for ocean sports activities
**Aggregation Method**:
- **Wind Speed (WSPD)**: Arithmetic mean of all valid 6-minute measurements within each hour
- **Gust Speed (GST)**: Maximum value during each hour interval (critical for safety applications)
- **Wind Direction (WDIR)**: Circular mean of valid measurements
- **Auxiliary Parameters**: Arithmetic mean when available
- **Temporal Assignment**: Aggregated values assigned to hour beginning (e.g., 15:00 represents 15:00-16:00)

### 4. Quality Control and Data Validation
**Sentinel Value Detection**:
- Identified sensor malfunction indicators: ~99, ~999, ~9999 (with ±0.01 tolerance for decimal variations)
- Special case: Wind direction of exactly 99° retained as valid meteorological measurement
- Applied approximate comparison to handle floating-point precision inconsistencies

**Parameter Classification**:
- **Essential Parameters**: WDIR, WSPD, GST (required for valid hourly record)
- **Non-Essential Parameters**: PRES, ATMP (marked as "null" when invalid, record preserved)

**Data Integrity Validation**:
- Wind direction bounds: 0-360 degrees
- Physical consistency: GST ≥ WSPD (gust cannot be less than sustained wind)
- Non-negative wind speeds
- Hourly records discarded when essential wind parameters missing/invalid

### 5. Unit Standardization
**Wind Measurements**: Converted from m/s to knots (1 m/s = 1.9 knots)
**Precision Standards**:
- Wind speeds: 1 decimal place (e.g., 12.3 kt)
- Wind direction: Integer degrees (e.g., 245°)
- Pressure: 1 decimal place (e.g., 1013.2 hPa)
- Temperature: 1 decimal place (e.g., 18.5°C)

### 6. Column Filtering and Dimensionality Reduction
**Retained Parameters**: DATETIME_PST, WDIR, WSPD, GST, PRES, ATMP
**Removed Parameters**: Wave height (WVHT), dominant wave period (DPD), average wave period (APD), mean wave direction (MWD), water temperature (WTMP), dew point (DEWP), visibility (VIS), tide height (TIDE)
**Rationale**: Focus on atmospheric variables directly relevant to wind forecasting applications

### 7. Missing Data Handling Strategy
**Essential Parameter Strategy**: Skip entire hourly record when wind measurements unavailable
**Non-Essential Parameter Strategy**: Replace with "null" indicator, preserve hourly record
**Impact**: Maintains data integrity while maximizing temporal coverage for training

### 8. High-Quality Day Identification
**Completeness Criteria**:
- All 9 hourly measurements present (10:00-18:00 PST)
- No gaps in temporal sequence
- All essential wind parameters valid (non-null, physically reasonable)
- Optional: Auxiliary parameters available (separate classification)

**Quality Assessment Results (Training Data 2016-2024)**:
- Total days analyzed: 2,872
- Complete wind data days: 2,690 (93.7% completeness)
- Complete full sensor days: 875 (30.5% completeness, limited by auxiliary sensor failures 2020-2024)

### 9. Final Dataset Characteristics
**Temporal Resolution**: Hourly aggregates, 9 hours per day
**Spatial Coverage**: Single point location (AGXC1 buoy)
**Data Volume**: 25,288 validated hourly measurements across 9 years (training)
**Quality Assurance**: Zero sentinel values in processed dataset
**Format Standardization**: Consistent units, precision, and temporal encoding
**Training Recommendations**: Use 2,690 complete wind-data days for optimal model training quality

### 10. Reproducibility and Documentation
**Script-Based Processing**: All transformations implemented in Python for reproducibility
**Version Control**: Complete processing pipeline documented and version-controlled
**Validation Tools**: Automated quality assessment scripts for data integrity verification
**Output Formats**: Both machine-readable (CSV) and human-readable (TXT) formats generated for training day selection

This methodology ensures high-quality, temporally consistent, and validated wind measurements suitable for training machine learning models while maintaining scientific rigor and reproducibility standards.

## FEW-SHOT PREDICTION METHODOLOGY (VALIDATED)

### Overview
After extensive testing and debugging, we have established a validated methodology for few-shot wind prediction that eliminates data contamination and provides excellent accuracy. This methodology is production-ready and scales to any date with available data.

### Critical Data Source Requirements

**1. Forecast Source:**
- **File**: `data/cleaned/inner_waters_forecasts_relative_periods.txt`
- **Format**: Structured with "Issued:" timestamps and "D0_DAY"/"D0_NIGHT" periods
- **Selection**: Use morning forecasts (6AM-12PM) when available, prefer ~8AM issuance
- **Why**: Provides real operational forecast separate from training examples

**2. Training Examples:**
- **Source**: Respective monthly files (e.g., `data/training/few_shot_examples_json/jul_fc2_examples.json`)
- **Count**: ALL 15 examples from the matching month/forecast-number file
- **Selection**: No cherry-picking - use complete curated set for maximum diversity
- **Why**: Comprehensive coverage of wind patterns prevents bias

**3. Actual Wind Data:**
- **Training**: `data/cleaned/wind_2016_processed.txt` through `data/cleaned/wind_2024_processed.txt`
- **Testing**: `data/cleaned/wind_2025_processed.txt`
- **Format**: Space-separated values: DATETIME_PST WDIR WSPD GST PRES ATMP
- **Processing**: Hourly aggregated, 10AM-7PM PST, quality-controlled data
- **Why**: Matches training data format and processing methodology

### Validated Results

**Test Case: 2023-07-15**
- **NWS Forecast**: "Winds variable 10kt or less, becoming SW 10kt in afternoon"
- **LLM Prediction Accuracy**:
  - Average WSPD error: 1.0kt
  - Average GST error: 1.4kt
  - Peak timing: ✅ Correctly predicted afternoon build-up
- **Pattern Recognition**: Successfully interpreted "variable becoming SW 10kt" pattern
- **Data Integrity**: Zero contamination between forecast source and training examples

### Implementation Script
**File**: `scripts/archive/correct_prediction_test.py`
**Key Functions**:
- `find_forecast_for_date()` - Extracts real NWS forecast for test date
- `load_all_examples()` - Loads complete 15-example training set
- `load_processed_wind_data()` - Loads actual wind conditions
- `create_comprehensive_prompt()` - Builds complete few-shot prompt

### Quality Assurance
- **Data Isolation**: Forecast source completely separate from training examples
- **No Cherry-Picking**: Uses all available examples for comprehensive pattern learning
- **Proper Processing**: Wind data matches exact format used in training
- **Validation Framework**: Ready for testing across multiple dates/seasons

This methodology represents a significant breakthrough in LLM-based meteorological prediction and is ready for production deployment.


## PROGRESS STATUS

### 🚀 PRODUCTION STATUS: LIVE (January 2026)

The wind forecasting system is **live in production** on Vercel, serving real-time LLM-generated forecasts.

### ✅ COMPLETED - Data Processing & Training:

- ✅ Raw wind data processing (2016-2024): 2,872 days → 2,690 complete days (93.7%)
- ✅ Forecast data cleaning and parsing: 8,538 forecast-actual pairs
- ✅ 48 curated few-shot example files (12 months × 4 forecast numbers, 720 total)
- ✅ Wind strength diversity: 4 calm, 8 moderate, 3 strong examples per file
- ✅ Validated accuracy: 1.0kt avg WSPD error, 1.4kt avg GST error

### ✅ COMPLETED - Production Infrastructure:

- ✅ **API endpoint** (`/api/llm-forecast`) - Serves cached or fresh forecasts
- ✅ **Database storage** (Vercel Postgres/Neon) - Persistent forecast cache
- ✅ **Scheduled generation** (Vercel Cron) - Daily at 9 AM PST
- ✅ **On-demand generation** - Page loads trigger updates when NWS has new data
- ✅ **Rate limiting** - 6 LLM calls/day to control costs
- ✅ **Web UI** (Next.js) - 5-day forecast display with hourly breakdown

### ✅ COMPLETED - Production Assets:

**Training Data:**
- `web-ui/data/training/few_shot_examples/*.json` - 48 curated files (bundled for Vercel)
- `data/training/few_shot_examples_json/*.json` - Source files (720 examples)

**Configuration:**
- `web-ui/config/model_config.json` - LLM parameters (temperature, rate limits)
- `web-ui/src/config/app-config.json` - Feature flags (llmForecast.enabled)

### 🔄 FUTURE ENHANCEMENTS:

- Wind direction prediction integration
- Seasonal/climate indicator integration (El Niño/La Niña)
- Model performance monitoring and drift detection
- Human-readable forecast summaries

**END OF SUMMARY**
