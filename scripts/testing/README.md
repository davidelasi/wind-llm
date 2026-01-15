# 2025 Forecast Testing Scripts

This directory contains scripts for testing wind forecasts against 2025 actual data using the validated few-shot methodology.

## Scripts

### `test_2025_forecast.py` - Single Date Test

Tests a wind forecast for any specific date in 2025.

**Usage:**
```bash
# Basic test (generates prompt only)
python3 test_2025_forecast.py 2025-07-15

# With LLM API call
python3 test_2025_forecast.py 2025-07-15 --call-llm --anthropic-api-key sk-ant-...

# Using environment variable for API key
export ANTHROPIC_API_KEY=sk-ant-...
python3 test_2025_forecast.py 2025-07-15 --call-llm
```

**Can be imported for programmatic use:**
```python
from test_2025_forecast import run_forecast_test

result = run_forecast_test(
    '2025-07-15',
    anthropic_api_key='sk-ant-...',
    call_llm=True,
    verbose=True
)

# Access results
print(f"Actual conditions: {result['actual_conditions']}")
print(f"Forecast: {result['forecast_info']}")
print(f"LLM response: {result['llm_response']}")
```

**What it does:**
1. Finds the NWS forecast issued on the test date (prefers morning forecasts)
2. Loads appropriate training examples based on month and forecast number
3. Extracts actual wind conditions from wind_2025_processed.txt (10 AM - 6 PM)
4. Creates comprehensive prompt including ALL training examples and any warnings
5. Optionally calls Anthropic API for LLM prediction
6. Saves prompt and response to data/testing/prompts/

**Key Features:**
- ✅ Uses validated few-shot methodology
- ✅ Includes warnings from both forecast and training examples
- ✅ Aggregates 6-minute measurements into hourly data
- ✅ Forecasts until 6 PM (18:00) PST
- ✅ Can be called from other scripts for batch testing
- ✅ Proper data isolation (no contamination between test and training)

---

### `batch_test_2025.py` - Multiple Date Testing

Runs forecast tests across multiple dates and compiles results.

**Usage:**
```bash
# Test a date range
python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-31

# Test every 7 days
python3 batch_test_2025.py --start-date 2025-01-01 --end-date 2025-09-30 --step 7

# Test specific dates from a file
python3 batch_test_2025.py --dates-file my_test_dates.txt

# With LLM calls (requires API key)
python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-10 --call-llm
```

**Date file format (one date per line):**
```
2025-07-15
2025-07-20
2025-08-01
# Comments start with #
2025-08-15
```

**What it does:**
1. Runs test_2025_forecast.py for each date
2. Compiles results including success/failure status
3. Calculates aggregate statistics (wind speed ranges, etc.)
4. Saves detailed results to JSON
5. Prints summary report

**Output:**
- JSON file with all results: `data/testing/batch_results/batch_test_results_YYYYMMDD_HHMMSS.json`
- Summary statistics printed to console
- Individual prompts saved for each test

---

## Directory Structure

```
scripts/testing/
├── README.md                    # This file
├── test_2025_forecast.py       # Single date test script
└── batch_test_2025.py          # Batch testing script

data/testing/
├── prompts/                     # Generated prompts for each test
│   ├── forecast_test_20250715.txt
│   ├── response_20250715.txt    # LLM responses (if --call-llm used)
│   └── ...
└── batch_results/               # Batch test result files
    ├── batch_test_results_20251204_062045.json
    └── ...
```

## Data Sources

**All tests use the validated methodology:**

1. **Forecast Data**: `data/cleaned/inner_waters_forecasts_relative_periods.txt`
   - Contains NWS coastal forecasts with relative day periods (D0_DAY, D1_DAY, etc.)
   - Separate from training data to prevent contamination

2. **Training Examples**: `data/training/few_shot_examples/<month>_fc<N>_examples.json`
   - 15 curated examples per file
   - Matched to test date by month and forecast number
   - Includes examples with various wind strengths and warnings

3. **Actual Wind Data**: `data/cleaned/wind_2025_processed.txt`
   - Processed 2025 wind measurements from AGXC1 buoy
   - Hourly aggregates: 10 AM - 6 PM PST
   - WSPD: Average of 6-minute measurements
   - GST: Maximum value per hour

## Important Notes

### Time Range
- **Forecast Period**: D0_DAY covers daytime hours
- **Wind Data**: 10 AM - 6 PM PST (9 hours)
- **Aggregation**: 6-minute raw measurements → hourly averages/maximums

### Warnings
- Both forecast and training examples include warning text (e.g., "Small Craft Advisory")
- Warnings are explicitly passed to the LLM in the prompt
- Important for pattern recognition (advisories often correlate with stronger winds)

### Model Configuration
- Uses settings from `config/model_config.json`
- Default: Claude Sonnet 4, temperature=1.0, max_tokens=2500
- Can be modified centrally without code changes

### API Usage
- LLM calls are optional (off by default)
- Requires ANTHROPIC_API_KEY environment variable or --anthropic-api-key argument
- Prompts are always saved regardless of whether LLM is called
- Useful for reviewing prompts before spending API credits

## Example Workflows

### 1. Generate prompts for review (no API calls)
```bash
# Test July 2025
python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-31

# Review prompts in data/testing/prompts/
# Make adjustments if needed
```

### 2. Run full validation with LLM
```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Test every week in available data
python3 batch_test_2025.py \
    --start-date 2025-01-01 \
    --end-date 2025-09-30 \
    --step 7 \
    --call-llm

# Review results in data/testing/batch_results/
```

### 3. Test specific high-wind days
```bash
# Create dates file
cat > high_wind_dates.txt <<EOF
2025-07-15
2025-08-03
2025-09-12
EOF

# Run tests
python3 batch_test_2025.py --dates-file high_wind_dates.txt --call-llm
```

### 4. Programmatic testing
```python
from test_2025_forecast import run_forecast_test

# Test a single date
result = run_forecast_test('2025-07-15', verbose=False)

if result:
    actual = result['actual_conditions']
    forecast = result['forecast_info']

    # Custom analysis
    avg_wspd = sum(d['wspd_avg_kt'] for d in actual) / len(actual)
    print(f"Average wind: {avg_wspd:.1f}kt")

    if forecast.get('warnings'):
        print(f"Warning issued: {forecast['warnings']}")
```

## Validation Results

**2023-07-15 Test (Validation Case):**
- Average WSPD error: 1.0kt
- Average GST error: 1.4kt
- Pattern recognition: ✅ Successfully captured timing of afternoon wind build

**Expected 2025 Performance:**
- Similar accuracy range (1-2kt error)
- Better performance on days with clear forecast patterns
- Higher uncertainty on transitional/light wind days

## Troubleshooting

**"No forecast found for date":**
- Check that the date is in 2025
- Verify forecast file contains data for that date
- Try dates around July-September (most reliable 2025 data)

**"No wind data found":**
- Check wind_2025_processed.txt exists in data/cleaned/
- Verify the date has measurements in the 10 AM - 6 PM window
- 2025 data currently available through September

**"Examples file not found":**
- Verify few_shot_examples directory exists
- Check that the month has a curated examples file
- Currently available: All months with fc1-fc4 forecast numbers

**Import errors:**
- Ensure you're in the project root directory
- Python path must include scripts/testing/
- Or use absolute paths when importing

## Future Enhancements

- [ ] Automated error metric calculation (parse LLM response vs actual)
- [ ] Visualization of forecast accuracy over time
- [ ] Confidence intervals for predictions
- [ ] Wind direction prediction integration
- [ ] Extended forecast periods (D+1, D+2)
- [ ] Comparison with NWS raw forecast accuracy
