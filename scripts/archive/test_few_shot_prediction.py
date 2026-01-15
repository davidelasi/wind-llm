#!/usr/bin/env python3
"""
Test Few-Shot Wind Prediction

Tests the LLM few-shot prediction capability using real data from January 2025.
Creates a mock forecast scenario and compares LLM prediction to actual wind conditions.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path


def process_actual_wind_data(wind_file, test_date_str):
    """Process actual wind data for the test date."""
    print(f"Processing actual wind data for {test_date_str}...")

    # Parse test date
    test_date = datetime.strptime(test_date_str, '%Y-%m-%d')
    year, month, day = test_date.year, test_date.month, test_date.day

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


def select_few_shot_examples(month, forecast_number, num_examples=5):
    """Select few-shot examples for the given month and forecast number."""

    # Determine month name
    month_names = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                   'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    month_name = month_names[month]

    # Load few-shot examples
    examples_file = f'/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/few_shot_examples/{month_name}_fc{forecast_number}_examples.json'

    print(f"Loading few-shot examples from {month_name}_fc{forecast_number}_examples.json...")

    with open(examples_file, 'r') as f:
        examples = json.load(f)

    # Take first N examples for simplicity
    selected = examples[:num_examples]

    print(f"  Selected {len(selected)} examples")

    # Show variety
    wind_strengths = []
    for ex in selected:
        # Calculate peak wind from actual data
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

    print(f"  Wind variety: {', '.join(wind_strengths)}")

    return selected


def create_mock_forecast(test_date_str):
    """Create a realistic mock forecast for testing."""

    # For January 15, 2025, create a typical winter forecast
    mock_forecast = {
        "day_0_day": "NW wind 5 to 10 kt, becoming W 10 to 15 kt in the afternoon. Seas 3 to 5 ft. Waves: W 4 ft at 8 seconds.",
        "day_0_night": "W wind 10 to 15 kt, becoming N 5 to 10 kt after midnight. Seas 3 to 5 ft. Waves: W 4 ft at 8 seconds.",
        "day_1_day": "N to NW wind 5 to 10 kt early, becoming W 10 to 15 kt in the afternoon. Seas 3 to 5 ft. Waves: W 4 ft at 9 seconds.",
        "day_1_night": "W wind 10 to 15 kt, becoming NW 5 to 10 kt after midnight. Seas 3 to 5 ft. Waves: W 4 ft at 9 seconds.",
        "day_2_day": "NW wind 5 to 10 kt, becoming W 10 kt in the afternoon. Seas 3 to 4 ft. Waves: W 3 ft at 10 seconds.",
        "day_2_night": "W wind 10 kt, becoming variable 5 kt or less after midnight. Seas 3 to 4 ft. Waves: W 3 ft at 10 seconds."
    }

    return mock_forecast


def format_few_shot_prompt(examples, test_forecast):
    """Format the few-shot prompt for LLM."""

    prompt = "You are a wind forecasting expert. Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots for the 11 AM - 6 PM time window.\n\n"

    prompt += "Here are examples of how to interpret forecasts and make predictions:\n\n"

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

    # Add test forecast
    prompt += "=== NEW FORECAST TO PREDICT ===\n"
    prompt += "FORECAST:\n"
    for period, text in test_forecast.items():
        prompt += f"{period}: {text}\n"

    prompt += "\nBased on the patterns from the examples above, predict the hourly wind conditions for day_0 (11 AM - 6 PM) in this format:\n"
    prompt += "day_0 (2025-01-15):\n"
    prompt += "  11:00-12:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  12:00-13:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  ...\n"
    prompt += "  17:00-18:00: WSPD X.Xkt, GST Y.Ykt\n\n"

    prompt += "Provide only the prediction in the specified format, analyzing the forecast text for wind speed ranges and timing patterns."

    return prompt


def main():
    """Main test function."""
    print("🧪 TESTING FEW-SHOT WIND PREDICTION")
    print("=" * 50)

    # Test parameters
    test_date_str = "2025-01-15"
    test_month = 1  # January
    forecast_number = 2  # Morning forecast (6 AM - noon issuance)

    print(f"Test Date: {test_date_str}")
    print(f"Using: {['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][test_month]} forecasts, Number {forecast_number}")
    print()

    # Step 1: Process actual wind data
    wind_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/raw/wind/2025_jan.txt"
    actual_conditions = process_actual_wind_data(wind_file, test_date_str)

    if not actual_conditions:
        print("❌ No actual wind data found for test date")
        return

    print()

    # Step 2: Select few-shot examples
    try:
        examples = select_few_shot_examples(test_month, forecast_number, num_examples=3)
    except FileNotFoundError:
        print("❌ Few-shot examples file not found")
        return

    print()

    # Step 3: Create mock forecast
    test_forecast = create_mock_forecast(test_date_str)
    print("Mock forecast created for testing")
    print()

    # Step 4: Create prompt
    prompt = format_few_shot_prompt(examples, test_forecast)

    # Save prompt for inspection
    prompt_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/test_prediction_prompt.txt"
    with open(prompt_file, 'w') as f:
        f.write(prompt)

    print(f"📝 Full prompt saved to: {prompt_file}")
    print()

    # Step 5: Show results comparison setup
    print("🎯 ACTUAL CONDITIONS vs FORECAST SETUP")
    print("=" * 50)

    print("ACTUAL WIND CONDITIONS (2025-01-15):")
    for hour_data in actual_conditions:
        hour = hour_data['hour']
        wspd = hour_data['wspd_avg_kt']
        gst = hour_data['gst_max_kt']
        print(f"  {hour}: WSPD {wspd:.1f}kt, GST {gst:.1f}kt")

    print("\nMOCK FORECAST TO INTERPRET:")
    for period, text in test_forecast.items():
        print(f"  {period}: {text}")

    print(f"\nFEW-SHOT EXAMPLES USED: {len(examples)} examples from January forecasts")

    print("\n" + "=" * 50)
    print("📋 NEXT STEPS:")
    print("1. Review the generated prompt in test_prediction_prompt.txt")
    print("2. Run this prompt through Claude or another LLM")
    print("3. Compare LLM prediction to actual conditions above")
    print("4. Evaluate prediction accuracy")

    return {
        'actual_conditions': actual_conditions,
        'test_forecast': test_forecast,
        'examples_used': len(examples),
        'prompt_file': prompt_file
    }


if __name__ == "__main__":
    result = main()