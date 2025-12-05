#!/usr/bin/env python3
"""
Analyze a specific forecast to demonstrate the fix for day offset calculation.
"""

import re
from datetime import datetime

def find_specific_forecast(timestamp, original_file, processed_file):
    """
    Find a specific forecast by timestamp in both files.

    Args:
        timestamp: Target timestamp string
        original_file: Path to original forecast file
        processed_file: Path to processed forecast file

    Returns:
        Tuple of (original_content, processed_content)
    """
    # Read original file
    with open(original_file, 'r', encoding='utf-8') as file:
        original_content = file.read()

    # Read processed file
    with open(processed_file, 'r', encoding='utf-8') as file:
        processed_content = file.read()

    # Find original forecast block
    original_blocks = original_content.split('$$')
    original_forecast = None
    for block in original_blocks:
        if timestamp in block:
            original_forecast = block.strip()
            break

    # Find processed forecast block
    processed_blocks = processed_content.split('$$')
    processed_forecast = None
    for block in processed_blocks:
        if timestamp in block:
            processed_forecast = block.strip()
            break

    return original_forecast, processed_forecast

def simulate_sequential_fix(original_forecast, timestamp):
    """
    Simulate how the sequential day tracking approach would fix the forecast.

    Args:
        original_forecast: Original forecast content
        timestamp: Forecast timestamp

    Returns:
        Fixed forecast content
    """
    # Parse forecast time
    forecast_time = datetime.fromisoformat(timestamp[:-6])  # Remove timezone

    # Extract forecast periods
    period_pattern = r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.\.(.*?)(?=\n\.[A-Z]{3,7}(?:\s+NIGHT)?\.\.\.|\Z)'
    periods = re.findall(period_pattern, original_forecast, re.DOTALL)

    # Calculate forecast date
    forecast_date = forecast_time.date()

    # Sequential day tracking logic
    current_day_offset = 0
    max_day_offset = 4  # Cap at D4

    fixed_periods = []

    print(f"FORECAST ANALYSIS: {timestamp}")
    print(f"Issued: {forecast_time.strftime('%A, %Y-%m-%d at %H:%M')}")
    print(f"Forecast date: {forecast_date}")
    print("\nSEQUENTIAL DAY TRACKING LOGIC:")
    print("-" * 50)

    for i, (period_name, period_content) in enumerate(periods):
        # Clean up content
        content = re.sub(r'\s+', ' ', period_content.strip())
        content = content.replace('Wave Detail:', 'Waves:')

        # Calculate target date
        target_date = forecast_date
        if current_day_offset > 0:
            from datetime import timedelta
            target_date = forecast_date + timedelta(days=current_day_offset)

        # Determine period type and label
        if period_name == 'TONIGHT':
            label = f'D{current_day_offset}_NIGHT'
            print(f"  .{period_name} -> {label} ({target_date}) [same day night]")
        elif period_name == 'TODAY':
            label = f'D{current_day_offset}_DAY'
            print(f"  .{period_name} -> {label} ({target_date}) [same day]")
        elif period_name.endswith(' NIGHT'):
            label = f'D{current_day_offset}_NIGHT'
            print(f"  .{period_name} -> {label} ({target_date}) [night period]")
            # After night period, increment to next day
            current_day_offset = min(current_day_offset + 1, max_day_offset)
        else:
            # Regular day period
            label = f'D{current_day_offset}_DAY'
            print(f"  .{period_name} -> {label} ({target_date}) [day period]")
            # Don't increment yet - wait for night period or next day

        fixed_periods.append(f"{label} ({target_date}) {content}")

        # Special handling: if next period is not a NIGHT period for this day,
        # and this was a day period, increment day offset
        if i < len(periods) - 1:
            next_period_name = periods[i + 1][0]
            if (not period_name.endswith(' NIGHT') and
                not next_period_name.endswith(' NIGHT') and
                period_name != 'TONIGHT' and period_name != 'TODAY'):
                current_day_offset = min(current_day_offset + 1, max_day_offset)
                print(f"    -> Increment to D{current_day_offset} for next day")

    return fixed_periods

def main():
    """Main analysis function."""
    from pathlib import Path

    target_timestamp = "2023-11-21T00:30:00-08:00"
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")

    original_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025_iso_timestamps.txt"
    processed_file = base_dir / "data/cleaned/inner_waters_forecasts_relative_periods.txt"

    # Find the specific forecast
    original_forecast, processed_forecast = find_specific_forecast(
        target_timestamp, original_file, processed_file
    )

    if not original_forecast:
        print(f"❌ Forecast {target_timestamp} not found!")
        return

    print("=" * 80)
    print("ORIGINAL FORECAST CONTENT:")
    print("=" * 80)
    print(original_forecast)

    print("\n" + "=" * 80)
    print("CURRENT PROBLEMATIC OUTPUT:")
    print("=" * 80)
    if processed_forecast:
        print(processed_forecast)
    else:
        print("Not found in processed file")

    print("\n" + "=" * 80)
    print("SEQUENTIAL FIX SIMULATION:")
    print("=" * 80)

    # Simulate the fix
    fixed_periods = simulate_sequential_fix(original_forecast, target_timestamp)

    print(f"\nFIXED OUTPUT:")
    print("-" * 40)
    print(f"Issued: {target_timestamp}\n")
    for period in fixed_periods:
        print(period)

if __name__ == "__main__":
    main()