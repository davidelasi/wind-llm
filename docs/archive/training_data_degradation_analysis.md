# Training Data Degradation Analysis

> **📅 HISTORICAL DOCUMENT - December 2025**
> **Status**: This analysis was conducted before the TOON v2.0 update. The data loss issues described here have been **RESOLVED**.
> **Current Status**: TOON v2.0 now preserves 100% of JSON data (verified). See `CLAUDE.md` for current TOON v2.0 specification and verification results.
> **Preserved for**: Historical reference and understanding of the evolution from TOON v1.0 → v2.0

---

## Executive Summary

**Critical Finding**: The transition from JSON to TOON training data format has fundamentally degraded the model's ability to make multi-day predictions. The original successful testing methodology used rich, multi-day training examples, while the current production system only receives single-day examples. This architectural mismatch forces production code to artificially scale Day 0 predictions, creating unrealistic forecast patterns.

---

## The Original JSON Format (Successful Testing)

### File Structure
**Location**: `/data/training/archive/few_shot_examples/jul_fc4_examples.json`
**Size**: 15 examples per file (48 files total = 720 examples)

### Example Structure
```json
{
  "issued": "2024-06-03T19:59:00-08:00",
  "issuance_time": "19:59",
  "number": 4,
  "complete": true,
  "warnings": null,
  "forecast": {
    "day_0_night": "SW wind 5 to 10 kt, becoming SE after midnight. Seas 3 to 4 ft. Waves: W 3 ft at 9 seconds and S 2 ft at 14 seconds. Patchy fog after midnight.",
    "day_1_day": "SE wind 5 to 10 kt, becoming SW in the afternoon. Seas 3 to 4 ft. Waves: W 2 ft at 8 seconds, SE 2 ft at 8 seconds and S 2 ft at 14 seconds. Patchy fog in the morning.",
    "day_1_night": "SW wind 5 to 10 kt, becoming SE after midnight. Seas 3 ft. Waves: W 2 ft at 8 seconds and SW 2 ft at 13 seconds. Patchy fog after midnight.",
    "day_2_day": "SE wind 5 kt, becoming S in the afternoon. Seas 3 ft. Waves: W 2 ft at 9 seconds and SW 2 ft at 14 seconds. Patchy fog in the morning.",
    "day_2_night": "SW wind 5 to 10 kt, becoming 5 kt after midnight. Seas 3 ft in the evening, then 2 ft or less. Waves: W 2 ft at 9 seconds and SW 2 ft at 14 seconds. Patchy fog in the evening, then patchy dense fog after midnight with vsby 1 NM or less.",
    "day_3_day": "SE wind 5 kt, becoming SW in the afternoon. Seas 3 ft. Waves: W 2 ft at 10 seconds and S 2 ft at 15 seconds. Patchy dense fog in the morning with vsby 1 NM or less.",
    "day_3_night": "W wind 5 to 10 kt, becoming S after midnight. Seas 3 ft. Waves: W 2 ft at 13 seconds and S 2 ft at 15 seconds. Patchy fog after midnight.",
    "day_4_day": "SE wind 5 kt, becoming SW in the afternoon, becoming W in the evening, becoming 5 kt after midnight. Seas 2 ft or less. Waves: W 2 ft at 12 seconds and S 2 ft at 14 seconds. Patchy fog in the morning. Patchy fog after midnight."
  },
  "actual": {
    "day_0": {
      "date": "2024-06-03",
      "hourly": [
        {"hour": "10:00-11:00", "wspd_avg_kt": 3.1, "gst_max_kt": 4.8},
        {"hour": "11:00-12:00", "wspd_avg_kt": 4.0, "gst_max_kt": 6.1},
        {"hour": "12:00-13:00", "wspd_avg_kt": 5.5, "gst_max_kt": 8.0},
        // ... 8 hours total
      ]
    },
    "day_1": {
      "date": "2024-06-04",
      "hourly": [
        {"hour": "10:00-11:00", "wspd_avg_kt": 2.6, "gst_max_kt": 4.0},
        {"hour": "11:00-12:00", "wspd_avg_kt": 3.5, "gst_max_kt": 4.9},
        // ... 8 hours total
      ]
    },
    "day_2": {
      "date": "2024-06-05",
      "hourly": [
        // ... 8 hours total
      ]
    }
  }
}
```

### What the LLM Learned From JSON Format

**Multi-Day Forecast Evolution**: The LLM saw how NWS forecasts describe weather patterns across multiple days:
- Day 0: Current conditions with immediate changes
- Day 1: Next-day patterns often different from Day 0
- Day 2-4: Extended outlook with evolving conditions

**Linguistic Patterns**:
- Temporal cues: "this afternoon", "after midnight", "in the evening"
- Transitions: "becoming", "then", "continuing"
- Confidence indicators: "possibly", "likely", "becoming"
- Weather context: sea state, wave periods, fog/visibility

**Multi-Day Actual Wind Patterns**: The LLM learned relationships between multi-day forecasts and multi-day outcomes:
- How Day 1 conditions differ from Day 0
- Patterns of build-up or decay over multiple days
- Thermal cycle variations day-to-day

**Result**: 1.0kt WSPD error, 1.4kt GST error on test case (2023-07-15)

---

## The Current TOON Format (Production)

### File Structure
**Location**: `/data/training/few_shot_examples_toon/jul_fc2_examples.toon`
**Size**: 15 lines per file (48 files total = 720 examples)

### Example Structure
```
SE wind 5 to 10 kt, becoming SW this afternoon. Seas 3 to 4 ft. Waves: W 2 ft at 8 seconds and SW 2 ft at 13 seconds. Patchy fog this morning.|3.1,4.0,5.5,6.4,7.8,8.0,8.3,8.7|4.8,6.1,8.0,8.2,10.3,11.0,11.8,11.8
```

**Format**: `day_0_forecast_text|wspd1,wspd2,...,wspd8|gst1,gst2,...,gst8`

### What Was Lost in TOON Format

**1. Multi-Day Forecast Context** ❌
- MISSING: day_0_night, day_1_day, day_1_night, day_2_day, day_2_night, day_3_day, day_3_night, day_4_day
- KEPT: Only day_0_day forecast text

**2. Multi-Day Actual Wind Data** ❌
- MISSING: day_1 and day_2 actual wind measurements
- KEPT: Only day_0 actual measurements (8 hours)

**3. Metadata** ❌
- MISSING: Issued timestamp, forecast number, warnings, completeness flag
- This context helps LLM understand forecast timing and reliability

**4. Structured Data Format** ❌
- MISSING: JSON structure with clear field labels
- KEPT: Pipe-delimited format (harder to parse, no field names)

### Impact on LLM Learning

**The LLM Never Sees**:
- How day_1_day forecasts differ linguistically from day_0_day
- How wind patterns evolve from Day 0 → Day 1 → Day 2
- Relationships between multi-day forecast text and multi-day outcomes
- Temporal patterns across days (e.g., frontal passages, pressure system movements)

**The LLM Can Only Learn**:
- Day 0 single-day predictions
- Immediate within-day wind build-up patterns (10 AM → 6 PM)
- Basic NWS forecast language interpretation for TODAY ONLY

**Result**: Production code MUST artificially scale Day 0 to create Days 1-4

---

## The Prompt Comparison

### Original Python Script Prompt (`correct_prediction_test.py`)

**Line 197-246**: Creates comprehensive prompt

```python
def create_comprehensive_prompt(examples, forecast_info, test_date_str):
    prompt = "You are a wind forecasting expert. Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots for the daytime hours.\n\n"
    prompt += f"Here are {len(examples)} examples showing how to interpret forecasts and actual outcomes:\n\n"

    # Add ALL examples
    for i, example in enumerate(examples, 1):
        prompt += f"=== EXAMPLE {i} ===\n"
        prompt += "FORECAST:\n"

        forecast = example.get('forecast', {})
        for period, text in forecast.items():  # ← ALL PERIODS INCLUDED
            prompt += f"{period}: {text}\n"

        prompt += "\nACTUAL WIND CONDITIONS:\n"

        actual = example.get('actual', {})
        for day in ['day_0', 'day_1', 'day_2']:  # ← MULTI-DAY ACTUALS
            if day in actual and 'hourly' in actual[day]:
                date = actual[day].get('date', 'Unknown')
                prompt += f"{day} ({date}):\n"

                hourly_data = actual[day]['hourly']
                for hour_data in hourly_data:
                    hour = hour_data.get('hour', '')
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    gst = hour_data.get('gst_max_kt', 0)
                    prompt += f"  {hour}: WSPD {wspd:.1f}kt, GST {gst:.1f}kt\n"
                prompt += "\n"
```

**What This Teaches the LLM**:
- 15 complete examples with FULL multi-day forecast text
- FULL multi-day actual wind outcomes (day_0, day_1, day_2)
- Clear pattern: "This is what a 3-day forecast looks like, and here's how it played out"
- LLM learns temporal evolution of weather patterns

### Current Production Prompt (`/api/sausage-mode/route.ts`)

**Line 181-243**: Creates few-shot prompt from TOON

```typescript
function createFewShotPrompt(forecastText: string, examples: TrainingExample[]): string {
  const systemPrompt = `You are an expert wind forecasting system for ocean sports at AGXC1 station (Los Angeles area).

Your task is to predict hourly wind speed (WSPD), gust speed (GST), and wind direction for 11 AM - 6 PM PST based on NWS coastal forecasts.
...
Here are examples of how NWS forecasts translate to actual conditions:
`;

  let examplesText = '';
  examples.slice(0, 15).forEach((example, index) => {
    examplesText += `EXAMPLE ${index + 1}:\n`;
    examplesText += `NWS Forecast: "${example.forecast.day_0_day || 'No forecast text'}"\n`;  // ← ONLY DAY 0
    examplesText += `Actual Conditions:\n`;

    example.actual.day_0.hourly.forEach(hourlyData => {  // ← ONLY DAY 0
      const hour = parseInt(hourRange.split(':')[0]);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

      examplesText += `  ${displayHour} ${ampm}: Wind ${hourlyData.wspd_avg_kt}kt, Gust ${hourlyData.gst_max_kt}kt\n`;
    });
    examplesText += '\n';
  });
```

**What This Teaches the LLM**:
- 15 examples with ONLY Day 0 forecast text
- ONLY Day 0 actual wind outcomes (8 hours)
- Pattern: "Given today's forecast, predict today's wind"
- NO information about how tomorrow or day after tomorrow differ
- LLM has NO basis to predict Days 1-4

---

## The Production Code Hack

### Current Implementation (`/api/llm-forecast/route.ts`, Lines 372-387)

```typescript
// For now, create 5 days with variations of the base prediction
// In production, you'd want separate forecasts for each day
const allDays: ForecastPrediction[][] = [];

for (let day = 0; day < 5; day++) {
  const dayPredictions = basePredictions.map(pred => ({
    ...pred,
    // Add some variation for future days
    windSpeed: parseFloat((pred.windSpeed * (1 + (day * 0.1))).toFixed(1)),  // +10% per day
    gustSpeed: parseFloat((pred.gustSpeed * (1 + (day * 0.1))).toFixed(1)),
    windDirection: (pred.windDirection + (day * 5)) % 360,  // +5° per day
    windDirectionText: getWindDirectionText((pred.windDirection + (day * 5)) % 360)
  }));
  allDays.push(dayPredictions);
}
```

**The Mathematical Scaling**:
- Day 0: 1.0x (LLM prediction)
- Day 1: 1.1x (+10% wind speed)
- Day 2: 1.2x (+20% wind speed)
- Day 3: 1.3x (+30% wind speed)
- Day 4: 1.4x (+40% wind speed)
- Direction: +5° per day

**Why This Exists**: Because the TOON training data only contains Day 0 examples, the LLM can ONLY predict Day 0. The production code has no choice but to fake Days 1-4.

**Why This Is Bad**:
1. **Unrealistic Patterns**: All 5 days have identical shape, just scaled
2. **Ignores Weather Systems**: Real weather changes - fronts pass, pressure systems move
3. **No Directional Realism**: Wind direction doesn't just shift +5° per day
4. **User-Visible Problem**: "The forecasted wind pattern appears so regular for the forecasted days"

---

## Root Cause Analysis

### Timeline of Degradation

1. **Original Design** (Python scripts):
   - Full JSON training data with multi-day examples
   - Successful testing: 1.0kt WSPD error, 1.4kt GST error
   - Training pipeline includes days 0, 1, 2

2. **TOON Format Introduction** (Unknown date):
   - Created for... compactness? Performance? Unclear reasoning.
   - Stripped multi-day forecast context
   - Stripped multi-day actual wind data
   - Reduced to: `forecast|wspd_nums|gst_nums`

3. **Production Implementation** (Current):
   - Uses TOON format for training
   - LLM can only predict Day 0
   - Code artificially scales to create Days 1-4
   - Users notice unrealistic patterns

### Why TOON Format Was Created

**Speculation** (not documented):
- **File size reduction?** JSON: ~42KB per file, TOON: smaller
- **Parsing simplicity?** Easier to parse pipe-delimited format
- **Performance?** Faster to load/process
- **Misunderstanding?** Did creator not realize multi-day context was critical?

**The Fatal Mistake**: Whoever created TOON format didn't understand that multi-day forecast examples are ESSENTIAL for multi-day predictions. They optimized for the wrong thing.

---

## Impact Assessment

### Accuracy Degradation

**Original (JSON-based)**:
- Test case 2023-07-15: 1.0kt WSPD error, 1.4kt GST error
- LLM understood "variable becoming SW 10kt" pattern
- Captured morning calm → afternoon build correctly

**Current (TOON-based)**:
- Day 0: Likely similar accuracy (same training for Day 0)
- Days 1-4: COMPLETELY FAKE - just mathematical scaling
- No weather-based prediction for future days
- Cannot capture weather system evolution

### User Experience Impact

**Observable Issues**:
- "The forecasted wind pattern appears so regular"
- "Same pattern shape day by day"
- "Wind direction does not change realistically"
- Loss of forecast value for planning multi-day activities

### Technical Debt

**Current State**:
- Training data format doesn't match production requirements
- Code contains explicit "hack" comments
- Scaling algorithm is arbitrary (why 10% per day?)
- No scientific basis for the scaling factors

---

## Comparison Table

| Aspect | Original JSON Format | Current TOON Format |
|--------|---------------------|---------------------|
| **Multi-day forecasts** | ✅ All 8 periods (day_0_night → day_4_day) | ❌ Only day_0_day |
| **Multi-day actuals** | ✅ day_0, day_1, day_2 with full hourly data | ❌ Only day_0 |
| **Metadata** | ✅ Issued time, forecast number, warnings | ❌ None |
| **Linguistic richness** | ✅ Full NWS language for all periods | ⚠️ Only Day 0 text |
| **LLM can learn** | ✅ Multi-day pattern evolution | ❌ Only single-day prediction |
| **Production output** | ✅ Real predictions for Days 0-4 | ❌ Day 0 real, Days 1-4 fake |
| **File size** | ~42KB per JSON file | Smaller (~5-10KB?) |
| **Parsing complexity** | JSON parsing (built-in) | Custom pipe-delimiter parsing |
| **Accuracy potential** | 🎯 High (proven 1.0kt WSPD error) | ⚠️ Day 0 only, Days 1-4 unknown |

---

## Recommended Path Forward

### Option A: Return to JSON Format (RECOMMENDED)

**Pros**:
- Proven successful (1.0kt WSPD, 1.4kt GST error)
- Complete multi-day context
- Already have the data (archive folder)
- Minimal code changes (revert to original approach)

**Cons**:
- Slightly larger file sizes (~42KB vs ~10KB)
- JSON parsing overhead (negligible)

**Implementation**:
1. Copy JSON files from `/data/training/archive/few_shot_examples/` to active location
2. Update `/api/llm-forecast/route.ts` to use JSON format
3. Parse multi-day forecasts from NWS source
4. Update prompt to include ALL forecast periods
5. Request 5-day prediction from LLM in single call
6. Remove artificial scaling code (lines 372-387)

**Estimated Effort**: 4-6 hours

---

### Option B: Enhanced TOON Format

**Concept**: Keep TOON format but add multi-day data

**New Format**:
```
D0_DAY: forecast_text | D0_NIGHT: forecast_text | D1_DAY: forecast_text | ...
D0: wspd1,wspd2,...|gst1,gst2,...
D1: wspd1,wspd2,...|gst1,gst2,...
D2: wspd1,wspd2,...|gst1,gst2,...
```

**Pros**:
- Keeps compact format
- Adds back critical multi-day context

**Cons**:
- Requires recreating ALL 48 TOON files
- Custom parsing logic
- Why not just use JSON?

**Implementation**:
1. Write script to convert JSON → Enhanced TOON
2. Update TOON parser in production code
3. Test with new format

**Estimated Effort**: 8-12 hours (higher risk)

---

### Option C: Separate LLM Calls Per Day

**Concept**: Make 5 LLM calls, one per day, using Day 0 examples for all

**Pros**:
- Can use existing TOON format
- Each day gets fresh prediction
- Better than current scaling

**Cons**:
- 5x API cost (~$0.05 per forecast update)
- Still doesn't teach LLM multi-day patterns
- Each day predicted independently (no continuity)

**Implementation**:
1. Parse NWS forecast into 5 separate day forecasts
2. Call LLM 5 times with day-specific forecast text
3. Use existing Day 0 training examples for all calls
4. Combine results

**Estimated Effort**: 6-8 hours

---

### Option D: Hybrid JSON + Single Prompt

**Concept**: Use JSON format, parse full 5-day NWS forecast, ask for all 5 days in one prompt

**Pros**:
- One LLM call (cost-effective)
- Uses proven JSON training data
- LLM sees multi-day examples
- Can extrapolate to Days 3-4 even without direct training

**Cons**:
- Days 3-4 predictions may be less accurate (fewer training examples)
- Longer prompt (higher token cost, but still cheaper than 5 calls)

**Implementation**:
1. Return to JSON format
2. Parse full 5-day NWS forecast
3. Create prompt showing multi-day examples
4. Request 5-day prediction in single LLM call

**Estimated Effort**: 6-8 hours

---

## Final Recommendation

**OPTION A: Return to JSON Format**

This is the clear winner because:

1. **Proven Success**: Already tested and validated (1.0kt WSPD, 1.4kt GST error)
2. **Data Already Exists**: Archive folder has complete JSON files
3. **Lowest Risk**: We're reverting to known-good implementation
4. **Best Architecture**: Proper data format for the problem domain
5. **Minimal Effort**: Copy files, update parsing, remove hack

**Implementation Priority**:
1. **Phase 1 (Immediate)**: Copy JSON files to production location
2. **Phase 2 (This week)**: Update API code to parse JSON format
3. **Phase 3 (This week)**: Remove artificial scaling code
4. **Phase 4 (Next week)**: Implement multi-day NWS forecast parsing
5. **Phase 5 (Next week)**: Update prompt to request all 5 days
6. **Phase 6 (Testing)**: Validate accuracy across multiple test dates

**Expected Outcome**:
- Days 0-2: High accuracy (trained on multi-day examples)
- Days 3-4: Good accuracy (LLM can extrapolate from patterns)
- Realistic wind direction changes
- Proper weather system evolution
- User-visible improvement: "Forecasts now show realistic day-to-day variation"

---

## Lessons Learned

### For Future Development

1. **Preserve Context**: Never optimize file size at the expense of training quality
2. **Document Decisions**: Why was TOON created? We don't know.
3. **Test Before Deploying**: TOON format was never validated against JSON
4. **Match Training to Production**: If you need 5-day forecasts, train with 5-day examples
5. **Beware Premature Optimization**: JSON parsing is not a bottleneck

### Questions to Answer

1. Who created TOON format and when?
2. What was the original motivation?
3. Was accuracy tested before switching from JSON?
4. Why weren't multi-day examples included?

---

## TOON vs JSON: The Token Efficiency Question

### User's Valid Point

**Question**: "Cannot we simply make the same structure that we had in JSON in TOON, without compressing the information? My understanding is that TOON is more efficient token-wise but it can include exactly the same information."

**Answer**: Yes, absolutely correct! Enhanced TOON can include all information and is more token-efficient.

### Token Efficiency Comparison

**JSON Format** (15 examples):
- ~180 tokens per example × 15 = **2,700 input tokens**
- Overhead: `{}`, `[]`, `""`, field names, indentation
- 3 updates/day = 8,100 tokens/day = ~$0.03/day

**Enhanced TOON Format** (15 examples):
- ~110 tokens per example × 15 = **1,650 input tokens**
- Overhead: Minimal (pipes, colons, commas only)
- 3 updates/day = 4,950 tokens/day = ~$0.018/day

**Savings**: ~40% fewer tokens = **$4.38/year savings**

### Enhanced TOON Format Design

If we pursued this path, format would be:

```
# Example 1
FORECAST_PERIODS: D0_NIGHT: SW wind 5-10kt... | D1_DAY: SE wind 5-10kt... | D1_NIGHT: SW wind 5-10kt... | D2_DAY: SE wind 5kt... | D2_NIGHT: SW wind 5-10kt... | D3_DAY: SE wind 5kt... | D3_NIGHT: W wind 5-10kt... | D4_DAY: SE wind 5kt...
D0_WSPD: 3.1,4.0,5.5,6.4,7.8,8.0,8.3,8.7
D0_GST: 4.8,6.1,8.0,8.2,10.3,11.0,11.8,11.8
D1_WSPD: 2.6,3.5,5.0,5.4,7.4,7.8,9.1,9.0
D1_GST: 4.0,4.9,6.3,8.2,8.9,9.3,10.6,10.8
D2_WSPD: 3.0,4.2,6.1,7.8,8.2,7.5,7.0,6.5
D2_GST: 4.5,5.8,7.9,9.2,10.1,9.4,8.8,8.2
```

**Advantages**:
- Token efficient (~40% savings)
- Human-readable line format
- Includes all multi-day data
- Compact yet complete

**Disadvantages**:
- Custom parsing logic needed
- Must regenerate all 48 files
- Needs validation/testing
- 8-12 hours implementation vs 4-6 hours for JSON

### Final Decision: JSON First, Enhanced TOON Later

**Rationale**:
1. **Data exists**: Archive has 48 complete JSON files, zero regeneration needed
2. **Proven format**: Tested 1.0kt WSPD, 1.4kt GST error
3. **Lower risk**: Standard format, built-in parsing
4. **Faster**: 4-6 hours vs 8-12 hours
5. **Cost negligible**: $4/year savings not material for MVP

**Future Optimization Path**:
- Phase 1: Implement JSON (get multi-day working NOW)
- Phase 2: Validate accuracy restored
- Phase 3: Optionally convert to Enhanced TOON as optimization

This hybrid approach gets the fix deployed quickly while leaving door open for future optimization.

---

## Conclusion

The TOON format represents a **fundamental architectural mistake** that degraded the wind forecasting system from a proven, accurate multi-day predictor to a single-day predictor with artificial scaling. The solution is straightforward: **return to the JSON format that was proven successful**.

The user's observation that "the forecasted wind pattern appears so regular" is not an LLM limitation - it's a direct consequence of training data that only contains single-day examples, forcing production code to fake multi-day predictions through mathematical scaling.

**Bottom Line**: We trained a single-day model, then asked it to make 5-day predictions. This was doomed to fail. The fix is to train with multi-day data (which we already have) and ask for multi-day predictions (which LLMs can easily do).

**Implementation Decision**: Use JSON format for immediate fix (4-6 hours), with option to optimize to Enhanced TOON format later if token efficiency becomes important.
