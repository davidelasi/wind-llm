#!/usr/bin/env python3
"""
Test 2023 Few-Shot Wind Prediction

Tests LLM prediction on July 15, 2023 - a date in training range but not in
the specific few-shot examples that will be used for prediction.
"""

import json
import sys
from datetime import datetime
from pathlib import Path


def find_actual_forecast_for_date(test_date_str):
    """Find the actual NWS forecast issued for the test date."""
    print(f"Searching for actual NWS forecast for {test_date_str}...")

    # Look in training data for a forecast issued for this date
    with open('/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/training_examples.json', 'r') as f:
        training_data = json.load(f)

    candidates = []

    for example in training_data:
        actual = example.get('actual', {})
        # Check if this forecast was for our test date
        if 'day_0' in actual and actual['day_0'].get('date') == test_date_str:
            forecast_text = example.get('forecast', {})
            issued = example.get('issued', '')
            issuance_time = example.get('issuance_time', '')
            number = example.get('number', 0)

            candidates.append({
                'issued': issued,
                'issuance_time': issuance_time,
                'number': number,
                'forecast': forecast_text,
                'example': example
            })

    if candidates:
        # Sort by issuance time and pick a morning forecast
        morning_forecasts = [c for c in candidates if c['number'] == 2]  # 6AM-noon
        if morning_forecasts:
            chosen = morning_forecasts[0]
            print(f"  Found morning forecast issued at {chosen['issuance_time']}")
            return chosen
        else:
            chosen = candidates[0]
            print(f"  Found forecast #{chosen['number']} issued at {chosen['issuance_time']}")
            return chosen
    else:
        print("  ❌ No actual forecast found for this date")
        return None


def process_actual_wind_data_2023(test_date_str):
    """Process actual wind data for the 2023 test date."""
    print(f"Processing 2023 wind data for {test_date_str}...")

    # Parse test date
    test_date = datetime.strptime(test_date_str, '%Y-%m-%d')
    year, month, day = test_date.year, test_date.month, test_date.day

    # 2023 data file
    wind_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/raw/wind/2023.txt"

    hourly_data = {}

    with open(wind_file, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) < 8:
                continue

            try:
                file_year, file_month, file_day = int(parts[0]), int(parts[1]), int(parts[2])
                file_hour, file_minute = int(parts[3]), int(parts[4])

                # Check if this is our test date
                if file_year == year and file_month == month and file_day == day:
                    # Only process daytime hours (10 AM - 6 PM PST)
                    if 10 <= file_hour <= 18:
                        wspd_ms = float(parts[6])  # Wind speed in m/s
                        gst_ms = float(parts[7])   # Gust speed in m/s

                        # Filter invalid data
                        if wspd_ms >= 99.0 or gst_ms >= 99.0:
                            continue

                        # Convert to knots
                        wspd_kt = wspd_ms * 1.9
                        gst_kt = gst_ms * 1.9

                        # Group by hour
                        if file_hour not in hourly_data:
                            hourly_data[file_hour] = {'wspd': [], 'gst': []}

                        hourly_data[file_hour]['wspd'].append(wspd_kt)
                        hourly_data[file_hour]['gst'].append(gst_kt)

            except (ValueError, IndexError):
                continue

    # Aggregate hourly data
    actual_conditions = []

    for hour in sorted(hourly_data.keys()):
        if hourly_data[hour]['wspd'] and hourly_data[hour]['gst']:
            avg_wspd = sum(hourly_data[hour]['wspd']) / len(hourly_data[hour]['wspd'])
            max_gst = max(hourly_data[hour]['gst'])

            actual_conditions.append({
                'hour': f'{hour:02d}:00-{hour+1:02d}:00',
                'wspd_avg_kt': round(avg_wspd, 1),
                'gst_max_kt': round(max_gst, 1)
            })

    print(f"  Processed {len(actual_conditions)} hours of wind data")

    if actual_conditions:
        total_wspd = sum(h['wspd_avg_kt'] for h in actual_conditions)
        avg_wspd = total_wspd / len(actual_conditions)
        max_gst = max(h['gst_max_kt'] for h in actual_conditions)

        print(f"  Summary: Avg WSPD = {avg_wspd:.1f}kt, Max GST = {max_gst:.1f}kt")

    return actual_conditions


def select_non_conflicting_examples(month, forecast_number, test_date_str, num_examples=5):
    """Select few-shot examples ensuring they don't include our test date."""

    month_names = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    month_name = month_names[month]

    examples_file = f'/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/few_shot_examples/{month_name}_fc{forecast_number}_examples.json'

    print(f"Loading examples from {month_name}_fc{forecast_number}_examples.json...")

    with open(examples_file, 'r') as f:
        examples = json.load(f)

    # Filter out any examples that include our test date
    safe_examples = []

    for example in examples:
        actual = example.get('actual', {})
        includes_test_date = False

        for day_key in ['day_0', 'day_1', 'day_2', 'day_3', 'day_4']:
            if day_key in actual:
                date_str = actual[day_key].get('date', '')
                if date_str == test_date_str:
                    includes_test_date = True
                    break

        if not includes_test_date:
            safe_examples.append(example)

    print(f"  Filtered to {len(safe_examples)} safe examples (excluding test date)")

    # Take first N examples
    selected = safe_examples[:num_examples]
    print(f"  Selected {len(selected)} examples for few-shot learning")

    return selected


def format_2023_prediction_prompt(examples, actual_forecast, test_date_str):
    """Format prompt using actual 2023 forecast."""

    prompt = "You are a wind forecasting expert. Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots for the 11 AM - 6 PM time window.\n\n"
    prompt += "Here are examples of how to interpret forecasts:\n\n"

    # Add few-shot examples
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

                for hour_data in actual[day]['hourly']:
                    hour = hour_data.get('hour', '')
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    gst = hour_data.get('gst_max_kt', 0)
                    prompt += f"  {hour}: WSPD {wspd:.1f}kt, GST {gst:.1f}kt\n"
                prompt += "\n"

        prompt += "\n"

    # Add actual forecast
    prompt += "=== FORECAST TO PREDICT ===\n"
    prompt += "FORECAST:\n"
    for period, text in actual_forecast.items():
        prompt += f"{period}: {text}\n"

    prompt += f"\nBased on the patterns from the examples, predict hourly wind conditions for day_0 ({test_date_str}) from 11 AM - 6 PM:\n\n"
    prompt += f"day_0 ({test_date_str}):\n"
    prompt += "  11:00-12:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  12:00-13:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  13:00-14:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  14:00-15:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  15:00-16:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  16:00-17:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  17:00-18:00: WSPD X.Xkt, GST Y.Ykt\n\n"

    prompt += "Provide only the prediction, analyzing the forecast text for wind patterns and timing."

    return prompt


def main():
    """Main test function."""
    print("🧪 TESTING 2023 FEW-SHOT WIND PREDICTION")
    print("=" * 60)

    # Test parameters
    test_date_str = "2023-07-15"
    test_month = 7  # July
    forecast_number = 2  # Morning forecast

    print(f"Test Date: {test_date_str} (July 2023)")
    print(f"Using: July forecasts, Number {forecast_number}")
    print()

    # Step 1: Find actual forecast for this date
    forecast_info = find_actual_forecast_for_date(test_date_str)
    if not forecast_info:
        print("❌ Cannot proceed without actual forecast")
        return

    actual_forecast = forecast_info['forecast']
    print()

    # Step 2: Process actual wind data
    actual_conditions = process_actual_wind_data_2023(test_date_str)
    if not actual_conditions:
        print("❌ No actual wind data found for test date")
        return
    print()

    # Step 3: Select safe few-shot examples
    examples = select_non_conflicting_examples(test_month, forecast_number, test_date_str, num_examples=3)
    print()

    # Step 4: Create prediction prompt
    prompt = format_2023_prediction_prompt(examples, actual_forecast, test_date_str)

    # Save prompt
    prompt_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/test_2023_prediction_prompt.txt"
    with open(prompt_file, 'w') as f:
        f.write(prompt)

    print(f"📝 Prompt saved to: {prompt_file}")
    print()

    # Step 5: Show comparison setup
    print("🎯 ACTUAL CONDITIONS vs REAL FORECAST")
    print("=" * 60)

    print(f"ACTUAL WIND CONDITIONS ({test_date_str}):")
    for hour_data in actual_conditions:
        hour = hour_data['hour']
        wspd = hour_data['wspd_avg_kt']
        gst = hour_data['gst_max_kt']
        print(f"  {hour}: WSPD {wspd:.1f}kt, GST {gst:.1f}kt")

    print(f"\nACTUAL NWS FORECAST (issued {forecast_info['issuance_time']}):")
    for period, text in actual_forecast.items():
        print(f"  {period}: {text}")

    print(f"\nFEW-SHOT EXAMPLES: {len(examples)} July examples (test date excluded)")

    return {
        'test_date': test_date_str,
        'actual_conditions': actual_conditions,
        'actual_forecast': actual_forecast,
        'forecast_issue_time': forecast_info['issuance_time'],
        'examples_count': len(examples),
        'prompt_file': prompt_file
    }


if __name__ == "__main__":
    result = main()