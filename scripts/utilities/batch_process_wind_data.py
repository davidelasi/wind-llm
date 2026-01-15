#!/usr/bin/env python3
"""
Batch processing script for wind data files from 2016-2024.
Processes each year's wind data with timestamp conversion, column filtering,
hourly aggregation, and unit conversion to knots.
"""

import sys
from pathlib import Path
import shutil

# Import the wind processing functions
from convert_wind_timestamps import convert_gmt_to_pst_iso
from filter_wind_columns import process_wind_data_comprehensive

def batch_process_wind_data(start_year=2016, end_year=2024):
    """
    Process wind data files for multiple years.

    Args:
        start_year: Starting year (inclusive)
        end_year: Ending year (inclusive)
    """

    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    raw_wind_dir = base_dir / "data/raw/wind"
    cleaned_dir = base_dir / "data/cleaned"

    # Ensure cleaned directory exists
    cleaned_dir.mkdir(parents=True, exist_ok=True)

    print(f"Batch processing wind data from {start_year} to {end_year}")
    print(f"Raw files directory: {raw_wind_dir}")
    print(f"Output directory: {cleaned_dir}")
    print("=" * 60)

    processed_files = []
    failed_files = []

    for year in range(start_year, end_year + 1):
        raw_file = raw_wind_dir / f"{year}.txt"

        if not raw_file.exists():
            print(f"⚠️  Warning: {year}.txt not found, skipping...")
            failed_files.append(f"{year}.txt (not found)")
            continue

        print(f"\n📅 Processing year {year}...")
        print(f"Input: {raw_file}")

        try:
            # Step 1: Convert timestamps from GMT to PST ISO format
            print("  Step 1: Converting GMT timestamps to PST ISO format...")
            pst_file = cleaned_dir / f"wind_{year}_pst.txt"

            success = convert_timestamps_for_file(raw_file, pst_file)
            if not success:
                print(f"  ❌ Failed timestamp conversion for {year}")
                failed_files.append(f"{year}.txt (timestamp conversion failed)")
                continue

            # Step 2: Comprehensive processing (filtering, aggregation, unit conversion)
            print("  Step 2: Column filtering, hourly aggregation, and unit conversion...")
            final_file = cleaned_dir / f"wind_{year}_processed.txt"

            processed_count, failed_count = process_wind_data_comprehensive(
                pst_file, final_file, enable_averaging=True
            )

            if processed_count > 0:
                print(f"  ✅ Success: {processed_count} hourly data points generated")
                print(f"  💾 Output: {final_file}")
                processed_files.append((year, final_file, processed_count))

                # Clean up intermediate file
                pst_file.unlink()
                print(f"  🧹 Cleaned up intermediate file: {pst_file}")

            else:
                print(f"  ❌ Failed processing for {year}")
                failed_files.append(f"{year}.txt (processing failed)")

        except Exception as e:
            print(f"  ❌ Error processing {year}: {e}")
            failed_files.append(f"{year}.txt (error: {str(e)[:50]})")

    # Summary
    print("\n" + "=" * 60)
    print("BATCH PROCESSING SUMMARY")
    print("=" * 60)

    if processed_files:
        print(f"✅ Successfully processed {len(processed_files)} files:")
        total_data_points = 0
        for year, file_path, count in processed_files:
            print(f"  {year}: {count} hourly data points → {file_path}")
            total_data_points += count
        print(f"\n📊 Total data points across all years: {total_data_points:,}")

    if failed_files:
        print(f"\n❌ Failed to process {len(failed_files)} files:")
        for failed_file in failed_files:
            print(f"  {failed_file}")

    return processed_files, failed_files

def convert_timestamps_for_file(input_file, output_file):
    """
    Convert timestamps in a wind data file from GMT to PST ISO format.

    Args:
        input_file: Path to input file
        output_file: Path to output file

    Returns:
        Boolean indicating success
    """
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            lines = infile.readlines()

        converted_lines = []
        converted_count = 0

        for i, line in enumerate(lines):
            line = line.strip()

            # Handle header lines
            if line.startswith('#'):
                if i == 0:
                    # Update main header
                    converted_lines.append("#DATETIME_PST                WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE\n")
                elif i == 1:
                    # Update units header
                    converted_lines.append("#ISO_8601_PST                degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC   mi    ft\n")
                else:
                    converted_lines.append(line + '\n')
                continue

            if not line:
                converted_lines.append(line + '\n')
                continue

            # Process data lines
            columns = line.split()
            if len(columns) >= 5:
                try:
                    year = int(columns[0])
                    month = int(columns[1])
                    day = int(columns[2])
                    hour = int(columns[3])
                    minute = int(columns[4])

                    # Convert to PST ISO format
                    iso_timestamp = convert_gmt_to_pst_iso(year, month, day, hour, minute)
                    if iso_timestamp:
                        remaining_columns = columns[5:]
                        new_line = iso_timestamp + ' ' + ' '.join(remaining_columns) + '\n'
                        converted_lines.append(new_line)
                        converted_count += 1
                    else:
                        converted_lines.append(line + '\n')

                except (ValueError, IndexError):
                    converted_lines.append(line + '\n')
            else:
                converted_lines.append(line + '\n')

        # Write converted file
        with open(output_file, 'w', encoding='utf-8') as outfile:
            outfile.writelines(converted_lines)

        print(f"    Converted {converted_count:,} timestamps")
        return True

    except Exception as e:
        print(f"    Error in timestamp conversion: {e}")
        return False

def cleanup_intermediate_files():
    """
    Clean up intermediate files from previous processing.
    """
    print("\n🧹 Cleaning up intermediate files...")

    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    cleaned_dir = base_dir / "data/cleaned"

    # Files to remove
    patterns_to_remove = [
        "wind_2016_pst.txt",
        "wind_2016_pst_filtered.txt",
        "wind_*_pst.txt"  # Any remaining PST intermediate files
    ]

    removed_files = []

    for file_path in cleaned_dir.iterdir():
        if file_path.is_file():
            file_name = file_path.name

            # Remove specific intermediate files
            if (file_name in ["wind_2016_pst.txt", "wind_2016_pst_filtered.txt"] or
                (file_name.startswith("wind_") and file_name.endswith("_pst.txt") and "processed" not in file_name)):
                file_path.unlink()
                removed_files.append(file_name)

    if removed_files:
        print(f"  Removed {len(removed_files)} intermediate files:")
        for file_name in removed_files:
            print(f"    - {file_name}")
    else:
        print("  No intermediate files to clean up")

    return removed_files

if __name__ == "__main__":
    print("Wind Data Batch Processing")
    print("Processing years 2016-2024 with comprehensive wind data pipeline")
    print("Features: GMT→PST conversion, column filtering, hourly aggregation, knots conversion")

    # Clean up existing intermediate files first
    cleanup_intermediate_files()

    # Process all years
    processed_files, failed_files = batch_process_wind_data(2016, 2024)

    print(f"\n🎉 Batch processing complete!")
    print(f"Final processed files are in: data/cleaned/wind_YYYY_processed.txt")

    if len(processed_files) == 9:  # 2016-2024 = 9 years
        print("✅ All years processed successfully!")
    else:
        print(f"⚠️  {9 - len(processed_files)} years had processing issues")

    # Final cleanup
    print("\n🧹 Final cleanup...")
    final_cleanup = cleanup_intermediate_files()