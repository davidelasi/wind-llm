#!/usr/bin/env python3
"""
Script to convert wind data timestamps from GMT to PST in ISO 8601 format.

Input format: 2016 10 04 10 00 (YY MM DD hh mm in GMT)
Output format: 2016-10-04T02:00:00-08:00 (ISO 8601 in PST)

Converts GMT to PST by subtracting 8 hours from GMT.
Replaces the first 5 columns (YY MM DD hh mm) with single ISO timestamp column.
"""

import re
from datetime import datetime, timedelta
from pathlib import Path

def convert_gmt_to_pst_iso(year, month, day, hour, minute):
    """
    Convert GMT timestamp to PST in ISO 8601 format.

    Args:
        year, month, day, hour, minute: Integer timestamp components in GMT

    Returns:
        String in ISO 8601 format with PST timezone (-08:00)
    """
    try:
        # Create datetime object in GMT
        gmt_dt = datetime(year, month, day, hour, minute)

        # Convert to PST by subtracting 8 hours
        pst_dt = gmt_dt - timedelta(hours=8)

        # Format as ISO 8601 with PST timezone
        iso_timestamp = pst_dt.strftime("%Y-%m-%dT%H:%M:%S-08:00")

        return iso_timestamp

    except ValueError as e:
        print(f"Error converting timestamp {year}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}: {e}")
        return None

def convert_wind_data_file(input_file_path, output_file_path):
    """
    Convert wind data file from GMT columns to PST ISO 8601 timestamp.

    Args:
        input_file_path: Path to the input wind data file
        output_file_path: Path for the output file with converted timestamps
    """

    print(f"Reading from: {input_file_path}")
    print(f"Writing to: {output_file_path}")

    with open(input_file_path, 'r', encoding='utf-8') as infile:
        lines = infile.readlines()

    converted_lines = []
    converted_count = 0
    failed_count = 0

    for i, line in enumerate(lines):
        line = line.strip()

        # Skip comment lines (start with #)
        if line.startswith('#'):
            if i == 0:
                # Modify the header to reflect new format
                converted_lines.append("#DATETIME_PST                WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE\n")
            elif i == 1:
                # Modify the units line
                converted_lines.append("#ISO_8601_PST                degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC   mi    ft\n")
            else:
                converted_lines.append(line + '\n')
            continue

        # Skip empty lines
        if not line:
            converted_lines.append(line + '\n')
            continue

        # Split the line into columns
        columns = line.split()

        if len(columns) < 5:
            # Not enough columns, keep as is
            converted_lines.append(line + '\n')
            failed_count += 1
            continue

        try:
            # Parse the first 5 columns (date/time in GMT)
            year = int(columns[0])
            month = int(columns[1])
            day = int(columns[2])
            hour = int(columns[3])
            minute = int(columns[4])

            # Convert to PST ISO format
            iso_timestamp = convert_gmt_to_pst_iso(year, month, day, hour, minute)

            if iso_timestamp:
                # Replace first 5 columns with ISO timestamp
                remaining_columns = columns[5:]  # All columns after date/time
                new_line = iso_timestamp + ' ' + ' '.join(remaining_columns) + '\n'
                converted_lines.append(new_line)
                converted_count += 1

                if converted_count % 10000 == 0:
                    print(f"Converted {converted_count} timestamps...")
            else:
                # Keep original line if conversion failed
                converted_lines.append(line + '\n')
                failed_count += 1

        except (ValueError, IndexError) as e:
            # Keep original line if parsing failed
            converted_lines.append(line + '\n')
            failed_count += 1
            if failed_count <= 5:  # Only print first few errors
                print(f"Failed to parse line {i+1}: {line[:50]}... Error: {e}")

    # Write converted content
    with open(output_file_path, 'w', encoding='utf-8') as outfile:
        outfile.writelines(converted_lines)

    print(f"\nConversion complete!")
    print(f"Successfully converted: {converted_count} timestamps")
    print(f"Failed conversions: {failed_count}")
    print(f"Total lines processed: {len(lines)}")

    return converted_count, failed_count

def validate_conversion(input_file_path, output_file_path, sample_count=10):
    """
    Validate the timestamp conversion by comparing sample lines.

    Args:
        input_file_path: Original file path
        output_file_path: Converted file path
        sample_count: Number of samples to compare
    """

    print(f"\nValidating conversion...")
    print("=" * 60)

    with open(input_file_path, 'r') as infile:
        input_lines = [line.strip() for line in infile.readlines() if not line.startswith('#') and line.strip()]

    with open(output_file_path, 'r') as outfile:
        output_lines = [line.strip() for line in outfile.readlines() if not line.startswith('#') and line.strip()]

    print(f"Original file: {len(input_lines)} data lines")
    print(f"Converted file: {len(output_lines)} data lines")

    print(f"\nSample conversions (showing first {sample_count}):")
    print("-" * 60)

    for i in range(min(sample_count, len(input_lines), len(output_lines))):
        input_cols = input_lines[i].split()
        output_cols = output_lines[i].split()

        if len(input_cols) >= 5:
            original_time = f"{input_cols[0]}-{input_cols[1]:0>2}-{input_cols[2]:0>2} {input_cols[3]:0>2}:{input_cols[4]:0>2} GMT"
            converted_time = output_cols[0] if output_cols else "ERROR"

            print(f"Line {i+1}:")
            print(f"  Original:  {original_time}")
            print(f"  Converted: {converted_time}")

            # Check data integrity (remaining columns should match)
            if len(input_cols) >= 6 and len(output_cols) >= 2:
                original_data = input_cols[5:8]  # Show first few data columns
                converted_data = output_cols[1:4]
                print(f"  Data check: {original_data} → {converted_data}")
            print()

def test_conversion_logic():
    """Test the GMT to PST conversion logic with sample inputs."""

    test_cases = [
        (2016, 10, 4, 10, 0),   # 10:00 GMT → 2:00 PST
        (2016, 1, 1, 8, 30),    # 08:30 GMT → 0:30 PST
        (2016, 12, 31, 5, 45),  # 05:45 GMT → 21:45 PST (previous day)
        (2016, 6, 15, 0, 0),    # 00:00 GMT → 16:00 PST (previous day)
        (2016, 3, 1, 23, 59),   # 23:59 GMT → 15:59 PST
    ]

    print("Testing GMT to PST conversion logic:")
    print("-" * 50)

    for year, month, day, hour, minute in test_cases:
        result = convert_gmt_to_pst_iso(year, month, day, hour, minute)
        gmt_str = f"{year}-{month:02d}-{day:02d} {hour:02d}:{minute:02d} GMT"
        print(f"Input:  {gmt_str}")
        print(f"Output: {result}")
        print()

if __name__ == "__main__":
    # Test the conversion logic first
    test_conversion_logic()

    # Define file paths
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    input_file = base_dir / "data/raw/wind/2016.txt"
    output_file = base_dir / "data/cleaned/wind_2016_pst.txt"

    # Ensure input file exists
    if not input_file.exists():
        print(f"Error: Input file not found at {input_file}")
        exit(1)

    # Ensure output directory exists
    output_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Convert timestamps
        converted_count, failed_count = convert_wind_data_file(input_file, output_file)

        # Validate results
        validate_conversion(input_file, output_file)

        print(f"\n✓ Successfully processed {converted_count} wind data timestamps")
        print(f"Output saved to: {output_file}")

    except Exception as e:
        print(f"Error processing file: {e}")
        exit(1)