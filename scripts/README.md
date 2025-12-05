# Wind Forecasting Data Processing Scripts

## 📁 Directory Structure

The scripts are organized into logical folders for better maintenance and clarity:

```
scripts/
├── processing/          # Core data pipeline scripts
├── training/           # ML/training related scripts
├── analysis/           # Analysis & debugging tools
├── utilities/          # Batch operations and utilities
├── testing/            # 2025 forecast testing scripts
├── archive/            # Legacy/testing scripts
├── variance_test.py    # Model variance testing (active development)
└── README.md           # This file
```

## 🏭 processing/ - Core Data Pipeline Scripts

### Master Processing Pipelines

**`process_wind_data.py`** - Consolidated wind data processing pipeline
```bash
# Basic usage
python3 processing/process_wind_data.py <input_files_or_directory> [output_dir]

# Examples
python3 processing/process_wind_data.py ../data/raw/wind/2024.txt
python3 processing/process_wind_data.py ../data/raw/wind/ ../data/cleaned/
```

**What it does:**
1. Converts GMT timestamps to PST ISO 8601 format
2. Filters relevant columns (WDIR, WSPD, GST, PRES, ATMP)
3. Validates data and removes invalid measurements
4. Converts wind speeds from m/s to knots
5. Aggregates hourly measurements for 10 AM - 7 PM PST
6. Identifies complete days for training

**Outputs:**
- `*_pst_timestamps.txt` - Timestamp converted file
- `*_processed.txt` - Filtered and validated wind data
- `*_complete_days.txt` - List of complete measurement days

---

**`process_forecast_data.py`** - Consolidated forecast data processing pipeline
```bash
# Basic usage
python3 processing/process_forecast_data.py <input_file> [output_dir]

# Example
python3 processing/process_forecast_data.py ../data/raw/forecasts/coastal_waters_2019_2025.txt ../data/cleaned/
```

**What it does:**
1. Analyzes forecast data for corruption patterns
2. Identifies and skips corrupted forecasts
3. Converts day-of-week periods to relative format (D0_DAY, D1_NIGHT, etc.)
4. Extracts and formats weather warnings
5. Generates corruption reports
6. Outputs clean, LLM-ready forecast data

**Outputs:**
- `*_relative_periods.txt` - Processed forecast file
- `invalid_forecast_dates.txt` - List of corrupted forecasts to exclude
- `corrupted_forecasts_report.txt` - Detailed corruption analysis

### Supporting Utilities

**`convert_timestamps.py`** - Convert forecast timestamps to PST ISO format
**`convert_wind_timestamps.py`** - Convert wind data timestamps from GMT to PST
**`convert_forecast_periods.py`** - Convert day-of-week to relative day format
**`filter_wind_columns.py`** - Extract relevant wind measurement columns
**`filter_inner_waters.py`** - Extract Inner Waters forecasts from raw data

## 🤖 training/ - ML/Training Related Scripts

**`generate_training_data.py`** - LLM training data generation
```bash
python3 training/generate_training_data.py
```

**What it does:**
- Combines forecast data with actual wind measurements
- Creates JSON format suitable for LLM training
- Validates data completeness and quality
- Outputs: `data/training/training_examples.json`

---

**`curate_few_shot_examples.py`** - Few-shot example curation
```bash
python3 training/curate_few_shot_examples.py
```

**What it does:**
- Creates 48 monthly/forecast-number specific example files
- Implements wind strength targets (4 calm, 8 moderate, 3 strong)
- Ensures temporal and year diversity
- Each file contains 15 carefully selected examples
- Outputs: `data/training/few_shot_examples/*.json`

---

**`identify_complete_days.py`** - Find days with complete hourly wind data
```bash
python3 training/identify_complete_days.py <processed_wind_file>
```

**What it does:**
- Essential for selecting high-quality training examples
- Identifies complete 10AM-7PM data windows
- Validates data integrity for each day

## 🔍 analysis/ - Analysis & Debugging Tools

**`validate_processed_data.py`** - Data quality validation and verification
```bash
python3 analysis/validate_processed_data.py <processed_file>
```

**`analyze_specific_forecast.py`** - Deep dive analysis of individual forecasts
```bash
python3 analysis/analyze_specific_forecast.py <date>
```

**`diagnose_corrupted_forecasts.py`** - Identify data corruption patterns
```bash
python3 analysis/diagnose_corrupted_forecasts.py <forecast_file>
```

**`diagnose_day_offsets.py`** - Debug relative day assignment issues
```bash
python3 analysis/diagnose_day_offsets.py <forecast_file>
```

## ⚙️ utilities/ - Batch Operations & Utilities

**`batch_process_wind_data.py`** - Bulk wind data processing across years
```bash
python3 utilities/batch_process_wind_data.py <input_directory> [output_directory]
```

**What it does:**
- Processes multiple years of wind data in batch
- Maintains consistent formatting and quality standards
- Useful for initial data setup or reprocessing

## 🧪 testing/ - 2025 Forecast Testing Scripts

**Production-ready testing framework for 2025 validation data.**

**`test_2025_forecast.py`** - Single date forecast test
```bash
python3 testing/test_2025_forecast.py 2025-07-15
python3 testing/test_2025_forecast.py 2025-07-15 --call-llm --anthropic-api-key sk-ant-...
```

**What it does:**
- Tests wind forecast for any 2025 date
- Uses validated few-shot methodology (proven 1.0kt WSPD, 1.4kt GST accuracy)
- Includes warnings from both forecast and training examples
- Forecasts until 6 PM PST with hourly aggregated data
- Can be imported for programmatic use

**`batch_test_2025.py`** - Multiple date testing
```bash
python3 testing/batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-31
python3 testing/batch_test_2025.py --dates-file test_dates.txt --call-llm
```

**What it does:**
- Runs tests across date ranges or specific dates
- Compiles results and statistics
- Saves detailed results to JSON
- Supports batch LLM API calls

**Key Features:**
- ✅ Proper data isolation (no contamination)
- ✅ Warning text included in prompts
- ✅ 10 AM - 6 PM PST forecast window
- ✅ Hourly aggregation (WSPD=average, GST=maximum)
- ✅ Can be called from other scripts

See `testing/README.md` for detailed usage and examples.

---

## 📁 archive/ - Legacy/Testing Scripts

The archive folder contains earlier versions and specialized tools:

**Historical Testing Scripts (Preserved for Reference):**
- `test_few_shot_prediction.py` - Initial prediction testing (2025 mock data)
- `test_2023_prediction.py` - Historical prediction testing (flawed methodology)
- `correct_prediction_test.py` - **VALIDATED** 2023 test (basis for 2025 testing scripts)
  - Uses proper data sources (no contamination)
  - Loads ALL examples from monthly files (no cherry-picking)
  - Real NWS forecast integration
  - Proven 1.0kt WSPD, 1.4kt GST accuracy

**Legacy Processing Scripts:**
- Individual component scripts that were consolidated into the main pipelines
- Kept for reference and historical purposes
- Not recommended for new processing tasks

**Note:** For 2025 testing, use the production scripts in `testing/` directory instead.

## 🚀 Quick Start for New Datasets

### For NWS Forecast Data:
```bash
# 1. Process the raw forecast data
python3 processing/process_forecast_data.py ../data/raw/forecasts/your_file.txt ../data/cleaned/

# 2. The script will automatically:
#    - Detect and skip corrupted forecasts
#    - Convert periods to relative format
#    - Generate clean output ready for LLM training

# 3. Use the processed file for training
#    Exclude any dates listed in invalid_forecast_dates.txt
```

### For Wind Measurement Data:
```bash
# 1. Process wind data files (single file or entire directory)
python3 processing/process_wind_data.py ../data/raw/wind/ ../data/cleaned/

# 2. The script will automatically:
#    - Convert timestamps to PST
#    - Filter and validate wind measurements
#    - Convert units to knots
#    - Extract peak hours data (10 AM - 7 PM PST)

# 3. Use processed files for correlation with forecast data
```

### Complete Pipeline:
```bash
# Process both forecast and wind data for training
python3 processing/process_forecast_data.py ../data/raw/forecasts/coastal_waters_2019_2025.txt ../data/cleaned/
python3 processing/process_wind_data.py ../data/raw/wind/ ../data/cleaned/
python3 training/generate_training_data.py
python3 training/curate_few_shot_examples.py

# Now you have:
# - Clean datasets in data/cleaned/
# - Training examples in data/training/training_examples.json
# - Curated few-shot examples in data/training/few_shot_examples/
```

## 📊 Data Processing Standards

### Wind Data Processing:
- **Time Window**: 10 AM - 7 PM PST (peak wind hours for ocean sports)
- **WSPD (Wind Speed)**: Arithmetic mean of hourly measurements
- **GST (Wind Gust)**: Maximum value per hour (not average)
- **Units**: Converted from m/s to knots (1.0 m/s = 1.9 knots)
- **Invalid Data**: Filters sentinel values (~99, ~999, ~9999)

### Forecast Data Processing:
- **Period Format**: Converts to relative days (D0_DAY, D1_NIGHT, D2_DAY, etc.)
- **Corruption Detection**: Identifies and excludes malformed forecasts
- **Warnings**: Extracts Small Craft Advisory and other warnings
- **Timezone**: All timestamps converted to PST ISO 8601 format

## 🎯 Best Practices

1. **Always use the consolidated processing scripts** (`process_wind_data.py` and `process_forecast_data.py`) for new data processing tasks
2. **Check analysis tools** before creating new diagnostic scripts - existing tools may already cover your needs
3. **Update this README** when adding new scripts or modifying functionality
4. **Follow the folder structure** - place new scripts in the appropriate subdirectory
5. **Use batch processing** for multiple files to ensure consistency

## 📝 Notes

- **Training vs Testing Data**:
  - 2016-2024 data: Training
  - 2025 data: Testing/Validation
  - Target production go-live: January 1, 2026

- **Script Naming Convention**:
  - Use verb_object pattern (e.g., `analyze_wind_patterns.py`)
  - Consistent terminology: "wind" and "forecast" (not "buoy", "NWS", etc.)

- **Documentation**:
  - All scripts should have clear docstrings
  - Usage examples in comments at the top of each file
  - Update CLAUDE.md when making significant changes
