# Wind Forecasting LLM - Project Overview

**Last Updated:** December 10, 2025
**Target Deployment:** January 1, 2026
**Status:** Production-ready forecasting system, testing phase

---

## Purpose

A wind forecasting system for ocean sports enthusiasts that uses AI language models to predict wind conditions at NOAA buoy station AGXC1 (Los Angeles area). Unlike traditional numerical weather models, this system learns patterns directly from historical National Weather Service (NWS) forecasts and actual observations using few-shot learning.

**Target Users:** Sailors, kite surfers, windsurfers, and ocean sports enthusiasts who need accurate hourly wind predictions during peak activity hours (11 AM - 6 PM PST).

---

## Core Architecture

### High-Level Data Flow

```
Historical Data (2016-2024) → 720 Curated Training Examples
                                           ↓
NWS Coastal Forecast (3x daily) → LLM Prompt Construction
                                           ↓
                            Claude Sonnet 4 (Few-Shot Learning)
                                           ↓
                       Hourly Wind Predictions (5 days × 9 hours)
                                           ↓
                              Cache (3-hour TTL) → Web UI
```

### Technology Stack

**Frontend:**
- Next.js 16 (App Router)
- React 19.2
- TypeScript
- Tailwind CSS 4
- Recharts (data visualization)
- date-fns-tz (timezone handling)

**Backend:**
- Next.js API Routes (serverless functions)
- Anthropic Claude Sonnet 4 (model: `claude-sonnet-4-20250514`)
- File-based caching with ETag support

**Data Sources:**
- NOAA Buoy AGXC1 (6-minute wind measurements)
- NWS API (coastal water forecasts)
- Historical dataset: 9 years (2016-2024), 25,288 validated hourly measurements

**Deployment:**
- Vercel serverless platform
- Read-only filesystem (writes only to `/tmp`)
- Environment-aware caching strategy

---

## Key Design Decisions

### 1. Why LLM Instead of Traditional ML?

**Insight:** NWS forecasts are unstructured text. LLMs can read and interpret text natively without feature engineering.

**Advantages:**
- No manual feature extraction from forecast text
- LLM learns implicit relationships (e.g., "Small Craft Advisory" → stronger winds)
- Can interpret natural language patterns ("becoming 20kt in afternoon")
- Adapts to forecast language variations

**Approach:** Few-shot learning (15 examples per forecast)
- More token-efficient than fine-tuning
- Easier to update and maintain
- Transparent and auditable (prompts are visible)

### 2. Time Window Selection (11 AM - 6 PM PST)

**Why these hours?**
- Peak thermal wind development period
- Coincides with ocean sports activity
- Reduces noise from nocturnal wind patterns
- Focused prediction improves accuracy

**Implementation:**
- Raw data aggregated to hourly values
- Only display 11 AM - 6 PM window (9 hours)
- Training examples use same time window for consistency

### 3. Wind Data Aggregation Methodology

**Wind Speed (WSPD):** Simple arithmetic mean
- Average of all 6-minute measurements within each hour
- Represents sustained wind conditions

**Gust Speed (GST):** Maximum value
- Peak gust measurement within each hour
- **Critical for safety:** Sailors need to know worst-case conditions, not averages

**Example:**
```python
# Hour 3:00-4:00 PM has 10 measurements
hourly_wspd = mean([12.3, 13.1, 12.8, ...])  # Result: 12.7 kt
hourly_gst = max([15.2, 16.8, 14.9, ...])     # Result: 16.8 kt
```

### 4. Few-Shot Learning Strategy

**Example Organization:** 48 files (12 months × 4 forecast times)
- FC1 (6 AM-2 PM): Morning forecasts
- FC2 (2 PM-8 PM): Afternoon forecasts
- FC3 (8 PM+): Evening forecasts
- FC4: Additional daily forecast

**Per-File Composition:** 15 examples with wind strength targets
- 4 calm examples (peak WSPD < 10kt)
- 8 moderate examples (peak WSPD 10-20kt)
- 3 strong examples (peak WSPD > 20kt)

**Selection Logic:**
```typescript
// Current time: July 15, 2:30 PM PST
Month: July → Load "july_fc2_examples.json"
Forecast Time: FC2 (afternoon)
Result: 15 diverse examples from multiple years
```

**Total:** 720 curated training examples across all scenarios

### 5. Model Configuration

**Primary Model:** Claude Sonnet 4 (`claude-sonnet-4-20250514`)

**Parameters (configurable via `config/model_config.json`):**
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

**Temperature = 1.0:** Allows natural variance expression
- LLM can express forecast uncertainty
- More human-like predictions
- Validated baseline: ±1.54kt WSPD, ±2.02kt GST error

**Alternative (deterministic):** Temperature = 0.0 reduces variance by 80-90%

---

## Data Processing Pipeline

### Offline Processing (Historical Data)

```
Raw NOAA Buoy Data (2016-2024)
    ↓
scripts/processing/process_wind_data.py
  - GMT → PST timezone conversion
  - Filter to 10 AM - 7 PM window
  - Hourly aggregation (avg for WSPD, max for GST)
  - Remove invalid sentinel values (99.0, 999.0)
    ↓
Cleaned Wind Data (2,690 complete days / 2,872 total)
    ↓
scripts/training/generate_training_data.py
  - Combine forecasts with actual wind measurements
  - Create JSON training format
    ↓
8,538 Training Examples (51 MB JSON file)
    ↓
scripts/training/curate_few_shot_examples.py
  - Select 15 examples per month/forecast combo
  - Ensure wind strength diversity
  - Maintain temporal variety
    ↓
720 Curated Examples (48 files, ~100KB each)
```

### Real-Time Prediction Workflow

```
User Request → Web UI
    ↓
API: /api/llm-forecast
    ↓
Check Cache (3-hour TTL)
    ├─ Cache Hit → Return cached predictions
    └─ Cache Miss:
         ↓
      Fetch NWS Forecast (api.weather.gov)
         ↓
      Extract Inner Waters Coastal Forecast
         ↓
      Determine Current Pacific Time
         ↓
      Select Training Examples (month + forecast number)
         ↓
      Construct Few-Shot Prompt (15 examples + current forecast)
         ↓
      Call Claude Sonnet 4 API
         ↓
      Parse JSON Response
         ↓
      Cache Result → Return predictions
```

---

## Current System Capabilities

### Implemented Features ✅

**Forecasting:**
- 5-day hourly wind predictions (D+0 through D+4)
- Wind speed and gust predictions (knots)
- 3-hour intelligent caching (time-based + NWS change detection)
- Automatic example selection based on time and month

**Data Visualization:**
- Interactive forecast charts (predicted vs. actual overlay)
- Current conditions display (real-time NOAA data)
- 6-minute granularity wind history
- Day navigation (3 days back, 4 days forward)
- Color-coded wind speed indicators
- Wind direction arrows

**Transparency & Debugging:**
- Full LLM prompt visibility ("Sausage Mode")
- Generation metadata (model, timestamp, source)
- Training data inspection
- NWS forecast source tracking
- Comprehensive debug panels

**Data Quality:**
- 93.7% complete day coverage (2016-2024)
- Validated prediction accuracy (< 2kt error baseline)
- Quality-controlled training examples
- Timezone-aware processing (DST-compliant)

### Not Yet Implemented ⏳

**Forecasting:**
- Wind direction predictions (currently only WSPD/GST)
- Human-readable summaries (e.g., Grok-style casual tone)
- Extended horizon beyond 5 days

**Automation:**
- Scheduled NWS forecast fetching (3x daily)
- Automated model retraining
- Performance drift detection

**UI Features:**
- Statistics/performance monitoring dashboard
- Forecast accuracy tracking over time
- User preferences and notifications

---

## Data Specifications

### Wind Measurements

**Units:**
- Wind Speed: Knots (kt), 1 decimal place
- Wind Direction: Degrees (0-360°), integer
- Pressure: hPa, 1 decimal place
- Temperature: °C, 1 decimal place

**Timezone:**
- All timestamps in Pacific Time (PST/PDT)
- ISO 8601 format: `2025-12-10T14:00:00-08:00`
- DST-aware conversions throughout

**Quality Control:**
- Invalid sentinel values removed (99.0, 999.0)
- Essential parameters: WDIR, WSPD, GST (must be valid)
- Non-essential parameters: PRES, ATMP (null if missing)

### Training Data Quality

**Historical Coverage:**
- Training: 2016-2024 (9 years)
- Testing: 2025 (current year, ongoing collection)
- Complete days: 2,690 out of 2,872 (93.7%)

**Curated Examples:**
- Total: 720 examples across 48 scenario files
- Wind strength distribution ensures diverse pattern learning
- Year diversity prevents temporal bias

---

## Performance & Validation

### Accuracy Baseline

**2023-07-15 Test Case:**
- NWS Forecast: "Winds variable 10kt or less, becoming SW 10kt afternoon"
- LLM Prediction Accuracy:
  - WSPD Error: 1.0kt average
  - GST Error: 1.4kt average
- Pattern Recognition: ✅ Correctly captured morning calm → afternoon build

**Variance Testing (Temperature = 1.0):**
- WSPD Error: 1.54 ± 0.19kt
- GST Error: 2.02 ± 0.16kt
- Represents natural LLM uncertainty expression

### NWS Forecast Accuracy (Benchmark)

**Same Test Case:**
- NWS Predicted: 10kt
- Actual Average: 8.5kt
- Difference: 1.5kt (excellent accuracy!)

**Insight:** LLM predictions are competitive with official NWS forecasts for this location.

---

## Development Status

### Production-Ready Components ✅
- LLM forecasting API with caching
- Few-shot training example system
- Data processing pipeline (scripts)
- Web UI with visualization
- Validation testing framework

### In Progress 🚧
- 2025 data collection and validation
- Unified data layer refactoring (consolidate duplicate APIs)
- Timezone bug fixes (critical: llm-forecast route)

### Planned Enhancements 🎯
- Wind direction predictions
- Human-readable forecast summaries
- Automated scheduling (3x daily updates)
- Performance monitoring dashboard
- Extended forecast horizon (D+3, D+4, D+5)

---

## Deployment Architecture

### Vercel Serverless Constraints

**Critical Limitations:**
- Read-only filesystem (except `/tmp`)
- 10-second execution limit (Hobby plan)
- 60-second limit (Pro plan)
- 1024 MB memory default
- Cold starts (functions may reinitialize)

**Implementation Adaptations:**
- Cache files written to `/tmp` in production
- All config/data bundled in `web-ui/` directory
- No parent directory references (`../`)
- Graceful degradation for filesystem errors
- Environment detection for serverless-specific code paths

**File Structure:**
```
web-ui/
├── config/                  # Bundled configuration
│   └── model_config.json
├── data/training/           # Bundled training examples
│   └── few_shot_examples_json/
├── src/
│   ├── app/                 # Next.js pages and API routes
│   ├── components/          # React components
│   ├── lib/                 # Utilities (timezone, caching, etc.)
│   └── hooks/               # Custom React hooks
```

---

## Project Timeline

**Completed Milestones:**
- ✅ Data processing pipeline (Dec 2024)
- ✅ Few-shot example curation (Nov 2025)
- ✅ LLM integration (Nov 2025)
- ✅ Web UI development (Nov 2025)
- ✅ Validation framework (Dec 2025)

**Upcoming Milestones:**
- 🚧 Documentation consolidation (Dec 10, 2025)
- 🎯 Bug fixes and refactoring (Dec 2025)
- 🎯 Final testing and validation (Dec 2025)
- 🎯 Production deployment (Jan 1, 2026)

---

## For Developers

### Quick Start

1. **Development Environment:**
   ```bash
   cd web-ui
   npm install
   npm run dev
   ```

2. **Key Configuration:**
   - Model settings: `config/model_config.json`
   - App settings: `web-ui/app-config.json`
   - Environment: `web-ui/.env.local` (API keys)

3. **Important Pages:**
   - Home: `http://localhost:3000`
   - Sausage Mode (diagnostics): `http://localhost:3000/sausage-mode`
   - Debug: `http://localhost:3000/debug`

### Code Structure

**API Routes:** `web-ui/src/app/api/`
- `/llm-forecast` - Main prediction endpoint
- `/wind-data` - Current observations
- `/wind-history` - Historical data
- `/area-forecast` - NWS forecast text
- `/sausage-mode` - Diagnostics

**Data Processing:** `scripts/`
- `processing/` - Wind/forecast data cleaning
- `training/` - Example generation and curation
- `testing/` - 2025 validation framework

**Documentation:**
- `docs/PROJECT_OVERVIEW.md` - This file
- `docs/TECHNICAL_TODOS.md` - Active work tracking
- `CLAUDE.md` - Master reference (comprehensive)

---

## Key Insights for Technical Audience

**Why This Approach Works:**
1. **Text-Native Processing:** Forecasts are already in natural language; LLMs excel at this
2. **Few-Shot Efficiency:** 15 examples provide sufficient context without fine-tuning overhead
3. **Implicit Pattern Learning:** LLM discovers complex forecast→outcome relationships automatically
4. **Interpretability:** Full prompt visibility enables debugging and trust
5. **Adaptability:** Easy to update examples or adjust model parameters

**Challenges Overcome:**
1. **Timezone Consistency:** DST-aware conversions throughout the pipeline
2. **Data Quality:** Robust filtering of sensor malfunctions and gaps
3. **Serverless Constraints:** Adapted to read-only filesystem and execution limits
4. **Caching Strategy:** Balance between freshness and API cost
5. **Variance Management:** Temperature tuning for natural uncertainty expression

**What Makes This Unique:**
- Operationalizes LLM for real-world meteorological prediction
- Demonstrates few-shot learning effectiveness on specialized domain
- Achieves competitive accuracy with significantly simpler architecture
- Provides complete transparency (no "black box" predictions)

---

**For more technical details, see:**
- `docs/TECHNICAL_TODOS.md` - Known issues and active work
- `CLAUDE.md` - Comprehensive project context
- `scripts/README.md` - Data processing documentation
- `/sausage-mode` page - Live system diagnostics
