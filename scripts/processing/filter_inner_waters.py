#!/usr/bin/env python3
"""
Script to extract forecasts for "Inner waters from Point Mugu to San Mateo Pt. CA
including Santa Catalina and Anacapa Islands" from coastal_waters_2019_2025.txt

The script identifies forecast blocks by:
1. Finding lines that contain "Inner waters from Point Mugu to San Mateo Pt. CA including Santa"
2. Extracting the complete forecast block until the next "$$" delimiter
"""

import re
from pathlib import Path

def extract_inner_waters_forecasts(input_file_path, output_file_path):
    """
    Extract Inner Waters forecasts from the coastal waters file.

    Args:
        input_file_path: Path to coastal_waters_2019_2025.txt
        output_file_path: Path for the cleaned output file
    """
    print(f"Reading from: {input_file_path}")
    print(f"Writing to: {output_file_path}")

    with open(input_file_path, 'r', encoding='utf-8') as infile:
        content = infile.read()

    # Split content by forecast delimiter
    forecast_blocks = content.split('$$')

    inner_waters_forecasts = []
    total_blocks = len(forecast_blocks)
    found_count = 0

    print(f"Processing {total_blocks} forecast blocks...")

    for i, block in enumerate(forecast_blocks):
        # Check if this block contains Inner Waters forecast
        if 'Inner waters from Point Mugu to San Mateo Pt. CA including Santa' in block:
            found_count += 1
            # Add back the $$ delimiter (except for the last block)
            if i < len(forecast_blocks) - 1:
                inner_waters_forecasts.append(block + '$$')
            else:
                inner_waters_forecasts.append(block)

            # Print progress every 10 found forecasts
            if found_count % 10 == 0:
                print(f"Found {found_count} Inner Waters forecasts...")

    print(f"\nTotal Inner Waters forecasts found: {found_count}")

    # Write the filtered forecasts to output file
    with open(output_file_path, 'w', encoding='utf-8') as outfile:
        outfile.write('\n'.join(inner_waters_forecasts))

    print(f"Filtered forecasts written to: {output_file_path}")

    # Calculate size reduction
    original_size = len(content)
    filtered_size = len('\n'.join(inner_waters_forecasts))
    reduction_percent = (1 - filtered_size/original_size) * 100

    print(f"File size reduction: {reduction_percent:.1f}% ({original_size:,} -> {filtered_size:,} characters)")

    return found_count

def validate_output(output_file_path, expected_count=None):
    """
    Validate the output file by checking a few sample forecasts.

    Args:
        output_file_path: Path to the output file to validate
        expected_count: Expected number of forecasts (optional)
    """
    print(f"\nValidating output file: {output_file_path}")

    with open(output_file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Count forecast instances
    forecast_count = content.count('Inner waters from Point Mugu to San Mateo Pt. CA including Santa')
    print(f"Number of forecasts in output: {forecast_count}")

    if expected_count:
        if forecast_count == expected_count:
            print("✓ Forecast count matches expected value")
        else:
            print(f"⚠ Warning: Expected {expected_count} forecasts, found {forecast_count}")

    # Check for proper forecast structure
    blocks = content.split('$$')
    valid_blocks = 0

    for block in blocks:
        if 'Inner waters from Point Mugu to San Mateo Pt. CA including Santa' in block:
            if '.TONIGHT...' in block or '.TODAY...' in block or '.FRI...' in block:
                valid_blocks += 1

    print(f"Valid forecast blocks with weather data: {valid_blocks}")

    # Show a sample forecast
    first_forecast_end = content.find('$$')
    if first_forecast_end > 0:
        sample = content[:first_forecast_end].strip()
        print(f"\nSample forecast (first {min(500, len(sample))} characters):")
        print("-" * 50)
        print(sample[:500] + "..." if len(sample) > 500 else sample)
        print("-" * 50)

if __name__ == "__main__":
    # Define file paths
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    input_file = base_dir / "data/raw/forecasts/coastal_waters_2019_2025.txt"
    output_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025.txt"

    # Ensure input file exists
    if not input_file.exists():
        print(f"Error: Input file not found at {input_file}")
        exit(1)

    # Ensure output directory exists
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Extract forecasts
    try:
        found_count = extract_inner_waters_forecasts(input_file, output_file)

        # Validate output
        validate_output(output_file, found_count)

        print(f"\n✓ Successfully extracted {found_count} Inner Waters forecasts")
        print(f"Output saved to: {output_file}")

    except Exception as e:
        print(f"Error processing file: {e}")
        exit(1)