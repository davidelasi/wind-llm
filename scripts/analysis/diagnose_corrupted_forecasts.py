#!/usr/bin/env python3
"""
Diagnostic script to identify corrupted forecast data due to NWS metadata contamination,
truncated periods, or other data quality issues.
"""

import re
from pathlib import Path
from datetime import datetime

def detect_corruption_patterns(forecast_content):
    """
    Detect various types of data corruption in forecast content.

    Args:
        forecast_content: String containing the forecast text

    Returns:
        Dictionary with corruption indicators and details
    """
    corruption_indicators = {
        'has_corruption': False,
        'corruption_types': [],
        'corruption_details': []
    }

    # Pattern 1: NWS Product Codes and Headers
    nws_patterns = [
        (r'\d{3}\s+FZUS\d+.*?RRA', 'NWS_PRODUCT_CODE'),
        (r'CWFLOX', 'NWS_PRODUCT_NAME'),
        (r'Coastal Waters Forecast.*?DELAYED', 'NWS_HEADER'),
        (r'National Weather Service.*?CA', 'NWS_ATTRIBUTION'),
        (r'Point.*?out \d+ NM.*?Sanctuary', 'NWS_AREA_DESCRIPTION'),
        (r'PZZ\d+-\d+-', 'NWS_ZONE_CODE'),
        (r'\.Synopsis.*?National Park.*?\.', 'NWS_SYNOPSIS'),
        (r'^\d{3}$', 'STANDALONE_NUMBER'),
        (r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00$', 'EMBEDDED_TIMESTAMP')
    ]

    for pattern, corruption_type in nws_patterns:
        matches = re.findall(pattern, forecast_content, re.MULTILINE | re.DOTALL)
        if matches:
            corruption_indicators['has_corruption'] = True
            corruption_indicators['corruption_types'].append(corruption_type)
            corruption_indicators['corruption_details'].extend(matches[:3])  # Limit examples

    # Pattern 2: Truncated or Malformed Period Labels
    truncated_patterns = [
        (r'\.([A-Z]{1,2})(?:\s+NIGHT)?\s*$', 'TRUNCATED_PERIOD'),  # .TU, .W, etc.
        (r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.(?!\.)', 'INCOMPLETE_DOTS'),  # .. instead of ...
        (r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.(?!\.)', 'MISSING_DOTS'),  # . instead of ...
    ]

    for pattern, corruption_type in truncated_patterns:
        matches = re.findall(pattern, forecast_content, re.MULTILINE)
        if matches:
            corruption_indicators['has_corruption'] = True
            corruption_indicators['corruption_types'].append(corruption_type)
            corruption_indicators['corruption_details'].extend([f".{m}" for m in matches[:3]])

    # Pattern 3: Abnormally Long Periods (likely containing concatenated data)
    periods = re.findall(r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.\.?(.*?)(?=\n\.[A-Z]{3,7}(?:\s+NIGHT)?\.\.\.?|\Z)',
                        forecast_content, re.DOTALL)

    for period_name, period_content in periods:
        content_length = len(period_content.strip())
        if content_length > 1000:  # Abnormally long period
            corruption_indicators['has_corruption'] = True
            corruption_indicators['corruption_types'].append('ABNORMALLY_LONG_PERIOD')
            corruption_indicators['corruption_details'].append(f".{period_name}: {content_length} chars")

    # Pattern 4: Multiple Timestamps in Content
    timestamp_pattern = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00'
    timestamp_matches = re.findall(timestamp_pattern, forecast_content)
    if len(timestamp_matches) > 0:  # Should not have any timestamps in forecast content
        corruption_indicators['has_corruption'] = True
        corruption_indicators['corruption_types'].append('EMBEDDED_TIMESTAMPS')
        corruption_indicators['corruption_details'].extend(timestamp_matches[:2])

    # Pattern 5: Non-Weather Content Keywords
    non_weather_keywords = [
        'high pressure center was located',
        'thermal low was over',
        'pattern will not change',
        'including the Channel Islands',
        'out 60 NM',
        'National Marine Sanctuary'
    ]

    for keyword in non_weather_keywords:
        if keyword.lower() in forecast_content.lower():
            corruption_indicators['has_corruption'] = True
            if 'NON_WEATHER_CONTENT' not in corruption_indicators['corruption_types']:
                corruption_indicators['corruption_types'].append('NON_WEATHER_CONTENT')
            corruption_indicators['corruption_details'].append(keyword)

    # Pattern 6: Extremely Short or Empty Periods
    if len(periods) > 0:
        for period_name, period_content in periods:
            clean_content = period_content.strip()
            if len(clean_content) < 10:  # Very short period content
                corruption_indicators['has_corruption'] = True
                if 'EXTREMELY_SHORT_PERIOD' not in corruption_indicators['corruption_types']:
                    corruption_indicators['corruption_types'].append('EXTREMELY_SHORT_PERIOD')
                corruption_indicators['corruption_details'].append(f".{period_name}: '{clean_content}'")

    return corruption_indicators

def analyze_forecast_file(file_path):
    """
    Analyze all forecasts in a file for corruption issues.

    Args:
        file_path: Path to forecast file

    Returns:
        List of corrupted forecast information
    """
    print(f"Analyzing: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Split into forecast blocks
    forecast_blocks = content.split('$$')
    corrupted_forecasts = []

    for block in forecast_blocks:
        block = block.strip()
        if not block:
            continue

        # Find timestamp
        timestamp_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00)', block)
        if not timestamp_match:
            continue

        timestamp = timestamp_match.group(1)

        # Extract forecast content (after timestamp)
        timestamp_pos = block.find(timestamp)
        timestamp_end = timestamp_pos + len(timestamp)
        forecast_content = block[timestamp_end:].strip()

        if forecast_content:
            corruption_info = detect_corruption_patterns(forecast_content)

            if corruption_info['has_corruption']:
                corrupted_forecasts.append({
                    'timestamp': timestamp,
                    'corruption_types': corruption_info['corruption_types'],
                    'corruption_details': corruption_info['corruption_details'],
                    'content_preview': forecast_content[:200] + '...' if len(forecast_content) > 200 else forecast_content
                })

    return corrupted_forecasts

def generate_corruption_report(corrupted_forecasts, output_dir):
    """
    Generate detailed corruption report and invalid dates list.

    Args:
        corrupted_forecasts: List of corrupted forecast data
        output_dir: Directory to save reports
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate invalid dates list
    invalid_dates_file = output_dir / "invalid_forecast_dates.txt"
    detailed_report_file = output_dir / "corrupted_forecasts_report.txt"

    print(f"Generating reports...")

    # Sort by timestamp
    corrupted_forecasts.sort(key=lambda x: x['timestamp'])

    # Write invalid dates list
    with open(invalid_dates_file, 'w') as f:
        f.write("# Invalid Forecast Dates\n")
        f.write("# Forecasts with data corruption issues that should be excluded from training\n")
        f.write("# Format: YYYY-MM-DDTHH:MM:SS-08:00\n")
        f.write("#\n")
        f.write(f"# Total corrupted forecasts: {len(corrupted_forecasts)}\n")
        f.write(f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("#\n\n")

        for forecast in corrupted_forecasts:
            f.write(f"{forecast['timestamp']}\n")

    # Write detailed report
    with open(detailed_report_file, 'w') as f:
        f.write("CORRUPTED FORECASTS DIAGNOSTIC REPORT\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Total Corrupted Forecasts: {len(corrupted_forecasts)}\n\n")

        # Summary by corruption type
        corruption_type_counts = {}
        for forecast in corrupted_forecasts:
            for corruption_type in forecast['corruption_types']:
                corruption_type_counts[corruption_type] = corruption_type_counts.get(corruption_type, 0) + 1

        f.write("CORRUPTION TYPES SUMMARY:\n")
        f.write("-" * 30 + "\n")
        for corruption_type, count in sorted(corruption_type_counts.items()):
            f.write(f"{corruption_type:.<30} {count:>4} forecasts\n")
        f.write("\n")

        # Detailed listings
        f.write("DETAILED CORRUPTION ANALYSIS:\n")
        f.write("-" * 40 + "\n\n")

        for i, forecast in enumerate(corrupted_forecasts, 1):
            f.write(f"{i:3d}. {forecast['timestamp']}\n")
            f.write(f"     Corruption Types: {', '.join(forecast['corruption_types'])}\n")
            f.write(f"     Details: {'; '.join(str(d) for d in forecast['corruption_details'][:5])}\n")
            f.write(f"     Preview: {forecast['content_preview'][:100]}...\n")
            f.write(f"     {'─' * 70}\n")

    print(f"✅ Reports generated:")
    print(f"   Invalid dates list: {invalid_dates_file}")
    print(f"   Detailed report: {detailed_report_file}")
    print(f"   Total corrupted forecasts: {len(corrupted_forecasts)}")

def main():
    """Main diagnostic function."""
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")

    # Use the original file (before processing) to detect corruption
    input_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025_iso_timestamps.txt"
    output_dir = base_dir / "data/training"

    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}")
        return

    print("CORRUPTED FORECASTS DIAGNOSTIC ANALYSIS")
    print("=" * 60)
    print("Scanning for data corruption patterns...")
    print()

    # Analyze all forecasts
    corrupted_forecasts = analyze_forecast_file(input_file)

    if corrupted_forecasts:
        print(f"\n⚠️  Found {len(corrupted_forecasts)} corrupted forecasts")

        # Show corruption type breakdown
        corruption_type_counts = {}
        for forecast in corrupted_forecasts:
            for corruption_type in forecast['corruption_types']:
                corruption_type_counts[corruption_type] = corruption_type_counts.get(corruption_type, 0) + 1

        print("\nCorruption types found:")
        for corruption_type, count in sorted(corruption_type_counts.items()):
            print(f"  {corruption_type}: {count} forecasts")

        # Generate reports
        generate_corruption_report(corrupted_forecasts, output_dir)

        # Show examples
        print(f"\nExample corrupted forecasts:")
        for i, forecast in enumerate(corrupted_forecasts[:3]):
            print(f"  {i+1}. {forecast['timestamp']} - {', '.join(forecast['corruption_types'][:2])}")

    else:
        print("✅ No corrupted forecasts found!")

if __name__ == "__main__":
    main()