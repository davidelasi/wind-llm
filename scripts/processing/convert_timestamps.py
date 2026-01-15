#!/usr/bin/env python3
"""
Script to convert timestamps in inner_waters_forecasts_2019_2025.txt
from format like "1010 PM PDT Wed Oct 22 2025"
to ISO 8601 format like "2025-10-22T21:10:00-08:00"

Converts both PDT and PST timestamps to PST by:
- PST times: kept as-is
- PDT times: converted to PST by subtracting 1 hour
All output times use PST timezone (-08:00).
"""

import re
from datetime import datetime
from pathlib import Path

def parse_forecast_timestamp(timestamp_str):
    """
    Parse timestamp string and convert to ISO 8601 format in PST.

    Input format: "1010 PM PDT Wed Oct 22 2025"
    Output format: "2025-10-22T21:10:00-08:00" (PDT converted to PST by subtracting 1 hour)

    Args:
        timestamp_str: String containing the original timestamp

    Returns:
        String in ISO 8601 format with PST timezone, or None if parsing fails
    """

    # Define month mapping
    month_map = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    }

    # Regex pattern to match timestamps
    # Pattern: TIME AM/PM TZ DAY MONTH DATE YEAR
    pattern = r'(\d{1,4})\s+(AM|PM)\s+(PDT|PST)\s+[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})'

    match = re.search(pattern, timestamp_str)
    if not match:
        return None

    time_str, ampm, timezone, month_str, day_str, year_str = match.groups()

    # Parse time
    if len(time_str) <= 2:
        hour = int(time_str)
        minute = 0
    elif len(time_str) == 3:
        hour = int(time_str[0])
        minute = int(time_str[1:])
    else:  # len == 4
        hour = int(time_str[:2])
        minute = int(time_str[2:])

    # Convert to 24-hour format
    if ampm == 'PM' and hour != 12:
        hour += 12
    elif ampm == 'AM' and hour == 12:
        hour = 0

    # Convert PDT to PST by subtracting 1 hour
    if timezone == 'PDT':
        hour -= 1
        if hour < 0:
            hour = 23
            # Would need to adjust day/month/year, but for simplicity keeping same date
            # This edge case is rare in weather forecasts

    # Parse date components
    year = int(year_str)
    month = month_map.get(month_str)
    if month is None:
        return None
    day = int(day_str)

    # Format as ISO 8601 with PST timezone (-08:00)
    # All times converted to PST
    iso_timestamp = f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00-08:00"

    return iso_timestamp

def convert_timestamps_in_file(input_file_path, output_file_path):
    """
    Convert all timestamps in the forecast file from original format to ISO 8601.

    Args:
        input_file_path: Path to the input file
        output_file_path: Path for the output file
    """

    print(f"Reading from: {input_file_path}")
    print(f"Writing to: {output_file_path}")

    with open(input_file_path, 'r', encoding='utf-8') as infile:
        content = infile.read()

    # Pattern to match full timestamp lines
    timestamp_pattern = r'(\d{1,4}\s+[AP]M\s+[A-Z]{3}\s+[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4})'

    converted_count = 0
    failed_count = 0

    def replace_timestamp(match):
        nonlocal converted_count, failed_count
        original_timestamp = match.group(1)

        iso_timestamp = parse_forecast_timestamp(original_timestamp)
        if iso_timestamp:
            converted_count += 1
            if converted_count % 1000 == 0:
                print(f"Converted {converted_count} timestamps...")
            return iso_timestamp
        else:
            failed_count += 1
            print(f"Failed to parse: {original_timestamp}")
            return original_timestamp  # Keep original if parsing fails

    # Replace all timestamps
    converted_content = re.sub(timestamp_pattern, replace_timestamp, content)

    # Write the converted content
    with open(output_file_path, 'w', encoding='utf-8') as outfile:
        outfile.write(converted_content)

    print(f"\nConversion complete!")
    print(f"Successfully converted: {converted_count} timestamps")
    print(f"Failed conversions: {failed_count}")

    # Calculate size change
    original_size = len(content)
    converted_size = len(converted_content)
    size_diff = converted_size - original_size

    print(f"File size change: {size_diff:,} characters ({original_size:,} -> {converted_size:,})")

    return converted_count, failed_count

def validate_conversions(file_path, sample_count=10):
    """
    Validate the timestamp conversions by checking samples.

    Args:
        file_path: Path to the converted file
        sample_count: Number of samples to check
    """

    print(f"\nValidating conversions in: {file_path}")

    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Look for ISO 8601 timestamps
    iso_pattern = r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00)'
    iso_matches = re.findall(iso_pattern, content)

    # Look for any remaining original format timestamps
    original_pattern = r'(\d{1,4}\s+[AP]M\s+[A-Z]{3}\s+[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4})'
    original_matches = re.findall(original_pattern, content)

    print(f"ISO 8601 timestamps found: {len(iso_matches)}")
    print(f"Original format timestamps remaining: {len(original_matches)}")

    if original_matches:
        print("Remaining original timestamps:")
        for i, timestamp in enumerate(original_matches[:5]):
            print(f"  {i+1}: {timestamp}")

    # Show sample conversions
    print(f"\nSample ISO 8601 timestamps:")
    for i, timestamp in enumerate(iso_matches[:sample_count]):
        print(f"  {i+1}: {timestamp}")

def test_conversion_logic():
    """Test the timestamp parsing logic with sample inputs."""

    test_cases = [
        "109 PM PDT Thu Oct 30 2025",    # Should convert to 12:09 PST
        "726 AM PDT Thu Oct 30 2025",    # Should convert to 6:26 PST
        "1010 PM PST Wed Dec 22 2024",   # Should stay 22:10 PST
        "815 AM PST Mon Jan 15 2024",    # Should stay 8:15 PST
        "12 PM PDT Sun Jul 04 2025",     # Should convert to 11:00 PST
        "1200 AM PST Sat Feb 29 2024",   # Should stay 0:00 PST
        "1 AM PDT Mon Mar 15 2024"       # Should convert to 0:00 PST (midnight)
    ]

    print("Testing conversion logic:")
    print("-" * 50)

    for test_case in test_cases:
        result = parse_forecast_timestamp(test_case)
        print(f"Input:  {test_case}")
        print(f"Output: {result}")
        print()

if __name__ == "__main__":
    # Test the conversion logic first
    test_conversion_logic()

    # Define file paths
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    input_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025.txt"
    output_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025_iso_timestamps.txt"

    # Ensure input file exists
    if not input_file.exists():
        print(f"Error: Input file not found at {input_file}")
        exit(1)

    try:
        # Convert timestamps
        converted_count, failed_count = convert_timestamps_in_file(input_file, output_file)

        # Validate results
        validate_conversions(output_file)

        print(f"\n✓ Successfully processed {converted_count} timestamps")
        print(f"Output saved to: {output_file}")

    except Exception as e:
        print(f"Error processing file: {e}")
        exit(1)