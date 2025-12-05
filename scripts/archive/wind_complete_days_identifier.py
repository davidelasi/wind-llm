#!/usr/bin/env python3
"""
Script to identify complete days in wind data without gaps or sensor malfunctions.

A "complete day" is defined as:
1. Has all 9 hours of data (10 AM - 6 PM PST, inclusive)
2. All essential wind parameters (WDIR, WSPD, GST) are valid (not null)
3. No gaps in the hourly sequence
4. Optional: Pressure and temperature data available (configurable)

This creates a high-quality dataset for LLM training.
"""

import argparse
from pathlib import Path
from datetime import datetime, timedelta
import csv

def parse_iso_date(iso_timestamp):
    """
    Parse ISO timestamp to extract date.

    Args:
        iso_timestamp: String like "2024-01-01T10:00:00-08:00"

    Returns:
        datetime.date object or None if parsing fails
    """
    try:
        if iso_timestamp.endswith('-08:00'):
            iso_timestamp = iso_timestamp[:-6]
        dt = datetime.fromisoformat(iso_timestamp)
        return dt.date()
    except ValueError:
        return None

def parse_iso_hour(iso_timestamp):
    """
    Parse ISO timestamp to extract hour.

    Args:
        iso_timestamp: String like "2024-01-01T10:00:00-08:00"

    Returns:
        Integer hour (0-23) or None if parsing fails
    """
    try:
        if iso_timestamp.endswith('-08:00'):
            iso_timestamp = iso_timestamp[:-6]
        dt = datetime.fromisoformat(iso_timestamp)
        return dt.hour
    except ValueError:
        return None

def is_valid_wind_data(wdir, wspd, gst):
    """
    Check if wind data values are valid (not null or malformed).

    Args:
        wdir, wspd, gst: String values from data file

    Returns:
        Boolean indicating if all wind data is valid
    """
    if any(val.lower() == 'null' for val in [wdir, wspd, gst]):
        return False

    try:
        wdir_val = float(wdir)
        wspd_val = float(wspd)
        gst_val = float(gst)

        # Basic sanity checks
        if not (0 <= wdir_val <= 360):
            return False
        if wspd_val < 0 or gst_val < 0:
            return False
        if gst_val < wspd_val:  # Gust should be >= sustained wind
            return False

        return True
    except ValueError:
        return False

def is_complete_day(day_data, require_auxiliary_data=False):
    """
    Determine if a day has complete data.

    Args:
        day_data: Dictionary with hour as key, data row as value
        require_auxiliary_data: Whether to require valid PRES and ATMP data

    Returns:
        Tuple (is_complete: bool, completeness_info: dict)
    """
    # Expected hours: 10 AM to 6 PM (inclusive) = 9 hours
    expected_hours = list(range(10, 19))  # 10, 11, 12, 13, 14, 15, 16, 17, 18

    completeness_info = {
        "total_hours": len(day_data),
        "expected_hours": len(expected_hours),
        "missing_hours": [],
        "invalid_wind_hours": [],
        "missing_auxiliary_hours": [],
        "has_all_hours": True,
        "has_valid_wind": True,
        "has_valid_auxiliary": True
    }

    # Check for missing hours
    for hour in expected_hours:
        if hour not in day_data:
            completeness_info["missing_hours"].append(hour)
            completeness_info["has_all_hours"] = False

    # Check data quality for existing hours
    for hour, data_row in day_data.items():
        if hour not in expected_hours:
            continue

        # Extract columns (assuming order: DATETIME_PST, WDIR, WSPD, GST, PRES, ATMP)
        if len(data_row) < 6:
            completeness_info["invalid_wind_hours"].append(hour)
            completeness_info["has_valid_wind"] = False
            continue

        timestamp, wdir, wspd, gst, pres, atmp = data_row[:6]

        # Check wind data validity
        if not is_valid_wind_data(wdir, wspd, gst):
            completeness_info["invalid_wind_hours"].append(hour)
            completeness_info["has_valid_wind"] = False

        # Check auxiliary data if required
        if require_auxiliary_data:
            if pres.lower() == 'null' or atmp.lower() == 'null':
                completeness_info["missing_auxiliary_hours"].append(hour)
                completeness_info["has_valid_auxiliary"] = False

    # Determine overall completeness
    is_complete = (
        completeness_info["has_all_hours"] and
        completeness_info["has_valid_wind"] and
        (not require_auxiliary_data or completeness_info["has_valid_auxiliary"])
    )

    return is_complete, completeness_info

def analyze_wind_file(file_path, require_auxiliary_data=False):
    """
    Analyze a wind data file to identify complete days.

    Args:
        file_path: Path to processed wind data file
        require_auxiliary_data: Whether to require PRES and ATMP data

    Returns:
        Tuple (complete_days: list, analysis_summary: dict)
    """
    print(f"Analyzing: {file_path}")

    with open(file_path, 'r') as file:
        lines = file.readlines()

    # Find header and data
    header_line = None
    data_lines = []

    for line in lines:
        if line.startswith('#') and 'DATETIME_PST' in line:
            header_line = line.strip().lstrip('#').split()
        elif not line.startswith('#') and line.strip():
            data_lines.append(line.strip().split())

    if not header_line:
        return [], {"error": "No header found"}

    # Group data by date
    daily_data = {}
    for data_row in data_lines:
        if len(data_row) < 1:
            continue

        timestamp = data_row[0]
        date = parse_iso_date(timestamp)
        hour = parse_iso_hour(timestamp)

        if date is None or hour is None:
            continue

        if date not in daily_data:
            daily_data[date] = {}

        daily_data[date][hour] = data_row

    # Analyze each day
    complete_days = []
    analysis_summary = {
        "total_days": len(daily_data),
        "complete_days": 0,
        "partial_days": 0,
        "incomplete_reasons": {
            "missing_hours": 0,
            "invalid_wind": 0,
            "missing_auxiliary": 0
        }
    }

    for date, day_data in daily_data.items():
        is_complete, completeness_info = is_complete_day(day_data, require_auxiliary_data)

        if is_complete:
            complete_days.append({
                "date": date.isoformat(),
                "hours": len(day_data),
                "completeness_info": completeness_info
            })
            analysis_summary["complete_days"] += 1
        else:
            analysis_summary["partial_days"] += 1

            # Track reasons for incompleteness
            if not completeness_info["has_all_hours"]:
                analysis_summary["incomplete_reasons"]["missing_hours"] += 1
            if not completeness_info["has_valid_wind"]:
                analysis_summary["incomplete_reasons"]["invalid_wind"] += 1
            if require_auxiliary_data and not completeness_info["has_valid_auxiliary"]:
                analysis_summary["incomplete_reasons"]["missing_auxiliary"] += 1

    print(f"  Total days: {analysis_summary['total_days']}")
    print(f"  Complete days: {analysis_summary['complete_days']}")
    print(f"  Partial days: {analysis_summary['partial_days']}")

    return complete_days, analysis_summary

def analyze_all_years(data_dir, require_auxiliary_data=False):
    """
    Analyze all processed wind data files to find complete days.

    Args:
        data_dir: Directory containing processed wind files
        require_auxiliary_data: Whether to require PRES and ATMP data

    Returns:
        Tuple (all_complete_days: list, yearly_summaries: dict)
    """
    print("ANALYZING ALL WIND DATA FILES FOR COMPLETE DAYS")
    print("=" * 60)

    if require_auxiliary_data:
        print("Requirement: Complete 9-hour wind data + auxiliary data (PRES, ATMP)")
    else:
        print("Requirement: Complete 9-hour wind data (WDIR, WSPD, GST)")

    print("Time window: 10 AM - 6 PM PST (9 hours)")
    print()

    processed_files = list(data_dir.glob("wind_*_processed.txt"))
    processed_files.sort()

    if not processed_files:
        print("No processed files found!")
        return [], {}

    all_complete_days = []
    yearly_summaries = {}

    for file_path in processed_files:
        # Extract year from filename
        year = file_path.stem.split('_')[1]

        complete_days, summary = analyze_wind_file(file_path, require_auxiliary_data)

        yearly_summaries[year] = summary
        all_complete_days.extend(complete_days)

        print()

    return all_complete_days, yearly_summaries

def save_complete_days_list(complete_days, output_file, include_details=False):
    """
    Save the list of complete days to a file.

    Args:
        complete_days: List of complete day dictionaries
        output_file: Path to output file
        include_details: Whether to include detailed completeness info
    """
    print(f"Saving complete days list to: {output_file}")

    # Sort by date
    complete_days.sort(key=lambda x: x['date'])

    if output_file.suffix == '.csv':
        # Save as CSV
        with open(output_file, 'w', newline='') as csvfile:
            if include_details:
                fieldnames = ['date', 'hours', 'year', 'month', 'day', 'weekday']
            else:
                fieldnames = ['date', 'year', 'month', 'day', 'weekday']

            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for day_info in complete_days:
                date_obj = datetime.fromisoformat(day_info['date']).date()
                row = {
                    'date': day_info['date'],
                    'year': date_obj.year,
                    'month': date_obj.month,
                    'day': date_obj.day,
                    'weekday': date_obj.strftime('%A')
                }
                if include_details:
                    row['hours'] = day_info['hours']

                writer.writerow(row)

    else:
        # Save as text file
        with open(output_file, 'w') as file:
            file.write("# Complete Wind Data Days\n")
            file.write("# Days with complete 9-hour datasets (10 AM - 6 PM PST)\n")
            file.write("# Format: YYYY-MM-DD\n")
            file.write("#\n")

            current_year = None
            for day_info in complete_days:
                date_obj = datetime.fromisoformat(day_info['date']).date()

                # Add year separator
                if current_year != date_obj.year:
                    if current_year is not None:
                        file.write("\n")
                    file.write(f"# {date_obj.year}\n")
                    current_year = date_obj.year

                file.write(f"{day_info['date']}\n")

    print(f"Saved {len(complete_days)} complete days")

def main():
    """Main function with command line interface."""
    parser = argparse.ArgumentParser(description='Identify complete days in wind data')
    parser.add_argument('--data-dir', type=str, help='Directory containing processed wind files')
    parser.add_argument('--output', '-o', type=str, help='Output file path')
    parser.add_argument('--require-auxiliary', action='store_true',
                       help='Require pressure and temperature data (default: wind data only)')
    parser.add_argument('--format', choices=['txt', 'csv'], default='txt',
                       help='Output format (default: txt)')
    parser.add_argument('--details', action='store_true',
                       help='Include detailed information in output')

    args = parser.parse_args()

    # Set defaults
    if not args.data_dir:
        base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
        data_dir = base_dir / "data/cleaned"
    else:
        data_dir = Path(args.data_dir)

    if not args.output:
        base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
        output_dir = base_dir / "data/training"
        output_dir.mkdir(parents=True, exist_ok=True)

        suffix = "_wind_only" if not args.require_auxiliary else "_full_data"
        output_file = output_dir / f"complete_days{suffix}.{args.format}"
    else:
        output_file = Path(args.output)

    # Analyze all years
    complete_days, yearly_summaries = analyze_all_years(data_dir, args.require_auxiliary)

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    total_complete = len(complete_days)
    total_days = sum(summary.get("total_days", 0) for summary in yearly_summaries.values())

    print(f"Total days analyzed: {total_days:,}")
    print(f"Complete days found: {total_complete:,}")
    print(f"Completeness rate: {(total_complete/total_days*100):.1f}%")

    print(f"\nYearly breakdown:")
    for year, summary in yearly_summaries.items():
        if "error" not in summary:
            rate = (summary["complete_days"] / summary["total_days"] * 100) if summary["total_days"] > 0 else 0
            print(f"  {year}: {summary['complete_days']:,}/{summary['total_days']:,} ({rate:.1f}%)")

    # Save results
    if complete_days:
        save_complete_days_list(complete_days, output_file, args.details)

        print(f"\n✅ Complete days list saved to: {output_file}")
        print(f"Use this list to select high-quality training data for the wind forecasting LLM.")

        # Show sample dates
        print(f"\nSample complete days:")
        for i, day_info in enumerate(complete_days[:10]):
            date_obj = datetime.fromisoformat(day_info['date']).date()
            print(f"  {date_obj.strftime('%Y-%m-%d (%A)')}")
        if len(complete_days) > 10:
            print(f"  ... and {len(complete_days) - 10} more")

    else:
        print("\n❌ No complete days found!")

if __name__ == "__main__":
    main()