#!/usr/bin/env python3
"""
Script to convert day-of-week references to relative day format in NWS forecasts.

Converts:
.TONIGHT → .DAY_0_NIGHT (same day)
.TODAY → .DAY_0 (same day)
.MON/.TUE/.WED/etc → .DAY_X (appropriate date)
.MON NIGHT/.TUE NIGHT/etc → .DAY_X_NIGHT (appropriate date)

This makes forecasts more LLM-friendly by using relative time references.
"""

import re
from datetime import datetime, timedelta
from pathlib import Path

def parse_forecast_timestamp(timestamp_str):
    """
    Parse ISO timestamp string to datetime object.

    Args:
        timestamp_str: String like "2025-10-30T12:09:00-08:00"

    Returns:
        datetime object or None if parsing fails
    """
    try:
        # Remove timezone for parsing
        if timestamp_str.endswith('-08:00'):
            timestamp_str = timestamp_str[:-6]
        return datetime.fromisoformat(timestamp_str)
    except ValueError:
        return None

def get_weekday_name(date_obj):
    """
    Get abbreviated weekday name for a date.

    Args:
        date_obj: datetime.date object

    Returns:
        String like 'MON', 'TUE', etc.
    """
    weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    return weekdays[date_obj.weekday()]

def calculate_period_dates(forecast_time):
    """
    Calculate the actual dates for forecast periods based on issuance time.

    Args:
        forecast_time: datetime object for forecast issuance

    Returns:
        Dictionary mapping period names to (day_offset, date_str)
    """
    forecast_date = forecast_time.date()
    period_mapping = {}

    # DAY_0 is always the forecast issuance date
    period_mapping['TODAY'] = (0, forecast_date.isoformat())
    period_mapping['TONIGHT'] = (0, forecast_date.isoformat())

    # Calculate next 7 days and their weekday names
    for day_offset in range(1, 8):
        future_date = forecast_date + timedelta(days=day_offset)
        weekday_name = get_weekday_name(future_date)

        period_mapping[weekday_name] = (day_offset, future_date.isoformat())
        period_mapping[f'{weekday_name} NIGHT'] = (day_offset, future_date.isoformat())

    return period_mapping

def extract_warnings(forecast_text):
    """
    Extract warning lines from forecast content and return cleaned warnings and content.

    Args:
        forecast_text: String containing the forecast with potential warnings

    Returns:
        Tuple of (warning_paragraph, cleaned_content)
    """
    # Find all warning lines (lines that start and end with ...)
    warning_pattern = r'^\.\.\.([^.]*?)\.\.\.(?:\n|$)'
    warning_matches = re.findall(warning_pattern, forecast_text, re.MULTILINE)

    if not warning_matches:
        return None, forecast_text

    # Combine all warnings into a single paragraph
    combined_warnings = []
    for warning in warning_matches:
        # Clean up the warning text - remove extra whitespace and newlines
        clean_warning = re.sub(r'\s+', ' ', warning.strip())
        combined_warnings.append(clean_warning)

    # Create warning paragraph with semicolons between multiple warnings
    warning_paragraph = "WARNING: " + "; ".join(combined_warnings)

    # Remove warning lines from the original content
    clean_content = re.sub(warning_pattern, '', forecast_text, flags=re.MULTILINE)
    clean_content = re.sub(r'\n\s*\n', '\n\n', clean_content).strip()  # Clean up extra newlines

    return warning_paragraph, clean_content

def convert_forecast_periods(forecast_text, forecast_time):
    """
    Convert day-of-week period labels to relative day format using context-aware mapping.
    Also collapses each period onto a single line and removes dots before DAY.

    Args:
        forecast_text: String containing the forecast
        forecast_time: datetime object for forecast issuance

    Returns:
        String with converted period labels, collapsed to single lines
    """
    # Define regex pattern to match period labels and their content
    # Handle both ...(3 dots) and ..(2 dots) cases for malformed data
    # Enhanced to capture "REST OF" periods and "THIS AFTERNOON"
    period_pattern = r'\.((REST\s+OF\s+[A-Z]+)|(THIS\s+AFTERNOON)|([A-Z]{3,7}(?:\s+NIGHT)?))\.\.\.?(.*?)(?=\n\.((REST\s+OF\s+[A-Z]+)|(THIS\s+AFTERNOON)|([A-Z]{3,7}(?:\s+NIGHT)?))\.\.\.?|\Z)'

    # Extract all periods first
    periods = re.findall(period_pattern, forecast_text, re.DOTALL)

    if not periods:
        return forecast_text

    # Context-aware period mapping
    forecast_date = forecast_time.date()
    issue_hour = forecast_time.hour

    # Determine starting context based on issuance time
    if issue_hour < 6:  # Early morning (midnight to 6 AM) - we're in night period
        current_day_offset = 0
        expecting_next = 'DAY'  # Next period should be a day period
    else:  # Daytime/evening - we're in day period
        current_day_offset = 0
        expecting_next = 'NIGHT'  # Next period should be night period

    # Allow extended forecasts - no artificial cap

    # Process periods sequentially to handle day/night logic correctly
    converted_periods = []
    current_day_offset = 0 if issue_hour < 6 else 0

    # Extract period names and content from the new regex structure
    # New regex returns: (full_match, rest_of_match, this_afternoon_match, standard_match, content, lookahead_groups...)
    processed_periods = []
    for match in periods:
        if match[1]:  # REST OF match (group 1)
            period_name = match[1]  # e.g., "REST OF TODAY"
            period_content = match[4]  # content (group 4)
        elif match[2]:  # THIS AFTERNOON match (group 2)
            period_name = match[2]  # "THIS AFTERNOON"
            period_content = match[4]  # content (group 4)
        elif match[3]:  # Standard match (group 3)
            period_name = match[3]  # e.g., "TONIGHT", "MON"
            period_content = match[4]  # content (group 4)
        else:
            continue  # Skip invalid matches

        processed_periods.append((period_name, period_content))

    for i, (period_name, period_content) in enumerate(processed_periods):
        # Calculate target date
        target_date = forecast_date
        if current_day_offset > 0:
            from datetime import timedelta
            target_date = forecast_date + timedelta(days=current_day_offset)

        # Clean content
        collapsed_content = re.sub(r'\s+', ' ', period_content.strip())
        collapsed_content = collapsed_content.replace('Wave Detail:', 'Waves:')

        # Determine period type and label using context-aware logic
        if period_name == 'REST OF TODAY':
            relative_label = f'D{current_day_offset}_DAY'
            # REST OF TODAY doesn't increment day offset (current day)

        elif period_name == 'REST OF TONIGHT':
            relative_label = f'D{current_day_offset}_NIGHT'
            # After REST OF TONIGHT, increment day offset for next day
            current_day_offset += 1

        elif period_name == 'THIS AFTERNOON':
            relative_label = f'D{current_day_offset}_DAY'
            # THIS AFTERNOON doesn't increment day offset (same day)

        elif period_name == 'TONIGHT':
            relative_label = f'D{current_day_offset}_NIGHT'
            # After TONIGHT, increment day offset for next day period
            current_day_offset += 1

        elif period_name == 'TODAY':
            relative_label = f'D{current_day_offset}_DAY'
            # TODAY doesn't increment day offset

        elif period_name.endswith(' NIGHT'):
            relative_label = f'D{current_day_offset}_NIGHT'
            # After any NIGHT period, increment day offset for next day
            current_day_offset += 1

        else:
            # Regular day period (MON, TUE, WED, etc.)
            relative_label = f'D{current_day_offset}_DAY'

            # Check if next period is another day period (no night between)
            # If so, increment day offset after this period
            if i < len(processed_periods) - 1:
                next_period_name = processed_periods[i + 1][0]
                # If next period is not a night period for this day, increment
                if (not next_period_name.endswith(' NIGHT') and
                    next_period_name not in ['TONIGHT', 'TODAY', 'REST OF TONIGHT', 'THIS AFTERNOON']):
                    current_day_offset += 1

        converted_periods.append(f'{relative_label} ({target_date}) {collapsed_content}')

    # Join all converted periods
    return '\n'.join(converted_periods)

def process_forecast_file(input_file, output_file):
    """
    Process the entire forecast file, converting all periods to relative format.

    Args:
        input_file: Path to input forecast file
        output_file: Path to output file
    """
    print(f"Processing forecast file: {input_file}")

    with open(input_file, 'r', encoding='utf-8') as file:
        content = file.read()

    # Split content by forecast delimiter
    forecast_blocks = content.split('$$')
    converted_blocks = []

    processed_count = 0
    error_count = 0

    for block in forecast_blocks:
        block = block.strip()
        if not block:
            converted_blocks.append('')
            continue

        # Find the timestamp in this block
        timestamp_match = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00', block)

        if timestamp_match:
            timestamp_str = timestamp_match.group(0)
            forecast_time = parse_forecast_timestamp(timestamp_str)

            if forecast_time:
                # Extract the forecast content (everything after the timestamp line)
                timestamp_pos = block.find(timestamp_str)
                timestamp_line_end = timestamp_pos + len(timestamp_str)
                forecast_content = block[timestamp_line_end:].strip()

                if forecast_content:
                    # Only keep the issued line (no PZZ655 header)
                    issued_line = f"Issued: {timestamp_str}\n\n"

                    # Extract warnings and convert periods
                    warnings, clean_content = extract_warnings(forecast_content)
                    converted_content = convert_forecast_periods(clean_content, forecast_time)

                    # Reconstruct block: issued line + warnings + converted content
                    if warnings:
                        converted_block = issued_line + warnings + "\n\n" + converted_content
                    else:
                        converted_block = issued_line + converted_content

                    converted_blocks.append(converted_block)
                    processed_count += 1
                else:
                    # No forecast content, skip this block
                    continue
            else:
                # Failed to parse timestamp
                converted_blocks.append(block)
                error_count += 1
        else:
            # No timestamp found, keep original
            converted_blocks.append(block)

    # Write converted content with proper delimiter formatting
    with open(output_file, 'w', encoding='utf-8') as file:
        for i, block in enumerate(converted_blocks):
            if block.strip():  # Only write non-empty blocks
                file.write(block)
                # Add delimiter after each forecast except the last one
                if i < len(converted_blocks) - 1:
                    file.write('\n\n$$\n\n')
            elif i == 0:  # Handle case where first block might be empty
                file.write('')

    print(f"Conversion completed:")
    print(f"  Processed forecasts: {processed_count:,}")
    print(f"  Parsing errors: {error_count:,}")
    print(f"  Output saved to: {output_file}")

def main():
    """Main function."""
    # File paths
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")
    input_file = base_dir / "data/cleaned/inner_waters_forecasts_2019_2025_iso_timestamps.txt"
    output_file = base_dir / "data/cleaned/inner_waters_forecasts_relative_periods.txt"

    if not input_file.exists():
        print(f"Error: Input file not found: {input_file}")
        return

    # Create output directory if needed
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # Process the file
    process_forecast_file(input_file, output_file)

    print(f"\n✅ Forecast period conversion completed!")
    print(f"Relative day format forecasts saved to:")
    print(f"{output_file}")

if __name__ == "__main__":
    main()