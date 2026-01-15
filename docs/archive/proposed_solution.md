# Proposed Solution for Multi-Day Forecast Issue

> **📅 HISTORICAL DOCUMENT - December 2024**
> **Status**: Proposed solution for TOON v1.0 limitations. **RESOLVED** via TOON v2.0 upgrade.
> **Current Status**: TOON v2.0 preserves all forecast periods and multi-day data. See `CLAUDE.md`.
> **Preserved for**: Historical reference and problem-solving approach documentation

## Problem Summary
The current LLM forecast only generates predictions for Day 0 (today), then artificially creates Days 1-4 using mathematical scaling. This creates unrealistic, repetitive patterns.

## Why This Happened

Looking at the training data structure (TOON format), the examples only contain Day 0 predictions:

```typescript
interface TrainingExample {
  forecast: {
    day_0_day: string;    // ✅ Has data
    day_0_night: string;  // ✅ Has data
    day_1_day: string;    // ❌ Empty
    day_1_night: string;  // ❌ Empty
    day_2_day: string;    // ❌ Empty
    // ... etc
  };
  actual: {
    day_0: {              // ✅ Only Day 0 actuals
      hourly: [...]
    }
  };
}
```

The training data was designed for **single-day prediction**, but the UI expects **5-day forecasts**.

## Solution Options

### Option 1: Multi-Day Training Data (IDEAL - but requires data work)

**Pros:**
- Most accurate
- LLM learns patterns across multiple days
- Accounts for how Day 1 forecast differs from Day 0

**Cons:**
- Requires rebuilding training dataset with multi-day actual wind data
- Need to align multi-day NWS forecasts with multi-day actual measurements
- More complex data processing

**Implementation:**
1. Update `generate_training_data.py` to include Day 1-4 actual wind data
2. Match NWS multi-day forecasts with corresponding multi-day actuals
3. Retrain few-shot examples with this multi-day structure
4. Update LLM prompt to request multi-day predictions

### Option 2: Separate LLM Calls Per Day (QUICKEST FIX)

**Pros:**
- Uses existing single-day training data
- Can implement immediately
- Each day gets independent prediction

**Cons:**
- More API calls to Claude (5x the cost)
- Doesn't account for inter-day patterns
- Each prediction is independent (might not show continuity)

**Implementation:**
1. Parse NWS forecast to extract text for each day
2. Call LLM 5 times (once per day) with day-specific forecast text
3. Use existing Day 0 examples for all calls
4. Combine results into 5-day forecast

### Option 3: Single Prompt with Multi-Day Request (COMPROMISE)

**Pros:**
- One LLM call (cost-effective)
- Can request all 5 days at once
- Better than current scaling hack

**Cons:**
- Training examples only show Day 0, so LLM has to extrapolate
- May still produce somewhat regular patterns without multi-day training

**Implementation:**
1. Parse NWS forecast to extract all days
2. Create prompt requesting predictions for all 5 days
3. Include Day 0-4 forecast text in the prompt
4. Let LLM predict all days in one response

## Recommended Approach

### Phase 1: Quick Fix (Option 2)
Implement separate LLM calls per day using existing infrastructure:

```typescript
async function generateMultiDayForecast(nwsForecastText: string): Promise<ForecastPrediction[][]> {
  const forecastDays = parseMultiDayForecast(nwsForecastText); // Parse NWS forecast by day
  const allDayPredictions: ForecastPrediction[][] = [];

  for (let day = 0; day < 5; day++) {
    const dayForecastText = forecastDays[day] || forecastDays[0]; // Fallback to Day 0 if missing
    const examples = await loadTrainingExamples(); // Use Day 0 examples for all
    const prompt = createFewShotPrompt(dayForecastText, examples);

    const prediction = await callClaudeAPI(prompt);
    allDayPredictions.push(prediction);
  }

  return allDayPredictions;
}
```

### Phase 2: Proper Solution (Option 1)
Build multi-day training dataset:

1. **Data Collection:**
   - Extend wind data processing to create D+1, D+2, D+3, D+4 summaries
   - For each historical NWS forecast, match with actual wind data for all 5 days
   - Create training examples showing how multi-day forecasts played out

2. **Training Data Format:**
   ```json
   {
     "forecast": {
       "issued_date": "2023-07-15",
       "day_0_text": "TODAY...SW 10-15kt",
       "day_1_text": "SATURDAY...W 15-20kt",
       "day_2_text": "SUNDAY...NW 8-12kt",
       ...
     },
     "actual": {
       "day_0": { "hourly": [...] },
       "day_1": { "hourly": [...] },
       "day_2": { "hourly": [...] },
       ...
     }
   }
   ```

3. **LLM Prompt:**
   - Show examples of how multi-day forecasts evolved
   - Request predictions for all 5 days
   - Include context about weather patterns across days

## NWS Forecast Structure

The NWS coastal forecast already contains multi-day information:

```
.TODAY...SW winds 10 to 15 kt.
.TONIGHT...SW winds 5 to 10 kt.
.SATURDAY...W winds 15 to 20 kt.
.SATURDAY NIGHT...NW winds 10 to 15 kt.
.SUNDAY...NW winds 8 to 12 kt.
```

We just need to parse and use this properly!

## Implementation Priority

1. **IMMEDIATE (This Week):** Remove the scaling hack, implement Option 2
2. **SHORT-TERM (Next Month):** Create multi-day training dataset
3. **LONG-TERM:** Fine-tune model specifically for multi-day wind forecasting

## Testing the Fix

After implementing, verify:
1. Each day has different wind pattern shape (not just scaled)
2. Wind direction changes align with weather systems
3. Predictions match NWS forecast intent for each specific day
4. Patterns show realistic variation (e.g., fronts, pressure changes)

## Cost Implications

- Current: 1 API call per forecast update
- Option 2: 5 API calls per forecast update (5x cost, but still cheap ~$0.05 per update)
- Option 3: 1 API call but longer prompt (slightly higher token cost)
