# Wind Forecast Pattern Investigation

> **📅 HISTORICAL DOCUMENT - December 2024**
> **Status**: Investigation identified TOON v1.0 data loss as root cause. **RESOLVED** with TOON v2.0 upgrade.
> **Current Status**: TOON v2.0 preserves all multi-day forecast data. See `CLAUDE.md`.
> **Preserved for**: Historical reference

## Date: December 3, 2024

## Issue Reported
User noticed that forecasted wind patterns appear too regular across days:
- Same hourly pattern repeats day after day
- Wind direction doesn't vary naturally
- Pattern just scales up/down but maintains same shape

## Root Cause Found

**Location:** `/web-ui/src/app/api/llm-forecast/route.ts` Lines 372-387

### The Problem Code:

```javascript
// For now, create 5 days with variations of the base prediction
// In production, you'd want separate forecasts for each day
const allDays: ForecastPrediction[][] = [];

for (let day = 0; day < 5; day++) {
  const dayPredictions = basePredictions.map(pred => ({
    ...pred,
    // Add some variation for future days
    windSpeed: parseFloat((pred.windSpeed * (1 + (day * 0.1))).toFixed(1)),
    gustSpeed: parseFloat((pred.gustSpeed * (1 + (day * 0.1))).toFixed(1)),
    windDirection: (pred.windDirection + (day * 5)) % 360,
    windDirectionText: getWindDirectionText((pred.windDirection + (day * 5)) % 360)
  }));
  allDays.push(dayPredictions);
}
```

## What This Code Does:

1. **LLM generates forecast for ONLY ONE DAY** (today/day 0)
2. **Artificially creates 4 more days** by:
   - Day 0: 1.0x wind speed (original)
   - Day 1: 1.1x wind speed (+10%)
   - Day 2: 1.2x wind speed (+20%)
   - Day 3: 1.3x wind speed (+30%)
   - Day 4: 1.4x wind speed (+40%)
3. **Wind direction**: Simply adds 5 degrees per day (Day 0: +0°, Day 1: +5°, Day 2: +10°, etc.)
4. **Pattern shape**: IDENTICAL across all days - just scaled

## Why This Is Wrong:

### Meteorologically Incorrect:
- Real weather doesn't scale linearly day-by-day
- Wind patterns change based on actual atmospheric conditions
- Direction shifts don't follow simple arithmetic progression
- Completely ignores multi-day NWS forecast data

### Comment Confirms This Is a Hack:
The code literally says: **"For now"** and **"In production, you'd want separate forecasts for each day"**

This was meant to be temporary placeholder code!

## Evidence:

### Current Flow:
1. Fetch NWS forecast (contains multi-day forecast text)
2. Extract inner waters forecast
3. **ONLY use Day 0 forecast text** to generate LLM prediction
4. Create fake Days 1-4 using mathematical formulas
5. Return to frontend

### What Should Happen:
1. Fetch NWS forecast (contains multi-day forecast text)
2. Extract inner waters forecast
3. **Parse EACH day's forecast** (Day 0, Day 1, Day 2, etc.)
4. Generate **separate LLM predictions for each day** based on that day's specific forecast
5. Return actual multi-day predictions to frontend

## Impact:

- User sees unrealistic patterns
- Defeats the purpose of using LLM for forecasting
- Not using the full NWS multi-day forecast data
- Creates misleading "predictions" for future days

## Required Fix:

Need to:
1. Parse the NWS forecast text to extract forecast for EACH day
2. Call LLM separately for each day (or create a multi-day prompt)
3. Remove the artificial scaling code
4. Return actual day-by-day predictions

## Notes:

The training data structure (TOON format) only contains Day 0 examples, which may be why this shortcut was taken. The system was designed for single-day prediction but the UI expects 5 days.

The few-shot examples only train on "today" predictions, so the LLM isn't actually being asked to predict future days - it's being asked to predict today, then that prediction is being artificially extended.
