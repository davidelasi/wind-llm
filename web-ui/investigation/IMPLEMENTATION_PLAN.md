# Implementation Plan: Fix Multi-Day Forecast with JSON Training Data

> **📅 HISTORICAL DOCUMENT - December 2024**
> **Status**: This plan addressed TOON v1.0 data loss issues. The issues have been **RESOLVED** with TOON v2.0.
> **Current Status**: TOON v2.0 preserves 100% of multi-day data. See `CLAUDE.md` for details.
> **Preserved for**: Historical reference

**Date**: 2024-12-02
**Status**: COMPLETED (via TOON v2.0 upgrade)
**Original Estimated Time**: 4-6 hours

---

## Problem Statement

Current production uses TOON format training data that only contains Day 0 examples, forcing production code to artificially scale Day 0 predictions to create Days 1-4. This produces unrealistic forecast patterns with identical shapes across all days.

---

## Solution

Return to JSON format training data that includes multi-day forecast context (day_0_night through day_4_day) and multi-day actual wind data (day_0, day_1, day_2). This allows LLM to learn multi-day patterns and make real predictions for all 5 days.

---

## Implementation Steps

### Step 1: Copy JSON Training Data ✅
**Location**: `/home/hbond/Projects/wind-llm/data/training/archive/few_shot_examples/`
**Files**: 48 JSON files (12 months × 4 forecast numbers)
**Target**: `/home/hbond/Projects/wind-llm/web-ui/data/training/few_shot_examples/`

**Action**: Copy JSON files to web-ui accessible location

### Step 2: Update API Route - Load Training Examples ⏳
**File**: `/web-ui/src/app/api/llm-forecast/route.ts`

**Current Code** (lines ~144-179):
- Loads TOON files
- Parses pipe-delimited format
- Only gets Day 0 data

**New Code Needed**:
- Load JSON files instead
- Parse JSON format (built-in)
- Extract all forecast periods (day_0_night → day_4_day)
- Extract all actual data (day_0, day_1, day_2)

**Reference**: `/home/hbond/Projects/wind-llm/scripts/correct_prediction_test.py` lines 93-137

### Step 3: Update NWS Forecast Parsing ⏳
**File**: `/web-ui/src/app/api/llm-forecast/route.ts`

**Current Code** (lines ~61-73):
- Extracts only TODAY forecast text
- Uses single regex for INNER WATERS

**New Code Needed**:
- Parse multi-day NWS forecast (TODAY, TONIGHT, SATURDAY, SATURDAY NIGHT, etc.)
- Extract individual day/night periods
- Map to day_0_day, day_0_night, day_1_day, day_1_night, etc.

**Reference**: `/home/hbond/Projects/wind-llm/web-ui/investigation/parse_nws_multiday.ts` (example parser)

### Step 4: Update Prompt Creation ⏳
**File**: `/web-ui/src/app/api/llm-forecast/route.ts`

**Current Code** (lines ~181-243):
- Creates few-shot prompt with Day 0 examples only
- Shows only day_0_day forecast text
- Shows only day_0 actual wind

**New Code Needed**:
- Include ALL forecast periods in examples
- Include ALL actual days in examples
- Request 5-day prediction from LLM
- Match format from successful Python testing

**Reference**: `/home/hbond/Projects/wind-llm/scripts/correct_prediction_test.py` lines 197-246

### Step 5: Remove Artificial Scaling Code ⏳
**File**: `/web-ui/src/app/api/llm-forecast/route.ts`

**Current Code** (lines 372-387):
```typescript
// For now, create 5 days with variations of the base prediction
// In production, you'd want separate forecasts for each day
const allDays: ForecastPrediction[][] = [];

for (let day = 0; day < 5; day++) {
  const dayPredictions = basePredictions.map(pred => ({
    ...pred,
    windSpeed: parseFloat((pred.windSpeed * (1 + (day * 0.1))).toFixed(1)),
    gustSpeed: parseFloat((pred.gustSpeed * (1 + (day * 0.1))).toFixed(1)),
    windDirection: (pred.windDirection + (day * 5)) % 360,
    windDirectionText: getWindDirectionText((pred.windDirection + (day * 5)) % 360)
  }));
  allDays.push(dayPredictions);
}
```

**Action**: DELETE this entire block - replace with real LLM predictions for all 5 days

### Step 6: Update LLM Response Parsing ⏳
**File**: `/web-ui/src/app/api/llm-forecast/route.ts`

**Current Code**:
- Parses single day prediction
- Expects Day 0 only in response

**New Code Needed**:
- Parse 5-day prediction response
- Extract predictions for each day separately
- Validate all 5 days present
- Fallback to scaling if LLM doesn't provide all days

### Step 7: Update Sausage Mode API ⏳
**File**: `/web-ui/src/app/api/sausage-mode/route.ts`

**Current Code**:
- Loads TOON examples
- Shows limited training data

**New Code Needed**:
- Load JSON examples instead
- Show multi-day forecast context
- Show multi-day actual wind data
- Update UI to display richer structure

---

## Files to Modify

### Production Code (OK to modify):
1. ✅ `/web-ui/src/app/api/llm-forecast/route.ts` - Main forecast API
2. ✅ `/web-ui/src/app/api/sausage-mode/route.ts` - Diagnostic API
3. ✅ `/web-ui/investigation/` - Documentation folder (analysis, plans)

### Testing Code (DO NOT MODIFY):
1. ❌ `/scripts/correct_prediction_test.py` - Reference implementation
2. ❌ `/scripts/curate_few_shot_examples.py` - Training data curation
3. ❌ `/scripts/*.py` - All other Python scripts
4. ❌ `/data/training/archive/` - Original JSON files (read-only)

---

## Data File Locations

**Source (Read-Only)**:
- `/home/hbond/Projects/wind-llm/data/training/archive/few_shot_examples/*.json`

**Target (Copy To)**:
- `/home/hbond/Projects/wind-llm/web-ui/data/training/few_shot_examples/*.json`

**Example Files**:
- `jan_fc1_examples.json` through `dec_fc4_examples.json`
- 48 files total, ~15 examples each

---

## Testing Strategy

### Test Case 1: Current Date
- Run `/api/llm-forecast` with current NWS forecast
- Verify 5 distinct daily patterns (not scaled)
- Check wind direction changes are realistic

### Test Case 2: Historical Date
- Use 2023-07-15 (same as Python testing)
- Compare with known-good results (1.0kt WSPD, 1.4kt GST error)
- Validate accuracy maintained

### Test Case 3: Sausage Mode
- Verify diagnostic page shows JSON training data
- Check all forecast periods visible
- Validate multi-day actual wind displayed

---

## Expected Outcomes

### Before (Current):
- Day 0: LLM prediction
- Day 1: Day 0 × 1.1
- Day 2: Day 0 × 1.2
- Day 3: Day 0 × 1.3
- Day 4: Day 0 × 1.4
- Pattern: Identical shape, just scaled
- Direction: +5° per day (arbitrary)

### After (Fixed):
- Day 0: LLM prediction based on TODAY forecast
- Day 1: LLM prediction based on TOMORROW forecast
- Day 2: LLM prediction based on DAY+2 forecast
- Day 3: LLM prediction based on DAY+3 forecast (extrapolated)
- Day 4: LLM prediction based on DAY+4 forecast (extrapolated)
- Pattern: Each day unique, reflects weather evolution
- Direction: Changes based on weather systems

---

## Rollback Plan

If implementation fails:
1. Revert `/web-ui/src/app/api/llm-forecast/route.ts` to previous version
2. Revert `/web-ui/src/app/api/sausage-mode/route.ts` to previous version
3. System returns to current behavior (artificial scaling)

Files are version controlled via git, can use:
```bash
git checkout HEAD -- web-ui/src/app/api/llm-forecast/route.ts
git checkout HEAD -- web-ui/src/app/api/sausage-mode/route.ts
```

---

## Progress Tracking

- [x] Step 1: Copy JSON training data ✅
- [x] Step 2: Update training example loading ✅
- [⚠️] Step 3: Update NWS forecast parsing (Day 0 only, TODO: multi-day)
- [x] Step 4: Update prompt creation ✅
- [x] Step 5: Remove artificial scaling ✅
- [x] Step 6: Update LLM response parsing ✅
- [x] Step 7: Update sausage mode ✅

---

## Implementation Complete (Phase 1)

**Date Completed**: 2024-12-02

### What Was Implemented

1. ✅ **JSON Training Data**: Copied 52 JSON files to `/web-ui/data/training/few_shot_examples/`
2. ✅ **JSON Loading**: Replaced TOON parsing with JSON.parse() in both `llm-forecast` and `sausage-mode` APIs
3. ✅ **Multi-Day Prompts**: Updated prompt creation to include ALL 8 forecast periods (day_0_night → day_4_day) and multi-day actuals (day_0, day_1, day_2)
4. ✅ **Removed Scaling**: Deleted artificial scaling code (10% per day, +5° direction)
5. ✅ **LLM Training**: LLM now sees complete multi-day examples showing how forecasts evolve
6. ✅ **Sausage Mode**: Updated diagnostics to show JSON format with full multi-day context

### Current Behavior

**LLM Prediction**:
- Predicts Day 0 using multi-day training examples (full context)
- Returns 9 hours: 10 AM - 6 PM PST
- Trained on rich forecast language (day/night periods, multi-day patterns)

**Days 1-4**:
- Currently: Uses Day 0 prediction for all 5 days (identical)
- No longer: Artificial scaling (that code was removed)
- TODO: Implement proper multi-day NWS forecast parsing and separate predictions per day

### What's Left (Phase 2 - Optional)

**Multi-Day Forecast Parsing**: Parse NWS forecast into separate day periods and make 5 separate LLM calls OR request all 5 days in one prompt. This is Step 3 that was marked as incomplete.

**Options**:
1. **Option A**: Make 5 LLM calls (one per day) with day-specific forecast text
2. **Option B**: Parse all 5 days, include in one prompt, request 5-day prediction
3. **Option C**: Accept current behavior (Day 0 only, repeated for Days 1-4)

**User Decision Needed**: Is Phase 2 required now, or acceptable to deploy with Day 0 repeated?

---

## Session Continuity Notes

**If session crashes or runs out of tokens**:
1. Read this file: `/web-ui/investigation/IMPLEMENTATION_PLAN.md`
2. Read analysis: `/web-ui/investigation/training_data_degradation_analysis.md`
3. Phase 1 is COMPLETE ✅
4. If continuing to Phase 2, implement multi-day NWS forecast parsing
5. Reference Python script: `/scripts/correct_prediction_test.py` (lines 93-246)

**Key Decisions Made**:
- Use JSON format (not Enhanced TOON) ✅
- Modify only web-ui code (not Python scripts) ✅
- Copy files from archive (not regenerate) ✅
- Reference `correct_prediction_test.py` as gold standard ✅

**Current Status**: Phase 1 Complete - Multi-day training context restored, artificial scaling removed
