#!/usr/bin/env python3
"""
Consolidated Wind Data Processing Pipeline

This script consolidates all wind data processing steps into a single pipeline:
1. Convert GMT timestamps to PST ISO 8601 format
2. Filter relevant columns (WDIR, WSPD, GST, PRES, ATMP)
3. Remove invalid data (99.0, 999.0, 9999.0 sentinel values)
4. Aggregate hourly averages for 10 AM - 6 PM PST window
5. Identify complete days without gaps
6. Generate training-ready wind datasets

Usage:
    python3 process_wind_data.py <input_files_or_directory> [output_dir]

Args:
    input_files_or_directory: Single file, multiple files, or directory with wind data
    output_dir: Optional output directory (defaults to data/cleaned/wind/)
"""

import sys
import re
import csv
import statistics
from pathlib import Path
from datetime import datetime, timedelta


class WindTimestampConverter:
    """Converts wind data timestamps from GMT to PST in ISO 8601 format."""

    @staticmethod
    def convert_gmt_to_pst_iso(year, month, day, hour, minute):
        """Convert GMT timestamp to PST in ISO 8601 format."""
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

    def convert_wind_data_file(self, input_file_path, output_file_path):
        """Convert wind data file from GMT columns to PST ISO 8601 timestamp."""
        print(f"Converting timestamps: {input_file_path}")

        input_path = Path(input_file_path)
        output_path = Path(output_file_path)

        # Create output directory if it doesn't exist
        output_path.parent.mkdir(parents=True, exist_ok=True)

        line_count = 0
        converted_count = 0
        error_count = 0

        with open(input_path, 'r', encoding='utf-8') as infile, \
             open(output_path, 'w', encoding='utf-8', newline='') as outfile:

            for line_num, line in enumerate(infile, 1):
                line = line.strip()
                if not line:
                    continue

                line_count += 1

                # Handle header line
                if line.startswith('#'):
                    # Replace the first 5 columns (YY MM DD hh mm) with DATETIME_PST, keep WDIR onwards
                    header_parts = line.split()
                    if len(header_parts) >= 6:
                        # Keep columns 5+ (WDIR, WSPD, GST, etc.)
                        new_header = ['#DATETIME_PST'] + header_parts[5:]
                        outfile.write(' '.join(new_header) + '\n')
                    else:
                        outfile.write(line + '\n')
                    continue

                # Parse data line
                parts = line.split()
                if len(parts) < 5:
                    print(f"Warning: Line {line_num} has insufficient data columns, skipping")
                    error_count += 1
                    continue

                try:
                    year = int(parts[0])
                    month = int(parts[1])
                    day = int(parts[2])
                    hour = int(parts[3])
                    minute = int(parts[4])

                    # Convert to PST ISO format
                    iso_timestamp = self.convert_gmt_to_pst_iso(year, month, day, hour, minute)

                    if iso_timestamp:
                        # Write line with ISO timestamp replacing first 5 columns, keep WDIR onwards
                        remaining_data = parts[5:]  # Keep from WDIR onwards
                        new_line = [iso_timestamp] + remaining_data
                        outfile.write(' '.join(new_line) + '\n')
                        converted_count += 1
                    else:
                        error_count += 1

                except (ValueError, IndexError) as e:
                    print(f"Warning: Line {line_num} timestamp conversion error: {e}")
                    error_count += 1

        print(f"  Timestamp conversion completed:")
        print(f"    Lines processed: {line_count:,}")
        print(f"    Successfully converted: {converted_count:,}")
        print(f"    Errors: {error_count:,}")

        return converted_count, error_count


class WindDataProcessor:
    """Processes wind data with column filtering, validation, and hourly aggregation."""

    def __init__(self):
        # Essential columns for wind forecasting
        self.essential_columns = ['WDIR', 'WSPD', 'GST']

        # Default columns to keep (order matters for output)
        self.columns_to_keep = ['DATETIME_PST', 'WDIR', 'WSPD', 'GST', 'PRES', 'ATMP']

        # Columns that can be dropped if present
        self.columns_to_remove = ['TIDE', 'VIS', 'DEWP', 'WTMP', 'MWD', 'APD', 'DPD', 'WVHT']

    def parse_header_columns(self, header_line):
        """Parse the header line to identify column positions."""
        columns = header_line.strip().lstrip('#').split()
        return columns

    def is_valid_data_value(self, value, column_name):
        """Check if a data value is valid (not a sentinel/error value)."""
        if not value or value.strip() == '':
            return False

        try:
            numeric_value = float(value)

            # Special case: WDIR can legitimately be 99 degrees
            if column_name == 'WDIR':
                return 0.0 <= numeric_value <= 360.0

            # Check for common sentinel values
            sentinel_values = [99.0, 999.0, 9999.0]

            # Handle floating point precision
            for sentinel in sentinel_values:
                if abs(numeric_value - sentinel) < 0.01:
                    return False

            return True

        except ValueError:
            return False

    def parse_iso_hour(self, iso_timestamp):
        """Parse ISO timestamp to extract hour."""
        try:
            if iso_timestamp.endswith('-08:00'):
                iso_timestamp = iso_timestamp[:-6]
            dt = datetime.fromisoformat(iso_timestamp)
            return dt.hour
        except ValueError:
            return None

    def is_peak_hours(self, iso_timestamp):
        """Check if timestamp falls within peak wind hours (10 AM - 6 PM PST)."""
        hour = self.parse_iso_hour(iso_timestamp)
        return hour is not None and 10 <= hour <= 18

    def convert_ms_to_knots(self, value_str):
        """Convert wind speed from m/s to knots."""
        try:
            value_ms = float(value_str)
            return round(value_ms * 1.94384, 1)  # 1 m/s = 1.94384 knots
        except (ValueError, TypeError):
            return None

    def process_wind_data_comprehensive(self, input_file, output_file):
        """Process wind data with filtering, validation, and unit conversion."""
        print(f"Processing wind data: {input_file}")

        input_path = Path(input_file)
        output_path = Path(output_file)

        # Create output directory
        output_path.parent.mkdir(parents=True, exist_ok=True)

        total_lines = 0
        processed_lines = 0
        filtered_lines = 0
        invalid_data_lines = 0

        with open(input_path, 'r') as infile, \
             open(output_path, 'w', newline='') as outfile:

            # Process header
            header_line = infile.readline().strip()
            if header_line.startswith('#'):
                columns = self.parse_header_columns(header_line)

                # Find indices of columns to keep
                column_indices = {}
                for i, col in enumerate(columns):
                    column_indices[col] = i

                # Write filtered header
                filtered_header = ['#' + col for col in self.columns_to_keep if col in column_indices]
                outfile.write(' '.join(filtered_header) + '\n')

                # Process data lines
                for line in infile:
                    line = line.strip()
                    if not line:
                        continue

                    total_lines += 1

                    parts = line.split()
                    if len(parts) < len(columns):
                        invalid_data_lines += 1
                        continue

                    # Extract datetime to check peak hours
                    if 'DATETIME_PST' in column_indices:
                        datetime_value = parts[column_indices['DATETIME_PST']]

                        # Filter for peak hours only
                        if not self.is_peak_hours(datetime_value):
                            filtered_lines += 1
                            continue

                    # Extract and validate data for columns we want to keep
                    row_data = []
                    valid_row = True

                    for col in self.columns_to_keep:
                        if col in column_indices:
                            value = parts[column_indices[col]]

                            # Skip datetime validation
                            if col == 'DATETIME_PST':
                                row_data.append(value)
                                continue

                            # Validate data value - only fail for essential columns
                            if not self.is_valid_data_value(value, col):
                                if col in self.essential_columns:
                                    valid_row = False
                                    break
                                else:
                                    # For non-essential columns, use placeholder if invalid
                                    row_data.append('null')
                                    continue

                            # Convert wind speeds to knots
                            if col in ['WSPD', 'GST']:
                                converted_value = self.convert_ms_to_knots(value)
                                if converted_value is None:
                                    if col in self.essential_columns:
                                        valid_row = False
                                        break
                                    else:
                                        row_data.append('null')
                                else:
                                    row_data.append(str(converted_value))
                            else:
                                row_data.append(value)
                        else:
                            # Column not found in source data
                            valid_row = False
                            break

                    if valid_row:
                        outfile.write(' '.join(row_data) + '\n')
                        processed_lines += 1
                    else:
                        invalid_data_lines += 1

        print(f"  Wind data processing completed:")
        print(f"    Total lines: {total_lines:,}")
        print(f"    Processed (valid): {processed_lines:,}")
        print(f"    Filtered (off-hours): {filtered_lines:,}")
        print(f"    Invalid data: {invalid_data_lines:,}")

        return processed_lines, filtered_lines, invalid_data_lines


class CompleteDayIdentifier:
    """Identifies complete days in wind data without gaps or sensor malfunctions."""

    def __init__(self):
        self.required_hours = list(range(10, 19))  # 10 AM - 6 PM inclusive
        self.essential_columns = ['WDIR', 'WSPD', 'GST']

    def parse_iso_date(self, iso_timestamp):
        """Parse ISO timestamp to extract date."""
        try:
            if iso_timestamp.endswith('-08:00'):
                iso_timestamp = iso_timestamp[:-6]
            dt = datetime.fromisoformat(iso_timestamp)
            return dt.date()
        except ValueError:
            return None

    def parse_iso_hour(self, iso_timestamp):
        """Parse ISO timestamp to extract hour."""
        try:
            if iso_timestamp.endswith('-08:00'):
                iso_timestamp = iso_timestamp[:-6]
            dt = datetime.fromisoformat(iso_timestamp)
            return dt.hour
        except ValueError:
            return None

    def is_valid_value(self, value_str):
        """Check if a value is valid (not empty/null)."""
        return value_str and value_str.strip() and value_str.strip() != 'null'

    def identify_complete_days(self, input_file, output_file):
        """Identify complete days and generate a list of valid dates."""
        print(f"Identifying complete days: {input_file}")

        input_path = Path(input_file)
        output_path = Path(output_file)

        # Create output directory
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Group data by date
        daily_data = {}
        column_indices = {}

        with open(input_path, 'r') as infile:
            # Parse header
            header_line = infile.readline().strip()
            if header_line.startswith('#'):
                columns = header_line.lstrip('#').split()
                for i, col in enumerate(columns):
                    column_indices[col] = i

            # Process data lines
            for line in infile:
                line = line.strip()
                if not line:
                    continue

                parts = line.split()
                if len(parts) < len(columns):
                    continue

                # Extract date and hour
                if 'DATETIME_PST' in column_indices:
                    datetime_value = parts[column_indices['DATETIME_PST']]
                    date = self.parse_iso_date(datetime_value)
                    hour = self.parse_iso_hour(datetime_value)

                    if date and hour is not None:
                        if date not in daily_data:
                            daily_data[date] = {}

                        daily_data[date][hour] = parts

        # Identify complete days
        complete_days = []
        total_days = len(daily_data)

        for date, hours_data in daily_data.items():
            # Check if all required hours are present
            if not all(hour in hours_data for hour in self.required_hours):
                continue

            # Check if all essential columns have valid data for all hours
            day_complete = True
            for hour in self.required_hours:
                hour_data = hours_data[hour]

                for col in self.essential_columns:
                    if col in column_indices:
                        col_index = column_indices[col]
                        if col_index < len(hour_data):
                            value = hour_data[col_index]
                            if not self.is_valid_value(value):
                                day_complete = False
                                break
                        else:
                            day_complete = False
                            break
                    else:
                        day_complete = False
                        break

                if not day_complete:
                    break

            if day_complete:
                complete_days.append(date)

        # Sort complete days chronologically
        complete_days.sort()

        # Write complete days list
        with open(output_path, 'w') as outfile:
            outfile.write("# Complete Wind Data Days\n")
            outfile.write("# Days with full 9-hour coverage (10 AM - 6 PM PST) and valid essential data\n")
            outfile.write("# Format: YYYY-MM-DD\n")
            outfile.write("#\n")
            outfile.write(f"# Total complete days: {len(complete_days)}\n")
            outfile.write(f"# Total days analyzed: {total_days}\n")
            outfile.write(f"# Completeness: {(len(complete_days)/total_days*100):.1f}%\n")
            outfile.write(f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            outfile.write("#\n\n")

            for date in complete_days:
                outfile.write(f"{date}\n")

        print(f"  Complete days identification completed:")
        print(f"    Total days analyzed: {total_days:,}")
        print(f"    Complete days found: {len(complete_days):,}")

        if total_days > 0:
            completeness_rate = (len(complete_days) / total_days * 100)
            print(f"    Completeness rate: {completeness_rate:.1f}%")
        else:
            print(f"    Completeness rate: N/A (no data)")

        return len(complete_days), total_days


class WindDataPipelineProcessor:
    """Main processor that orchestrates the complete wind data processing pipeline."""

    def __init__(self):
        self.timestamp_converter = WindTimestampConverter()
        self.data_processor = WindDataProcessor()
        self.complete_day_identifier = CompleteDayIdentifier()

    def process_single_file(self, input_file, output_dir, file_prefix=""):
        """Process a single wind data file through the complete pipeline."""
        input_path = Path(input_file)
        output_dir = Path(output_dir)

        # Generate intermediate file names
        basename = input_path.stem
        if file_prefix:
            basename = f"{file_prefix}_{basename}"

        timestamps_file = output_dir / f"{basename}_pst_timestamps.txt"
        processed_file = output_dir / f"{basename}_processed.txt"
        complete_days_file = output_dir / f"{basename}_complete_days.txt"

        print(f"Processing: {input_file}")
        print(f"Output directory: {output_dir}")

        # Step 1: Convert timestamps
        print("\nStep 1: Converting GMT timestamps to PST...")
        converted_count, ts_errors = self.timestamp_converter.convert_wind_data_file(
            input_file, timestamps_file)

        # Step 2: Process wind data
        print("\nStep 2: Processing wind data (filtering, validation, unit conversion)...")
        processed_count, filtered_count, invalid_count = self.data_processor.process_wind_data_comprehensive(
            timestamps_file, processed_file)

        # Step 3: Identify complete days
        print("\nStep 3: Identifying complete days...")
        complete_days_count, total_days = self.complete_day_identifier.identify_complete_days(
            processed_file, complete_days_file)

        return {
            'timestamps_file': timestamps_file,
            'processed_file': processed_file,
            'complete_days_file': complete_days_file,
            'converted_count': converted_count,
            'processed_count': processed_count,
            'complete_days_count': complete_days_count,
            'total_days': total_days,
            'ts_errors': ts_errors,
            'filtered_count': filtered_count,
            'invalid_count': invalid_count
        }

    def process_multiple_files(self, input_paths, output_dir):
        """Process multiple wind data files."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        results = []
        summary_stats = {
            'total_files': 0,
            'successful_files': 0,
            'total_converted': 0,
            'total_processed': 0,
            'total_complete_days': 0,
            'total_days_analyzed': 0
        }

        print("WIND DATA PROCESSING PIPELINE")
        print("=" * 60)
        print(f"Output directory: {output_dir}")
        print()

        for input_path in input_paths:
            input_path = Path(input_path)
            if not input_path.exists():
                print(f"⚠️  Warning: {input_path} not found, skipping...")
                continue

            summary_stats['total_files'] += 1

            try:
                result = self.process_single_file(input_path, output_dir)
                results.append(result)
                summary_stats['successful_files'] += 1
                summary_stats['total_converted'] += result['converted_count']
                summary_stats['total_processed'] += result['processed_count']
                summary_stats['total_complete_days'] += result['complete_days_count']
                summary_stats['total_days_analyzed'] += result['total_days']

                print(f"✅ {input_path.name} processed successfully")

            except Exception as e:
                print(f"❌ Error processing {input_path}: {e}")

        # Generate summary
        print("\n✅ WIND DATA PROCESSING COMPLETED!")
        print("=" * 60)
        print(f"📊 Processing Summary:")
        print(f"   • Files processed: {summary_stats['successful_files']}/{summary_stats['total_files']}")
        print(f"   • Records converted: {summary_stats['total_converted']:,}")
        print(f"   • Valid records: {summary_stats['total_processed']:,}")
        print(f"   • Complete days: {summary_stats['total_complete_days']:,}")
        print(f"   • Total days analyzed: {summary_stats['total_days_analyzed']:,}")

        if summary_stats['total_days_analyzed'] > 0:
            completeness_rate = (summary_stats['total_complete_days'] / summary_stats['total_days_analyzed'] * 100)
            print(f"   • Overall completeness: {completeness_rate:.1f}%")
        else:
            print(f"   • Overall completeness: N/A (no valid data)")

        return results, summary_stats

    def process(self, input_files_or_directory, output_dir=None):
        """
        Complete processing pipeline for wind data files.

        Args:
            input_files_or_directory: Single file, list of files, or directory
            output_dir: Output directory (defaults to data/cleaned/wind/)

        Returns:
            Processing results and statistics
        """
        # Set default output directory
        if output_dir is None:
            base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
            output_dir = base_dir / "data/cleaned/wind"
        else:
            output_dir = Path(output_dir)

        # Handle different input types
        input_path = Path(input_files_or_directory)

        if input_path.is_file():
            # Single file
            result = self.process_single_file(input_path, output_dir)
            print(f"\n🎯 Wind data processing completed!")
            print(f"Processed file: {result['processed_file']}")
            print(f"Complete days list: {result['complete_days_file']}")
            return [result], None

        elif input_path.is_dir():
            # Directory - find all .txt files
            txt_files = list(input_path.glob("*.txt"))
            if not txt_files:
                raise FileNotFoundError(f"No .txt files found in directory: {input_path}")
            return self.process_multiple_files(txt_files, output_dir)

        else:
            # Assume it's a pattern or multiple files
            if isinstance(input_files_or_directory, (list, tuple)):
                return self.process_multiple_files(input_files_or_directory, output_dir)
            else:
                raise FileNotFoundError(f"Input not found: {input_files_or_directory}")


def main():
    """Main function for command-line usage."""
    if len(sys.argv) < 2:
        print("Usage: python3 process_wind_data.py <input_files_or_directory> [output_dir]")
        print()
        print("Args:")
        print("  input_files_or_directory: Single file, multiple files, or directory with .txt wind data")
        print("  output_dir: Optional output directory (defaults to data/cleaned/wind/)")
        print()
        print("Examples:")
        print("  python3 process_wind_data.py data/raw/wind/2024.txt")
        print("  python3 process_wind_data.py data/raw/wind/")
        print("  python3 process_wind_data.py data/raw/wind/ data/processed/")
        sys.exit(1)

    input_files_or_directory = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        processor = WindDataPipelineProcessor()
        results, summary = processor.process(input_files_or_directory, output_dir)

        if summary:
            print(f"\n🎯 Ready for LLM training!")
            print(f"Use processed wind data from: {Path(output_dir or 'data/cleaned/wind')}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()