#!/usr/bin/env python3
"""
Comprehensive wind data processing script with column filtering, hourly averaging,
data validation, and time range filtering.

Features:
1. Column filtering (remove unwanted measurements)
2. Hourly averaging (10 AM - 7 PM PST window)
3. Invalid data filtering (99.0, 999.0, 9999.0 sentinel values)
4. Time range filtering (keep only peak wind hours)

Default columns to remove: TIDE, VIS, DEWP, WTMP, MWD, APD, DPD, WVHT
Default columns to keep: DATETIME_PST, WDIR, WSPD, GST, PRES, ATMP

Follows data processing principles documented in CLAUDE.md.
"""

import argparse
from pathlib import Path
from datetime import datetime, timedelta
import statistics

def parse_header_columns(header_line):
    """
    Parse the header line to identify column positions.

    Args:
        header_line: Header line from the wind data file

    Returns:
        List of column names in order
    """
    # Remove the # prefix and split by whitespace
    columns = header_line.strip().lstrip('#').split()
    return columns

def is_valid_data_value(value, column_name):
    """
    Check if a data value is valid (not a sentinel/error value).

    Handles decimal precision issues: 99, 99.0, 99.00 are all treated as 99.
    Special case: WDIR can legitimately be 99 degrees.

    Args:
        value: String value from data file
        column_name: Name of the column being checked

    Returns:
        Boolean indicating if value is valid
    """
    try:
        float_val = float(value)

        # Check for sentinel values (sensor malfunction indicators)
        # Use approximate comparison to handle decimal precision issues
        sentinel_values = [99, 999, 9999]

        for sentinel in sentinel_values:
            if abs(float_val - sentinel) < 0.01:  # Within 0.01 of sentinel value
                # Special case: wind direction (WDIR) can legitimately be 99 degrees
                if column_name == 'WDIR' and abs(float_val - 99) < 0.01:
                    # 99 degrees is valid wind direction, but check it's reasonable
                    if 0 <= float_val <= 360:
                        continue  # This 99 is valid for wind direction

                return False  # This is a sentinel value

        # Additional checks for wind direction
        if column_name == 'WDIR':
            # Wind angles > 360 are invalid
            if float_val > 360:
                return False

        return True

    except ValueError:
        return False

def is_essential_parameter(column_name):
    """
    Determine if a parameter is essential for wind forecasting.

    Essential parameters: DATETIME_PST, WDIR, WSPD, GST
    Non-essential parameters: PRES, ATMP (nice to have but not critical)

    Args:
        column_name: Name of the column

    Returns:
        Boolean indicating if parameter is essential
    """
    essential_params = ['DATETIME_PST', 'WDIR', 'WSPD', 'GST']
    return column_name in essential_params

def parse_iso_timestamp(timestamp_str):
    """
    Parse ISO 8601 timestamp string to datetime object.

    Args:
        timestamp_str: ISO timestamp like "2016-10-04T02:00:00-08:00"

    Returns:
        datetime object or None if parsing fails
    """
    try:
        # Remove timezone info for simple parsing (we know it's PST)
        if timestamp_str.endswith('-08:00'):
            timestamp_str = timestamp_str[:-6]
        return datetime.fromisoformat(timestamp_str)
    except ValueError:
        return None

def is_in_time_window(dt, start_hour=10, end_hour=19):
    """
    Check if datetime is within the specified hour window (10 AM - 7 PM by default).

    Args:
        dt: datetime object
        start_hour: Start hour (24-hour format, inclusive)
        end_hour: End hour (24-hour format, exclusive)

    Returns:
        Boolean indicating if time is in window
    """
    return start_hour <= dt.hour < end_hour

def get_hour_start(dt):
    """
    Get the start of the hour for a given datetime.

    Args:
        dt: datetime object

    Returns:
        datetime object rounded down to the start of the hour
    """
    return dt.replace(minute=0, second=0, microsecond=0)

def convert_ms_to_knots(value_ms):
    """
    Convert wind speed from m/s to knots.

    Args:
        value_ms: Wind speed in meters per second

    Returns:
        Wind speed in knots (1 m/s = 1.9 knots)
    """
    return value_ms * 1.9

def aggregate_wind_data(data_points, columns):
    """
    Aggregate wind data points with proper handling for different parameters.

    Strategy: Keep hourly records if essential wind parameters are valid.
    - Essential: DATETIME_PST, WDIR, WSPD, GST (must have valid data)
    - Non-essential: PRES, ATMP (use null if no valid data)

    Processing:
    - WSPD: Average wind speed, converted to knots
    - GST: Maximum gust speed, converted to knots
    - WDIR: Simple average
    - PRES, ATMP: Simple average if valid, null if not
    - DATETIME_PST: Use start of hour interval

    Args:
        data_points: List of data rows (each row is list of values)
        columns: List of column names

    Returns:
        List representing aggregated data row, or None if essential data is missing
    """
    if not data_points:
        return None

    # Initialize containers for valid values per column
    valid_values = {col: [] for col in columns}

    # Collect valid values for each column
    for data_row in data_points:
        for i, (col, value) in enumerate(zip(columns, data_row)):
            if col == 'DATETIME_PST':
                continue  # Skip timestamp column

            if is_valid_data_value(value, col):
                try:
                    valid_values[col].append(float(value))
                except ValueError:
                    continue

    # Check if we have essential wind parameters
    essential_missing = []
    for col in columns:
        if is_essential_parameter(col) and col != 'DATETIME_PST':
            if not valid_values[col]:
                essential_missing.append(col)

    if essential_missing:
        # Skip this hourly record - essential wind data is missing
        return None

    # Calculate aggregated values
    aggregated_row = []
    for i, col in enumerate(columns):
        if col == 'DATETIME_PST':
            # Use the first timestamp (start of hour)
            aggregated_row.append(data_points[0][i])
        else:
            valid_vals = valid_values[col]
            if valid_vals:
                if col == 'WSPD':
                    # Wind speed: average then convert to knots
                    avg_val_ms = statistics.mean(valid_vals)
                    avg_val_kt = convert_ms_to_knots(avg_val_ms)
                    aggregated_row.append(f"{avg_val_kt:.1f}")
                elif col == 'GST':
                    # Wind gust: maximum then convert to knots
                    max_val_ms = max(valid_vals)
                    max_val_kt = convert_ms_to_knots(max_val_ms)
                    aggregated_row.append(f"{max_val_kt:.1f}")
                elif col == 'WDIR':
                    # Wind direction: average as integer
                    avg_val = statistics.mean(valid_vals)
                    aggregated_row.append(f"{int(round(avg_val))}")
                elif col in ['PRES', 'ATMP']:
                    # Pressure and temperature: average with 1 decimal
                    avg_val = statistics.mean(valid_vals)
                    aggregated_row.append(f"{avg_val:.1f}")
                else:
                    # Default: average with 1 decimal place
                    avg_val = statistics.mean(valid_vals)
                    aggregated_row.append(f"{avg_val:.1f}")
            else:
                # No valid data for this column
                if is_essential_parameter(col):
                    # Should not happen due to check above, but safety net
                    return None
                else:
                    # Non-essential parameter: use null indicator
                    aggregated_row.append("null")

    return aggregated_row

def process_wind_data_comprehensive(input_file_path, output_file_path, columns_to_remove=None, columns_to_keep=None, enable_averaging=True):
    """
    Comprehensive wind data processing with column filtering, hourly averaging,
    data validation, and time range filtering.

    Args:
        input_file_path: Path to input wind data file
        output_file_path: Path for processed output file
        columns_to_remove: List of column names to remove (default: standard unwanted columns)
        columns_to_keep: List of column names to keep (overrides columns_to_remove if specified)
        enable_averaging: Whether to perform hourly averaging and time filtering
    """

    # Default columns to remove
    if columns_to_remove is None:
        columns_to_remove = ['TIDE', 'VIS', 'DEWP', 'WTMP', 'MWD', 'APD', 'DPD', 'WVHT']

    print(f"Reading from: {input_file_path}")
    print(f"Writing to: {output_file_path}")
    if enable_averaging:
        print("Hourly averaging enabled (10 AM - 7 PM PST window)")

    with open(input_file_path, 'r', encoding='utf-8') as infile:
        lines = infile.readlines()

    if not lines:
        print("Error: Input file is empty")
        return

    # Parse headers
    header_line = None
    units_line = None
    for i, line in enumerate(lines):
        if line.startswith('#') and header_line is None:
            header_line = line
        elif line.startswith('#') and header_line is not None:
            units_line = line
            break

    if header_line is None:
        print("Error: No header line found in file")
        return

    # Parse column structure
    columns = parse_header_columns(header_line)
    print(f"Original columns: {columns}")

    # Determine which columns to keep
    if columns_to_keep is not None:
        keep_columns = columns_to_keep
    else:
        keep_columns = [col for col in columns if col not in columns_to_remove]

    print(f"Columns to keep: {keep_columns}")

    # Find indices of columns to keep
    keep_indices = []
    for col in keep_columns:
        if col in columns:
            keep_indices.append(columns.index(col))
    keep_indices.sort()

    if not keep_indices:
        print("Error: No valid columns to keep")
        return

    # Process data lines
    data_lines = []
    for line in lines:
        if not line.startswith('#') and line.strip():
            columns_data = line.strip().split()
            if len(columns_data) >= len(columns):
                # Filter columns
                filtered_data = [columns_data[idx] if idx < len(columns_data) else '' for idx in keep_indices]
                data_lines.append(filtered_data)

    print(f"Loaded {len(data_lines)} data lines")

    if enable_averaging:
        # Group data by hour and perform averaging
        hourly_groups = {}
        processed_count = 0
        time_filtered_count = 0

        for data_row in data_lines:
            timestamp_str = data_row[0]  # First column should be DATETIME_PST
            dt = parse_iso_timestamp(timestamp_str)

            if dt is None:
                continue

            # Filter by time window (10 AM - 7 PM)
            if not is_in_time_window(dt):
                continue

            time_filtered_count += 1

            # Group by hour
            hour_start = get_hour_start(dt)
            hour_key = hour_start.strftime("%Y-%m-%d %H:00")

            if hour_key not in hourly_groups:
                hourly_groups[hour_key] = []
            hourly_groups[hour_key].append(data_row)

        print(f"Time filtered: {time_filtered_count} lines (10 AM - 7 PM window)")
        print(f"Grouped into {len(hourly_groups)} hourly intervals")

        # Calculate averages for each hour
        averaged_lines = []
        for hour_key in sorted(hourly_groups.keys()):
            data_points = hourly_groups[hour_key]

            # Set timestamp to start of hour
            hour_dt = datetime.strptime(hour_key, "%Y-%m-%d %H:%M")
            hour_timestamp = hour_dt.strftime("%Y-%m-%dT%H:%M:%S-08:00")

            # Update first data point's timestamp to hour start
            data_points[0][0] = hour_timestamp

            aggregated_row = aggregate_wind_data(data_points, keep_columns)
            if aggregated_row:
                averaged_lines.append(aggregated_row)
                processed_count += 1

        data_to_write = averaged_lines
        print(f"Generated {processed_count} hourly averages")

    else:
        # No averaging, just filter time window if enabled
        data_to_write = data_lines
        processed_count = len(data_lines)

    # Write output file
    output_lines = []

    # Write headers
    filtered_header_cols = [columns[idx] for idx in keep_indices]
    output_lines.append('#' + ' '.join(filtered_header_cols) + '\n')

    if units_line:
        units_cols = parse_header_columns(units_line)
        filtered_units_cols = []
        for idx in keep_indices:
            if idx < len(units_cols):
                unit = units_cols[idx]
                # Convert wind speed units from m/s to kt
                if unit == 'm/s' and columns[idx] in ['WSPD', 'GST']:
                    unit = 'kt'
                filtered_units_cols.append(unit)
            else:
                filtered_units_cols.append('')
        output_lines.append('#' + ' '.join(filtered_units_cols) + '\n')

    # Write data
    for data_row in data_to_write:
        output_lines.append(' '.join(data_row) + '\n')

    with open(output_file_path, 'w', encoding='utf-8') as outfile:
        outfile.writelines(output_lines)

    print(f"\nProcessing complete!")
    print(f"Output lines: {len(data_to_write)} data lines")

    return processed_count, 0

# Legacy compatibility function
def filter_wind_data_columns(input_file_path, output_file_path, columns_to_remove=None, columns_to_keep=None):
    """
    Legacy wrapper for backward compatibility.
    """
    return process_wind_data_comprehensive(input_file_path, output_file_path, columns_to_remove, columns_to_keep, enable_averaging=False)

def validate_filtering(input_file_path, output_file_path, sample_count=10):
    """
    Validate the column filtering by comparing sample lines.

    Args:
        input_file_path: Original file path
        output_file_path: Filtered file path
        sample_count: Number of samples to compare
    """

    print(f"\nValidating column filtering...")
    print("=" * 60)

    # Read both files
    with open(input_file_path, 'r') as infile:
        input_lines = [line.strip() for line in infile.readlines()]

    with open(output_file_path, 'r') as outfile:
        output_lines = [line.strip() for line in outfile.readlines()]

    # Find header lines
    input_header = None
    output_header = None

    for line in input_lines:
        if line.startswith('#') and 'WDIR' in line:  # Main header line
            input_header = parse_header_columns(line)
            break

    for line in output_lines:
        if line.startswith('#') and 'WDIR' in line:  # Main header line
            output_header = parse_header_columns(line)
            break

    if input_header and output_header:
        print(f"Original columns ({len(input_header)}): {input_header}")
        print(f"Filtered columns ({len(output_header)}): {output_header}")
        print()

    # Compare sample data lines
    input_data_lines = [line for line in input_lines if not line.startswith('#') and line.strip()]
    output_data_lines = [line for line in output_lines if not line.startswith('#') and line.strip()]

    print(f"Original file: {len(input_data_lines)} data lines")
    print(f"Filtered file: {len(output_data_lines)} data lines")

    print(f"\nSample comparisons (showing first {sample_count}):")
    print("-" * 60)

    for i in range(min(sample_count, len(input_data_lines), len(output_data_lines))):
        input_cols = input_data_lines[i].split()
        output_cols = output_data_lines[i].split()

        print(f"Line {i+1}:")
        print(f"  Original ({len(input_cols)} cols): {' '.join(input_cols[:5])}...")
        print(f"  Filtered ({len(output_cols)} cols): {' '.join(output_cols[:5])}...")
        print()

def main():
    """Main function to handle command line arguments and execute filtering."""

    parser = argparse.ArgumentParser(description='Filter wind data file columns')
    parser.add_argument('input_file', help='Input wind data file path')
    parser.add_argument('-o', '--output', help='Output file path (default: input_file_filtered.txt)')
    parser.add_argument('--remove', nargs='+', help='Columns to remove (overrides defaults)')
    parser.add_argument('--keep', nargs='+', help='Columns to keep (overrides --remove)')
    parser.add_argument('--validate', action='store_true', help='Run validation after filtering')

    args = parser.parse_args()

    input_path = Path(args.input_file)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        return

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.parent / f"{input_path.stem}_filtered{input_path.suffix}"

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Determine columns to remove/keep
    columns_to_remove = args.remove if args.remove else None
    columns_to_keep = args.keep if args.keep else None

    try:
        # Filter the file
        processed_count, failed_count = filter_wind_data_columns(
            input_path, output_path, columns_to_remove, columns_to_keep
        )

        # Validate if requested
        if args.validate:
            validate_filtering(input_path, output_path)

        print(f"\n✓ Successfully filtered {processed_count} data lines")
        print(f"Output saved to: {output_path}")

    except Exception as e:
        print(f"Error processing file: {e}")

if __name__ == "__main__":
    # If run without arguments, use default behavior for 2016.txt processing
    import sys

    if len(sys.argv) == 1:
        # Default mode for 2016.txt processing
        base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
        input_file = base_dir / "data/cleaned/wind_2016_pst.txt"
        output_file = base_dir / "data/cleaned/wind_2016_pst_filtered.txt"

        if not input_file.exists():
            print(f"Error: Input file not found at {input_file}")
            print("Please run with explicit file paths or ensure wind_2016_pst.txt exists")
            exit(1)

        print("Running in comprehensive mode for 2016.txt processing...")
        print("Features: Column filtering + hourly averaging + time window filtering + data validation")

        # Use comprehensive processing with averaging
        processed_count, failed_count = process_wind_data_comprehensive(
            input_file, output_file, enable_averaging=True
        )

        print(f"\n✓ Successfully processed {processed_count} hourly averages")
        print(f"Output saved to: {output_file}")

        # Update output filename for clarity
        new_output_file = base_dir / "data/cleaned/wind_2016_pst_hourly_averaged.txt"
        if output_file != new_output_file:
            import shutil
            shutil.move(str(output_file), str(new_output_file))
            print(f"Renamed to: {new_output_file}")
    else:
        # Command line mode
        main()