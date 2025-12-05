#!/usr/bin/env python3
"""
Correct Few-Shot Wind Prediction Test

Uses the proper data sources as specified:
1. Forecast from inner_waters_forecasts_relative_periods.txt
2. ALL examples from jul_fc2_examples.json (not cherry-picked)
3. Wind data from wind_2023_processed.txt

Usage:
    python3 correct_prediction_test.py [test_date]

Example:
    python3 correct_prediction_test.py 2023-07-15
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path


def find_forecast_for_date(test_date_str, forecast_file):
    """Find the forecast for the test date from inner_waters_forecasts_relative_periods.txt"""

    print(f"Searching for forecast for {test_date_str} in {Path(forecast_file).name}...")

    forecasts_found = []

    with open(forecast_file, 'r') as f:
        lines = f.readlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for "Issued:" lines
        if line.startswith('Issued:'):
            try:
                issued_datetime = line.replace('Issued: ', '')
                dt = datetime.fromisoformat(issued_datetime.replace('Z', '+00:00'))

                # Check if this is issued on our test date
                if dt.date().strftime('%Y-%m-%d') == test_date_str:
                    # Look for D0_DAY forecast on next lines
                    j = i + 1
                    forecast_content = {}

                    while j < len(lines) and not lines[j].strip().startswith('$$'):
                        forecast_line = lines[j].strip()
                        if forecast_line:
                            if forecast_line.startswith('D0_DAY'):
                                forecast_content['D0_DAY'] = forecast_line
                            elif forecast_line.startswith('D0_NIGHT'):
                                forecast_content['D0_NIGHT'] = forecast_line
                        j += 1

                    if 'D0_DAY' in forecast_content:
                        forecasts_found.append({
                            'issued': issued_datetime,
                            'issue_time': dt.strftime('%H:%M'),
                            'D0_DAY': forecast_content['D0_DAY'],
                            'D0_NIGHT': forecast_content.get('D0_NIGHT', ''),
                            'all_content': forecast_content
                        })

            except Exception as e:
                pass

        i += 1

    if forecasts_found:
        # Pick morning forecast (around 6-12 AM)
        morning_forecasts = []
        for f in forecasts_found:
            hour = datetime.fromisoformat(f['issued'].replace('Z', '+00:00')).hour
            if 6 <= hour <= 12:
                morning_forecasts.append(f)

        if morning_forecasts:
            chosen = morning_forecasts[0]
        else:
            chosen = forecasts_found[0]

        print(f"  Found forecast issued: {chosen['issued']} ({chosen['issue_time']})")
        print(f"  D0_DAY forecast: {chosen['D0_DAY'][:80]}...")
        return chosen
    else:
        print(f"  ❌ No forecast found for {test_date_str}")
        return None


def load_all_examples(examples_file):
    """Load ALL examples from the few-shot examples file."""

    print(f"Loading ALL examples from {Path(examples_file).name}...")

    with open(examples_file, 'r') as f:
        examples = json.load(f)

    print(f"  Loaded {len(examples)} examples (using ALL, not cherry-picked)")

    # Show variety in examples
    wind_strengths = []
    years = set()

    for ex in examples:
        # Track years
        issued = ex.get('issued', '')
        if issued:
            try:
                dt = datetime.fromisoformat(issued.replace('Z', '+00:00'))
                years.add(dt.year)
            except:
                pass

        # Calculate peak wind strength
        peak_wspd = 0
        actual = ex.get('actual', {})
        for day in ['day_0', 'day_1', 'day_2']:
            if day in actual and 'hourly' in actual[day]:
                for hour_data in actual[day]['hourly']:
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    if wspd > peak_wspd:
                        peak_wspd = wspd

        if peak_wspd < 10:
            wind_strengths.append('calm')
        elif peak_wspd <= 20:
            wind_strengths.append('moderate')
        else:
            wind_strengths.append('strong')

    print(f"  Year spread: {sorted(years)}")
    print(f"  Wind variety: calm={wind_strengths.count('calm')}, moderate={wind_strengths.count('moderate')}, strong={wind_strengths.count('strong')}")

    return examples


def load_processed_wind_data(test_date_str, wind_file):
    """Load wind data for test date from wind_2023_processed.txt"""

    print(f"Loading wind data for {test_date_str} from {Path(wind_file).name}...")

    with open(wind_file, 'r') as f:
        lines = f.readlines()

    # Look for our test date
    test_data = []

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        # Split by space (not comma - this appears to be space-separated)
        parts = line.split()
        if len(parts) < 4:
            continue

        try:
            datetime_pst = parts[0].strip()

            # Extract date from datetime
            if test_date_str in datetime_pst:
                # Parse the processed wind data
                # Format: DATETIME_PST WDIR WSPD GST PRES ATMP
                wdir = parts[1].strip()
                wspd = float(parts[2].strip()) if parts[2].strip() != 'null' else 0
                gst = float(parts[3].strip()) if parts[3].strip() != 'null' else 0

                # Extract hour from datetime
                dt = datetime.fromisoformat(datetime_pst.replace('-08:00', ''))
                hour = dt.hour

                test_data.append({
                    'datetime': datetime_pst,
                    'hour': hour,
                    'wspd_avg_kt': wspd,
                    'gst_max_kt': gst
                })

        except (ValueError, IndexError) as e:
            continue

    if test_data:
        print(f"  Found {len(test_data)} hourly measurements")
        avg_wspd = sum(d['wspd_avg_kt'] for d in test_data) / len(test_data)
        max_gst = max(d['gst_max_kt'] for d in test_data)
        print(f"  Summary: Avg WSPD = {avg_wspd:.1f}kt, Max GST = {max_gst:.1f}kt")
    else:
        print(f"  ❌ No wind data found for {test_date_str}")

    return test_data


def create_comprehensive_prompt(examples, forecast_info, test_date_str):
    """Create prompt using ALL examples and correct forecast source."""

    prompt = "You are a wind forecasting expert. Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots for the daytime hours.\n\n"
    prompt += f"Here are {len(examples)} examples showing how to interpret forecasts and actual outcomes:\n\n"

    # Add ALL examples
    for i, example in enumerate(examples, 1):
        prompt += f"=== EXAMPLE {i} ===\n"
        prompt += "FORECAST:\n"

        forecast = example.get('forecast', {})
        for period, text in forecast.items():
            prompt += f"{period}: {text}\n"

        prompt += "\nACTUAL WIND CONDITIONS:\n"

        actual = example.get('actual', {})
        for day in ['day_0', 'day_1', 'day_2']:
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

        prompt += "\n"

    # Add the forecast to predict
    prompt += "=== FORECAST TO PREDICT ===\n"
    prompt += f"ISSUED: {forecast_info['issued']} ({forecast_info['issue_time']})\n"
    prompt += f"D0_DAY: {forecast_info['D0_DAY']}\n"
    if forecast_info['D0_NIGHT']:
        prompt += f"D0_NIGHT: {forecast_info['D0_NIGHT']}\n"
    prompt += "\n"

    prompt += f"Based on the patterns from all {len(examples)} examples above, predict the hourly wind conditions for {test_date_str}.\n\n"
    prompt += "Provide your prediction in this format:\n"
    prompt += f"day_0 ({test_date_str}):\n"
    prompt += "  HH:00-(HH+1):00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  (for each hour with available data)\n\n"

    prompt += "Analyze the D0_DAY forecast text carefully for wind speed ranges, timing cues, and pattern similarities to the examples."

    return prompt


def run_prediction_test(test_date_str):
    """Run the complete prediction test with correct data sources."""

    print("🧪 CORRECTED FEW-SHOT WIND PREDICTION TEST")
    print("=" * 70)
    print(f"Test Date: {test_date_str}")
    print("Using CORRECT data sources:")
    print("  - Forecast: inner_waters_forecasts_relative_periods.txt")
    print("  - Examples: ALL examples from jul_fc2_examples.json")
    print("  - Wind Data: wind_2023_processed.txt")
    print()

    # Define file paths
    forecast_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/cleaned/inner_waters_forecasts_relative_periods.txt"
    examples_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/few_shot_examples/jul_fc2_examples.json"
    wind_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/cleaned/wind_2023_processed.txt"

    # Step 1: Find correct forecast
    forecast_info = find_forecast_for_date(test_date_str, forecast_file)
    if not forecast_info:
        print("❌ Cannot proceed without forecast data")
        return None
    print()

    # Step 2: Load ALL examples
    examples = load_all_examples(examples_file)
    print()

    # Step 3: Load processed wind data
    actual_conditions = load_processed_wind_data(test_date_str, wind_file)
    if not actual_conditions:
        print("❌ Cannot proceed without wind data")
        return None
    print()

    # Step 4: Create comprehensive prompt
    prompt = create_comprehensive_prompt(examples, forecast_info, test_date_str)

    # Save prompt
    prompt_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/corrected_prediction_prompt.txt"
    with open(prompt_file, 'w') as f:
        f.write(prompt)

    print(f"📝 Full prompt saved to: corrected_prediction_prompt.txt")
    print()

    # Step 5: Display results for analysis
    print("🎯 CORRECTED TEST RESULTS")
    print("=" * 70)

    print(f"ACTUAL WIND CONDITIONS ({test_date_str}):")
    for data in actual_conditions:
        hour = data['hour']
        wspd = data['wspd_avg_kt']
        gst = data['gst_max_kt']
        print(f"  {hour:02d}:00-{hour+1:02d}:00: WSPD {wspd:.1f}kt, GST {gst:.1f}kt")

    print(f"\nACTUAL FORECAST (from inner_waters_forecasts):")
    print(f"  Issued: {forecast_info['issued']} ({forecast_info['issue_time']})")
    print(f"  D0_DAY: {forecast_info['D0_DAY']}")
    if forecast_info['D0_NIGHT']:
        print(f"  D0_NIGHT: {forecast_info['D0_NIGHT'][:100]}...")

    print(f"\nTRAINING DATA:")
    print(f"  Examples used: {len(examples)} (ALL from jul_fc2_examples.json)")
    print(f"  Data source: Processed wind data (not raw)")
    print(f"  Forecast source: Inner waters relative periods (not training examples)")

    return {
        'test_date': test_date_str,
        'actual_conditions': actual_conditions,
        'forecast_info': forecast_info,
        'examples_count': len(examples),
        'prompt_file': prompt_file
    }


def main():
    """Main function."""
    test_date = sys.argv[1] if len(sys.argv) > 1 else "2023-07-15"

    result = run_prediction_test(test_date)

    if result:
        print(f"\n✅ Test completed successfully!")
        print(f"📊 Ready for LLM prediction using {result['examples_count']} examples")
        print(f"📝 Prompt file: {result['prompt_file']}")
    else:
        print("\n❌ Test failed - check data sources")


if __name__ == "__main__":
    main()