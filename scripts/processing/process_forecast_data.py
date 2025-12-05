#!/usr/bin/env python3
"""
Consolidated NWS Forecast Processing Pipeline

This script consolidates all forecast data processing steps into a single pipeline:
1. Diagnose and identify corrupted forecast data
2. Convert day-of-week references to relative day format
3. Extract and format warnings
4. Clean and standardize forecast content

Usage:
    python3 process_nws_forecasts.py <input_file> [output_dir]

Args:
    input_file: Path to raw NWS forecast file with ISO timestamps
    output_dir: Optional output directory (defaults to data/cleaned/)
"""

import re
import sys
from pathlib import Path
from datetime import datetime, timedelta


class ForecastCorruptionDetector:
    """Detects various types of data corruption in forecast content."""

    def __init__(self):
        # NWS Product Codes and Headers patterns
        self.nws_patterns = [
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

        # Truncated or Malformed Period Labels
        self.truncated_patterns = [
            (r'\.([A-Z]{1,2})(?:\s+NIGHT)?\s*$', 'TRUNCATED_PERIOD'),
            (r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.(?!\.)', 'INCOMPLETE_DOTS'),
            (r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\\.(?!\.)', 'MISSING_DOTS'),
        ]

        # Anomalous Period Patterns (multi-day ranges and full day names)
        self.anomalous_patterns = [
            (r'\.([A-Z]{3})\s+THROUGH\s+([A-Z]{3})\.\.\.', 'MULTI_DAY_RANGE'),
            (r'\.(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\.\.\.', 'FULL_DAY_NAME'),
            (r'\.(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+NIGHT\.\.\.', 'FULL_DAY_NIGHT_NAME'),
        ]

        # Non-weather content keywords
        self.non_weather_keywords = [
            'high pressure center was located',
            'thermal low was over',
            'pattern will not change',
            'including the Channel Islands',
            'out 60 NM',
            'National Marine Sanctuary'
        ]

    def detect_corruption_patterns(self, forecast_content):
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

        # Check NWS patterns
        for pattern, corruption_type in self.nws_patterns:
            matches = re.findall(pattern, forecast_content, re.MULTILINE | re.DOTALL)
            if matches:
                corruption_indicators['has_corruption'] = True
                corruption_indicators['corruption_types'].append(corruption_type)
                corruption_indicators['corruption_details'].extend(matches[:3])

        # Check truncated patterns
        for pattern, corruption_type in self.truncated_patterns:
            matches = re.findall(pattern, forecast_content, re.MULTILINE)
            if matches:
                corruption_indicators['has_corruption'] = True
                corruption_indicators['corruption_types'].append(corruption_type)
                corruption_indicators['corruption_details'].extend([f".{m}" for m in matches[:3]])

        # Check anomalous patterns (multi-day ranges and full day names)
        for pattern, corruption_type in self.anomalous_patterns:
            matches = re.findall(pattern, forecast_content, re.MULTILINE)
            if matches:
                corruption_indicators['has_corruption'] = True
                corruption_indicators['corruption_types'].append(corruption_type)
                corruption_indicators['corruption_details'].extend([f".{m}" for m in matches[:3]])

        # Check for abnormally long periods
        periods = re.findall(r'\.([A-Z]{3,7}(?:\s+NIGHT)?)\.\.\.?(.*?)(?=\n\.[A-Z]{3,7}(?:\s+NIGHT)?\.\.\.?|\Z)',
                           forecast_content, re.DOTALL)

        for period_name, period_content in periods:
            content_length = len(period_content.strip())
            if content_length > 1000:
                corruption_indicators['has_corruption'] = True
                corruption_indicators['corruption_types'].append('ABNORMALLY_LONG_PERIOD')
                corruption_indicators['corruption_details'].append(f".{period_name}: {content_length} chars")

        # Check for multiple timestamps
        timestamp_pattern = r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00'
        timestamp_matches = re.findall(timestamp_pattern, forecast_content)
        if len(timestamp_matches) > 0:
            corruption_indicators['has_corruption'] = True
            corruption_indicators['corruption_types'].append('EMBEDDED_TIMESTAMPS')
            corruption_indicators['corruption_details'].extend(timestamp_matches[:2])

        # Check for non-weather content
        for keyword in self.non_weather_keywords:
            if keyword.lower() in forecast_content.lower():
                corruption_indicators['has_corruption'] = True
                if 'NON_WEATHER_CONTENT' not in corruption_indicators['corruption_types']:
                    corruption_indicators['corruption_types'].append('NON_WEATHER_CONTENT')
                corruption_indicators['corruption_details'].append(keyword)

        # Check for extremely short periods
        if len(periods) > 0:
            for period_name, period_content in periods:
                clean_content = period_content.strip()
                if len(clean_content) < 10:
                    corruption_indicators['has_corruption'] = True
                    if 'EXTREMELY_SHORT_PERIOD' not in corruption_indicators['corruption_types']:
                        corruption_indicators['corruption_types'].append('EXTREMELY_SHORT_PERIOD')
                    corruption_indicators['corruption_details'].append(f".{period_name}: '{clean_content}'")

        return corruption_indicators


class ForecastPeriodConverter:
    """Converts day-of-week period labels to relative day format."""

    @staticmethod
    def parse_forecast_timestamp(timestamp_str):
        """Parse ISO timestamp string to datetime object."""
        try:
            if timestamp_str.endswith('-08:00'):
                timestamp_str = timestamp_str[:-6]
            return datetime.fromisoformat(timestamp_str)
        except ValueError:
            return None

    @staticmethod
    def extract_warnings(forecast_text):
        """Extract warning lines from forecast content and return cleaned warnings and content."""
        warning_pattern = r'^\.\.\.([^.]*?)\.\.\.(?: \n|$)'
        warning_matches = re.findall(warning_pattern, forecast_text, re.MULTILINE)

        if not warning_matches:
            return None, forecast_text

        # Combine all warnings into a single paragraph
        combined_warnings = []
        for warning in warning_matches:
            clean_warning = re.sub(r'\s+', ' ', warning.strip())
            combined_warnings.append(clean_warning)

        warning_paragraph = "WARNING: " + "; ".join(combined_warnings)

        # Remove warning lines from the original content
        clean_content = re.sub(warning_pattern, '', forecast_text, flags=re.MULTILINE)
        clean_content = re.sub(r'\n\s*\n', '\n\n', clean_content).strip()

        return warning_paragraph, clean_content

    def convert_forecast_periods(self, forecast_text, forecast_time):
        """
        Convert day-of-week period labels to relative day format using context-aware mapping.
        Also collapses each period onto a single line and removes dots before DAY.
        """
        # Enhanced regex pattern for period matching
        period_pattern = r'\.((REST\s+OF\s+[A-Z]+)|(THIS\s+AFTERNOON)|([A-Z]{3,7}(?:\s+NIGHT)?))\.\.\.?(.*?)(?=\n\.((REST\s+OF\s+[A-Z]+)|(THIS\s+AFTERNOON)|([A-Z]{3,7}(?:\s+NIGHT)?))\.\.\.?|\Z)'

        # Extract all periods first
        periods = re.findall(period_pattern, forecast_text, re.DOTALL)

        if not periods:
            return forecast_text

        # Context-aware period mapping
        forecast_date = forecast_time.date()
        issue_hour = forecast_time.hour

        # Determine starting context based on issuance time
        current_day_offset = 0 if issue_hour < 6 else 0

        # Process periods sequentially to handle day/night logic correctly
        converted_periods = []

        # Extract period names and content from the regex structure
        processed_periods = []
        for match in periods:
            if match[1]:  # REST OF match
                period_name = match[1]
                period_content = match[4]
            elif match[2]:  # THIS AFTERNOON match
                period_name = match[2]
                period_content = match[4]
            elif match[3]:  # Standard match
                period_name = match[3]
                period_content = match[4]
            else:
                continue

            processed_periods.append((period_name, period_content))

        for i, (period_name, period_content) in enumerate(processed_periods):
            # Calculate target date
            target_date = forecast_date
            if current_day_offset > 0:
                target_date = forecast_date + timedelta(days=current_day_offset)

            # Clean content
            collapsed_content = re.sub(r'\s+', ' ', period_content.strip())
            collapsed_content = collapsed_content.replace('Wave Detail:', 'Waves:')

            # Determine period type and label using context-aware logic
            if period_name == 'REST OF TODAY':
                relative_label = f'D{current_day_offset}_DAY'

            elif period_name == 'REST OF TONIGHT':
                relative_label = f'D{current_day_offset}_NIGHT'
                current_day_offset += 1

            elif period_name == 'THIS AFTERNOON':
                relative_label = f'D{current_day_offset}_DAY'

            elif period_name == 'TONIGHT':
                relative_label = f'D{current_day_offset}_NIGHT'
                current_day_offset += 1

            elif period_name == 'TODAY':
                relative_label = f'D{current_day_offset}_DAY'

            elif period_name.endswith(' NIGHT'):
                relative_label = f'D{current_day_offset}_NIGHT'
                current_day_offset += 1

            else:
                # Regular day period (MON, TUE, WED, etc.)
                relative_label = f'D{current_day_offset}_DAY'

                # Check if next period is another day period (no night between)
                if i < len(processed_periods) - 1:
                    next_period_name = processed_periods[i + 1][0]
                    # If next period is not a night period for this day, increment
                    if (not next_period_name.endswith(' NIGHT') and
                        next_period_name not in ['TONIGHT', 'TODAY', 'REST OF TONIGHT', 'THIS AFTERNOON']):
                        current_day_offset += 1

            converted_periods.append(f'{relative_label} ({target_date}) {collapsed_content}')

        return '\n'.join(converted_periods)


class NWSForecastProcessor:
    """Main processor that orchestrates the complete forecast processing pipeline."""

    def __init__(self):
        self.corruption_detector = ForecastCorruptionDetector()
        self.period_converter = ForecastPeriodConverter()
        self.corrupted_forecasts = []

    def analyze_forecast_file(self, file_path):
        """Analyze all forecasts in a file for corruption issues."""
        print(f"Analyzing: {file_path}")

        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()

        forecast_blocks = content.split('$$')

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
                corruption_info = self.corruption_detector.detect_corruption_patterns(forecast_content)

                if corruption_info['has_corruption']:
                    self.corrupted_forecasts.append({
                        'timestamp': timestamp,
                        'corruption_types': corruption_info['corruption_types'],
                        'corruption_details': corruption_info['corruption_details'],
                        'content_preview': forecast_content[:200] + '...' if len(forecast_content) > 200 else forecast_content
                    })

    def process_forecast_file(self, input_file, output_file):
        """Process the entire forecast file, converting all periods to relative format."""
        print(f"Processing forecast file: {input_file}")

        with open(input_file, 'r', encoding='utf-8') as file:
            content = file.read()

        # Split content by forecast delimiter
        forecast_blocks = content.split('$$')
        converted_blocks = []

        processed_count = 0
        error_count = 0

        # Get list of corrupted forecast timestamps to skip
        corrupted_timestamps = {forecast['timestamp'] for forecast in self.corrupted_forecasts}

        for block in forecast_blocks:
            block = block.strip()
            if not block:
                converted_blocks.append('')
                continue

            # Find the timestamp in this block
            timestamp_match = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-08:00', block)

            if timestamp_match:
                timestamp_str = timestamp_match.group(0)

                # Skip corrupted forecasts
                if timestamp_str in corrupted_timestamps:
                    print(f"  Skipping corrupted forecast: {timestamp_str}")
                    continue

                forecast_time = self.period_converter.parse_forecast_timestamp(timestamp_str)

                if forecast_time:
                    # Extract the forecast content (everything after the timestamp line)
                    timestamp_pos = block.find(timestamp_str)
                    timestamp_line_end = timestamp_pos + len(timestamp_str)
                    forecast_content = block[timestamp_line_end:].strip()

                    if forecast_content:
                        # Only keep the issued line (no PZZ655 header)
                        issued_line = f"Issued: {timestamp_str}\n\n"

                        # Extract warnings and convert periods
                        warnings, clean_content = self.period_converter.extract_warnings(forecast_content)
                        converted_content = self.period_converter.convert_forecast_periods(clean_content, forecast_time)

                        # Reconstruct block: issued line + warnings + converted content
                        if warnings:
                            converted_block = issued_line + warnings + "\n\n" + converted_content
                        else:
                            converted_block = issued_line + converted_content

                        converted_blocks.append(converted_block)
                        processed_count += 1
                    else:
                        continue
                else:
                    converted_blocks.append(block)
                    error_count += 1
            else:
                converted_blocks.append(block)

        # Write converted content with proper delimiter formatting
        with open(output_file, 'w', encoding='utf-8') as file:
            for i, block in enumerate(converted_blocks):
                if block.strip():
                    file.write(block)
                    # Add delimiter after each forecast except the last one
                    if i < len(converted_blocks) - 1:
                        file.write('\n\n$$\n\n')
                elif i == 0:
                    file.write('')

        print(f"Conversion completed:")
        print(f"  Processed forecasts: {processed_count:,}")
        print(f"  Parsing errors: {error_count:,}")
        print(f"  Skipped corrupted forecasts: {len(corrupted_timestamps):,}")
        print(f"  Output saved to: {output_file}")

        return processed_count, error_count, len(corrupted_timestamps)

    def generate_corruption_report(self, output_dir):
        """Generate detailed corruption report and invalid dates list."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate invalid dates list
        invalid_dates_file = output_dir / "invalid_forecast_dates.txt"
        detailed_report_file = output_dir / "corrupted_forecasts_report.txt"

        print(f"Generating corruption reports...")

        # Sort by timestamp
        self.corrupted_forecasts.sort(key=lambda x: x['timestamp'])

        # Write invalid dates list
        with open(invalid_dates_file, 'w') as f:
            f.write("# Invalid Forecast Dates\n")
            f.write("# Forecasts with data corruption issues that should be excluded from training\n")
            f.write("# Format: YYYY-MM-DDTHH:MM:SS-08:00\n")
            f.write("#\n")
            f.write(f"# Total corrupted forecasts: {len(self.corrupted_forecasts)}\n")
            f.write(f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("#\n\n")

            for forecast in self.corrupted_forecasts:
                f.write(f"{forecast['timestamp']}\n")

        # Write detailed report
        with open(detailed_report_file, 'w') as f:
            f.write("CORRUPTED FORECASTS DIAGNOSTIC REPORT\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total Corrupted Forecasts: {len(self.corrupted_forecasts)}\n\n")

            # Summary by corruption type
            corruption_type_counts = {}
            for forecast in self.corrupted_forecasts:
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

            for i, forecast in enumerate(self.corrupted_forecasts, 1):
                f.write(f"{i:3d}. {forecast['timestamp']}\n")
                f.write(f"     Corruption Types: {', '.join(forecast['corruption_types'])}\n")
                f.write(f"     Details: {'; '.join(str(d) for d in forecast['corruption_details'][:5])}\n")
                f.write(f"     Preview: {forecast['content_preview'][:100]}...\n")
                f.write(f"     {'─' * 70}\n")

        print(f"✅ Corruption reports generated:")
        print(f"   Invalid dates list: {invalid_dates_file}")
        print(f"   Detailed report: {detailed_report_file}")

        return invalid_dates_file, detailed_report_file

    def process(self, input_file, output_dir=None):
        """
        Complete processing pipeline: detect corruption, convert periods, generate reports.

        Args:
            input_file: Path to input forecast file with ISO timestamps
            output_dir: Output directory (defaults to data/cleaned/)

        Returns:
            Dictionary with processing results and output file paths
        """
        input_file = Path(input_file)
        if not input_file.exists():
            raise FileNotFoundError(f"Input file not found: {input_file}")

        if output_dir is None:
            output_dir = input_file.parent.parent / "cleaned"
        else:
            output_dir = Path(output_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        # Output file paths
        processed_forecasts_file = output_dir / f"{input_file.stem}_relative_periods.txt"
        reports_dir = output_dir.parent / "training"

        print("NWS FORECAST PROCESSING PIPELINE")
        print("=" * 60)
        print(f"Input file: {input_file}")
        print(f"Output directory: {output_dir}")
        print()

        # Step 1: Analyze for corruption
        print("Step 1: Analyzing forecast data for corruption...")
        self.analyze_forecast_file(input_file)

        if self.corrupted_forecasts:
            print(f"⚠️  Found {len(self.corrupted_forecasts)} corrupted forecasts")

            # Generate corruption reports
            invalid_dates_file, detailed_report_file = self.generate_corruption_report(reports_dir)
        else:
            print("✅ No corrupted forecasts found!")
            invalid_dates_file = detailed_report_file = None

        print()

        # Step 2: Convert forecast periods
        print("Step 2: Converting forecast periods to relative day format...")
        processed_count, error_count, skipped_count = self.process_forecast_file(input_file, processed_forecasts_file)

        print()
        print("✅ PROCESSING PIPELINE COMPLETED!")
        print("=" * 60)
        print(f"📊 Processing Summary:")
        print(f"   • Processed forecasts: {processed_count:,}")
        print(f"   • Parsing errors: {error_count:,}")
        print(f"   • Corrupted forecasts skipped: {skipped_count:,}")
        print()
        print(f"📁 Output Files:")
        print(f"   • Processed forecasts: {processed_forecasts_file}")
        if invalid_dates_file:
            print(f"   • Invalid dates list: {invalid_dates_file}")
            print(f"   • Corruption report: {detailed_report_file}")

        return {
            'processed_forecasts_file': processed_forecasts_file,
            'invalid_dates_file': invalid_dates_file,
            'detailed_report_file': detailed_report_file,
            'processed_count': processed_count,
            'error_count': error_count,
            'skipped_count': skipped_count
        }


def main():
    """Main function for command-line usage."""
    if len(sys.argv) < 2:
        print("Usage: python3 process_nws_forecasts.py <input_file> [output_dir]")
        print()
        print("Args:")
        print("  input_file: Path to raw NWS forecast file with ISO timestamps")
        print("  output_dir: Optional output directory (defaults to data/cleaned/)")
        print()
        print("Example:")
        print("  python3 process_nws_forecasts.py data/raw/inner_waters_forecasts_2019_2025_iso_timestamps.txt")
        sys.exit(1)

    input_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        processor = NWSForecastProcessor()
        results = processor.process(input_file, output_dir)

        print(f"\n🎯 Ready for LLM training!")
        print(f"Use processed file: {results['processed_forecasts_file']}")
        if results['invalid_dates_file']:
            print(f"Exclude dates from: {results['invalid_dates_file']}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()