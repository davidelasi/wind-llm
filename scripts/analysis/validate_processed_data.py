#!/usr/bin/env python3
"""
Validation script to check processed wind data for sentinel values.
This will help verify if the current processed files contain invalid data.
"""

from pathlib import Path
import re

def validate_processed_file(file_path):
    """
    Validate a processed wind data file for sentinel values and data quality.

    Args:
        file_path: Path to the processed wind data file

    Returns:
        Dictionary with validation results
    """
    print(f"\nValidating: {file_path}")

    with open(file_path, 'r') as file:
        lines = file.readlines()

    # Find header
    header_line = None
    data_lines = []

    for line in lines:
        if line.startswith('#') and 'DATETIME_PST' in line:
            header_line = line.strip().lstrip('#').split()
        elif not line.startswith('#') and line.strip():
            data_lines.append(line.strip())

    if not header_line:
        return {"error": "No header found"}

    print(f"  Columns: {header_line}")
    print(f"  Data lines: {len(data_lines)}")

    # Check for sentinel values
    sentinel_issues = {
        "lines_with_999": [],
        "lines_with_99": [],
        "null_values": 0,
        "invalid_pressure": 0,
        "invalid_temperature": 0,
        "invalid_wind_dir": 0,
        "invalid_wind_speed": 0,
        "invalid_gust": 0
    }

    for i, line in enumerate(data_lines):
        columns = line.split()
        if len(columns) != len(header_line):
            continue

        for j, (col_name, value) in enumerate(zip(header_line, columns)):
            if col_name == 'DATETIME_PST':
                continue

            try:
                float_val = float(value)

                # Check for sentinel values
                if abs(float_val - 999) < 0.01:
                    sentinel_issues["lines_with_999"].append((i+1, col_name, value))
                    if col_name == 'PRES':
                        sentinel_issues["invalid_pressure"] += 1
                    elif col_name == 'ATMP':
                        sentinel_issues["invalid_temperature"] += 1
                    elif col_name == 'WDIR':
                        sentinel_issues["invalid_wind_dir"] += 1
                    elif col_name == 'WSPD':
                        sentinel_issues["invalid_wind_speed"] += 1
                    elif col_name == 'GST':
                        sentinel_issues["invalid_gust"] += 1

                elif abs(float_val - 99) < 0.01 and col_name != 'WDIR':
                    # 99 is invalid unless it's wind direction
                    sentinel_issues["lines_with_99"].append((i+1, col_name, value))

            except ValueError:
                if value.lower() == 'null':
                    sentinel_issues["null_values"] += 1

    # Print summary
    if any(sentinel_issues["lines_with_999"]) or any(sentinel_issues["lines_with_99"]):
        print("  🔴 ISSUES FOUND:")

        if sentinel_issues["lines_with_999"]:
            print(f"    - {len(sentinel_issues['lines_with_999'])} instances of 999 values")
            print(f"      Pressure: {sentinel_issues['invalid_pressure']}")
            print(f"      Temperature: {sentinel_issues['invalid_temperature']}")
            print(f"      Wind Dir: {sentinel_issues['invalid_wind_dir']}")
            print(f"      Wind Speed: {sentinel_issues['invalid_wind_speed']}")
            print(f"      Gusts: {sentinel_issues['invalid_gust']}")

            # Show first few examples
            print("    First 5 examples:")
            for line_num, col, val in sentinel_issues["lines_with_999"][:5]:
                print(f"      Line {line_num}: {col} = {val}")

        if sentinel_issues["lines_with_99"]:
            print(f"    - {len(sentinel_issues['lines_with_99'])} instances of 99 values (non-wind-dir)")
            for line_num, col, val in sentinel_issues["lines_with_99"][:5]:
                print(f"      Line {line_num}: {col} = {val}")

    else:
        print("  ✅ No sentinel values found")

    if sentinel_issues["null_values"] > 0:
        print(f"  📝 {sentinel_issues['null_values']} null values (acceptable for non-essential params)")

    return sentinel_issues

def main():
    """Main validation function."""
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    cleaned_dir = base_dir / "data/cleaned"

    print("WIND DATA VALIDATION REPORT")
    print("=" * 50)

    # Find all processed files
    processed_files = list(cleaned_dir.glob("wind_*_processed.txt"))
    processed_files.sort()

    if not processed_files:
        print("No processed files found!")
        return

    total_issues = 0
    files_with_issues = 0

    for file_path in processed_files:
        issues = validate_processed_file(file_path)

        if "error" in issues:
            print(f"  Error: {issues['error']}")
            continue

        file_issues = (len(issues.get("lines_with_999", [])) +
                      len(issues.get("lines_with_99", [])))

        if file_issues > 0:
            total_issues += file_issues
            files_with_issues += 1

    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Files processed: {len(processed_files)}")
    print(f"Files with issues: {files_with_issues}")
    print(f"Total sentinel value issues: {total_issues}")

    if total_issues > 0:
        print("\n🔴 REPROCESSING NEEDED: Files contain sentinel values that should have been filtered out.")
    else:
        print("\n✅ ALL FILES CLEAN: No sentinel values found in processed data.")

if __name__ == "__main__":
    main()