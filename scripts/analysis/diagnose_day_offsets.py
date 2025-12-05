#!/usr/bin/env python3
"""
Diagnostic script to find forecasts with problematic day offsets (D5, D6, D7, etc.)
and analyze the original forecast content to understand the root cause.
"""

import re
from pathlib import Path
from datetime import datetime

def find_problematic_forecasts(output_file, original_file):
    """
    Find forecasts with D5+ day offsets and match them to original content.

    Args:
        output_file: Path to processed forecast file
        original_file: Path to original forecast file

    Returns:
        List of problematic forecast examples
    """
    print("DIAGNOSTIC ANALYSIS: Problematic Day Offsets (D5+)")
    print("=" * 60)

    # Read processed file
    with open(output_file, 'r', encoding='utf-8') as file:
        processed_content = file.read()

    # Read original file
    with open(original_file, 'r', encoding='utf-8') as file:
        original_content = file.read()

    # Split into forecast blocks
    processed_blocks = processed_content.split('$$')
    original_blocks = original_content.split('$$')

    problematic_cases = []

    # Find blocks with D5+ offsets
    for i, block in enumerate(processed_blocks):
        if re.search(r'D[5-9]_', block):
            # Extract timestamp for matching
            timestamp_match = re.search(r'Issued: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00)', block)
            if timestamp_match:
                timestamp = timestamp_match.group(1)

                # Find corresponding original block
                original_block = None
                for orig_block in original_blocks:
                    if timestamp in orig_block:
                        original_block = orig_block.strip()
                        break

                if original_block:
                    # Extract problematic day labels
                    problem_labels = re.findall(r'D[5-9]_[A-Z]+', block)

                    problematic_cases.append({
                        'timestamp': timestamp,
                        'problem_labels': problem_labels,
                        'processed_block': block.strip(),
                        'original_block': original_block
                    })

    return problematic_cases

def analyze_forecast_case(case):
    """
    Analyze a single problematic forecast case.

    Args:
        case: Dictionary with forecast information
    """
    print(f"\nCASE ANALYSIS")
    print("-" * 40)
    print(f"Timestamp: {case['timestamp']}")
    print(f"Problematic labels: {case['problem_labels']}")

    # Parse the forecast issuance time
    forecast_time = datetime.fromisoformat(case['timestamp'][:-6])  # Remove timezone
    weekday = forecast_time.strftime('%A')
    print(f"Forecast issued: {weekday}, {forecast_time.strftime('%Y-%m-%d at %H:%M')}")

    print("\nORIGINAL FORECAST CONTENT:")
    print("-" * 30)
    # Extract just the forecast periods from original
    original_periods = re.findall(r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.\.[^.]*?(?=\n\.|\Z)',
                                 case['original_block'], re.DOTALL)
    for period in original_periods[:10]:  # Show first 10 periods
        print(f"  .{period}...")

    print("\nPROCESSED OUTPUT:")
    print("-" * 20)
    # Extract processed periods
    processed_periods = re.findall(r'(D\d+_[A-Z]+) \([^)]+\)', case['processed_block'])
    for period in processed_periods[:10]:  # Show first 10 periods
        print(f"  {period}")

    print("\nPROBLEM ANALYSIS:")
    print("-" * 20)

    # Analyze weekday pattern
    original_weekdays = re.findall(r'\.([A-Z]{3})(?:\s+NIGHT)?\.\.\.', case['original_block'])
    print(f"Original weekday sequence: {original_weekdays[:10]}")

    # Check for extended forecast periods
    if len(original_weekdays) > 8:
        print(f"⚠️  EXTENDED FORECAST: {len(original_weekdays)} periods found (normal is 6-8)")

    # Check for week rollover
    weekday_to_num = {'MON': 0, 'TUE': 1, 'WED': 2, 'THU': 3, 'FRI': 4, 'SAT': 5, 'SUN': 6}
    issue_weekday_num = forecast_time.weekday()  # Monday=0

    print(f"Issue day number: {issue_weekday_num} ({weekday})")

    for i, wd in enumerate(original_weekdays[:8]):
        if wd in weekday_to_num:
            wd_num = weekday_to_num[wd]
            days_ahead = (wd_num - issue_weekday_num) % 7
            print(f"  {wd} -> {days_ahead} days ahead (should be D{days_ahead})")
            if days_ahead > 4:
                print(f"    ⚠️  PROBLEM: {wd} calculated as D{days_ahead} (beyond D4 limit)")

    return case

def main():
    """Main diagnostic function."""
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")

    output_file = base_dir / "data/cleaned/inner_waters_forecasts_relative_periods.txt"
    original_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025_iso_timestamps.txt"

    if not output_file.exists() or not original_file.exists():
        print("Error: Required files not found")
        return

    # Find problematic forecasts
    problematic_cases = find_problematic_forecasts(output_file, original_file)

    print(f"\nFOUND {len(problematic_cases)} problematic forecasts with D5+ offsets")

    if problematic_cases:
        # Analyze first few cases in detail
        for i, case in enumerate(problematic_cases[:3]):  # Analyze first 3 cases
            analyze_forecast_case(case)
            print("\n" + "=" * 60)

        # Summary statistics
        print(f"\nSUMMARY STATISTICS:")
        print(f"Total problematic forecasts: {len(problematic_cases)}")

        # Count by day offset
        all_labels = []
        for case in problematic_cases:
            all_labels.extend(case['problem_labels'])

        from collections import Counter
        label_counts = Counter(all_labels)
        print("Problematic label frequency:")
        for label, count in sorted(label_counts.items()):
            print(f"  {label}: {count} occurrences")

    else:
        print("No problematic forecasts found!")

if __name__ == "__main__":
    main()