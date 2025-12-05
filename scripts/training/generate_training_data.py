#!/usr/bin/env python3
"""
LLM Training Data Generation Script

Generates training examples by combining forecast data with actual wind measurements.
Creates JSON format suitable for LLM training with validation for data completeness.

Usage:
    python3 generate_training_data.py [output_file]

Args:
    output_file: Optional path for JSON output (defaults to data/training/training_examples.json)
"""

import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path


class WindDataLoader:
    """Loads and manages wind measurement data from multiple yearly files."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.wind_data = {}  # date -> hourly data mapping
        self.complete_days = set()
        self.load_complete_days()
        self.load_wind_data()

    def load_complete_days(self):
        """Load list of complete wind measurement days."""
        complete_days_file = self.data_dir.parent / "training" / "complete_days_wind_only.txt"

        print(f"Loading complete days from: {complete_days_file}")

        with open(complete_days_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    self.complete_days.add(line)

        print(f"  Loaded {len(self.complete_days)} complete wind measurement days")

    def load_wind_data(self):
        """Load wind measurement data from all yearly files."""
        wind_files = list(self.data_dir.glob("wind_*_processed.txt"))

        print(f"Loading wind data from {len(wind_files)} files...")

        for wind_file in sorted(wind_files):
            print(f"  Processing: {wind_file.name}")
            self._load_wind_file(wind_file)

        print(f"  Total loaded days: {len(self.wind_data)}")

    def _load_wind_file(self, file_path):
        """Load wind data from a single file."""
        with open(file_path, 'r') as f:
            lines = f.readlines()

        if not lines or not lines[0].startswith('#'):
            print(f"    Warning: No header found in {file_path}")
            return

        # Parse header to get column indices
        header = lines[0].strip().lstrip('#').split()
        try:
            datetime_idx = header.index('DATETIME_PST')
            wspd_idx = header.index('WSPD')
            gst_idx = header.index('GST')
        except ValueError as e:
            print(f"    Warning: Missing required columns in {file_path}: {e}")
            return

        # Process data lines
        for line_num, line in enumerate(lines[1:], 2):
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) <= max(datetime_idx, wspd_idx, gst_idx):
                continue

            try:
                # Parse timestamp
                timestamp_str = parts[datetime_idx]
                if timestamp_str.endswith('-08:00'):
                    timestamp_str = timestamp_str[:-6]
                dt = datetime.fromisoformat(timestamp_str)
                date_str = dt.date().strftime('%Y-%m-%d')
                hour = dt.hour

                # Extract wind data
                wspd = float(parts[wspd_idx])
                gst = float(parts[gst_idx])

                # Skip invalid data
                if wspd >= 99.0 or gst >= 99.0:
                    continue

                # Store data by date and hour
                if date_str not in self.wind_data:
                    self.wind_data[date_str] = {}

                if hour not in self.wind_data[date_str]:
                    self.wind_data[date_str][hour] = []

                self.wind_data[date_str][hour].append({
                    'wspd': wspd,
                    'gst': gst,
                    'timestamp': dt
                })

            except (ValueError, IndexError) as e:
                continue  # Skip invalid lines

    def get_hourly_aggregated_data(self, date_str):
        """
        Get hourly aggregated wind data for a specific date.
        Returns 8-hour structure (10:00-18:00) or None if incomplete.
        """
        if date_str not in self.complete_days:
            return None

        if date_str not in self.wind_data:
            return None

        day_data = self.wind_data[date_str]
        hourly_results = []

        # Process 8 hours: 10:00-11:00, 11:00-12:00, ..., 17:00-18:00
        for hour in range(10, 18):
            if hour not in day_data:
                return None  # Missing hour data

            hour_measurements = day_data[hour]
            if not hour_measurements:
                return None  # No measurements for this hour

            # Calculate aggregated values
            wspd_values = [m['wspd'] for m in hour_measurements]
            gst_values = [m['gst'] for m in hour_measurements]

            wspd_avg = sum(wspd_values) / len(wspd_values)
            gst_max = max(gst_values)

            hourly_results.append({
                'hour': f"{hour:02d}:00-{hour+1:02d}:00",
                'wspd_avg_kt': round(wspd_avg, 1),
                'gst_max_kt': round(gst_max, 1)
            })

        return hourly_results

    def is_complete_day(self, date_str):
        """Check if a date has complete wind measurement data."""
        return date_str in self.complete_days


class ForecastProcessor:
    """Processes forecast data and extracts structured information."""

    def __init__(self, forecast_file, invalid_dates_file):
        self.forecast_file = Path(forecast_file)
        self.invalid_dates = self._load_invalid_dates(invalid_dates_file)

    def _load_invalid_dates(self, invalid_dates_file):
        """Load list of invalid forecast dates to exclude."""
        invalid_dates = set()

        print(f"Loading invalid dates from: {invalid_dates_file}")

        with open(invalid_dates_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    invalid_dates.add(line)

        print(f"  Loaded {len(invalid_dates)} invalid forecast dates")
        return invalid_dates

    def get_issuance_time(self, timestamp):
        """Extract issuance time in HH:MM format."""
        return timestamp.strftime('%H:%M')

    def parse_forecast_content(self, block):
        """Parse a forecast block and extract structured information."""
        lines = block.strip().split('\n')

        if not lines or not lines[0].startswith('Issued:'):
            return None

        # Extract timestamp
        timestamp_match = re.search(r'Issued: (.*)', lines[0])
        if not timestamp_match:
            return None

        timestamp_str = timestamp_match.group(1)

        # Skip invalid forecasts
        if timestamp_str in self.invalid_dates:
            return None

        try:
            if timestamp_str.endswith('-08:00'):
                timestamp_clean = timestamp_str[:-6]
            else:
                timestamp_clean = timestamp_str
            timestamp = datetime.fromisoformat(timestamp_clean)
        except ValueError:
            return None

        # Extract warnings
        warnings = None
        forecast_content = []

        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue

            if line.startswith('WARNING:'):
                warnings = line[9:]  # Remove "WARNING: " prefix
            else:
                forecast_content.append(line)

        # Parse forecast periods
        periods = {}
        for line in forecast_content:
            # Match patterns like "D0_DAY (2023-11-05) content..."
            period_match = re.match(r'(D\d+)_(DAY|NIGHT)\s+\(([^)]+)\)\s+(.*)', line)
            if period_match:
                day_num = period_match.group(1)  # D0, D1, etc.
                period_type = period_match.group(2).lower()  # day, night
                date_str = period_match.group(3)  # 2023-11-05
                content = period_match.group(4)  # forecast content

                key = f"{day_num}_{period_type}"
                periods[key] = {
                    'content': content,
                    'date': date_str
                }

        return {
            'timestamp': timestamp,
            'timestamp_str': timestamp_str,
            'issuance_time': self.get_issuance_time(timestamp),
            'warnings': warnings,
            'periods': periods
        }

    def process_forecasts(self):
        """Process all forecasts and yield parsed results."""
        print(f"Processing forecasts from: {self.forecast_file}")

        with open(self.forecast_file, 'r', encoding='utf-8') as f:
            content = f.read()

        forecast_blocks = content.split('$$')
        total_blocks = len(forecast_blocks)
        processed_count = 0
        invalid_count = 0

        for i, block in enumerate(forecast_blocks):
            if i % 1000 == 0:
                print(f"  Processing block {i:,}/{total_blocks:,}")

            forecast = self.parse_forecast_content(block)
            if forecast:
                processed_count += 1
                yield forecast
            else:
                invalid_count += 1

        print(f"  Processed: {processed_count:,} valid forecasts")
        print(f"  Skipped: {invalid_count:,} invalid forecasts")


class TrainingDataGenerator:
    """Main class for generating LLM training data."""

    def __init__(self, forecast_file, wind_data_dir, invalid_dates_file):
        self.wind_loader = WindDataLoader(wind_data_dir)
        self.forecast_processor = ForecastProcessor(forecast_file, invalid_dates_file)

    def validate_date_consistency(self, forecast_periods, forecast_date):
        """
        Cross-validate forecast dates vs calculated dates.
        Returns (is_valid, issues) tuple.
        """
        issues = []

        for period_key, period_data in forecast_periods.items():
            if '_' not in period_key:
                continue

            day_num_str, period_type = period_key.split('_', 1)
            day_offset = int(day_num_str[1:])  # Extract number from D0, D1, etc.

            # Calculate expected date
            expected_date = (forecast_date + timedelta(days=day_offset)).strftime('%Y-%m-%d')

            # Get actual date from forecast
            actual_date = period_data['date']

            if expected_date != actual_date:
                issues.append(f"{period_key}: expected {expected_date}, got {actual_date}")

        return len(issues) == 0, issues

    def check_sequence_gaps(self, available_days):
        """
        Check for gaps in day sequence.
        Returns (has_gaps, available_sequential_days) tuple.
        """
        if not available_days:
            return True, []

        available_days.sort()

        # Check for gaps in sequence
        for i in range(1, len(available_days)):
            if available_days[i] != available_days[i-1] + 1:
                return True, available_days[:i]  # Return up to the gap

        return False, available_days

    def generate_training_examples(self):
        """Generate training examples from forecast and wind data."""
        print("Generating LLM training examples...")
        print("=" * 60)

        training_examples = []
        stats = {
            'total_processed': 0,
            'date_validation_errors': 0,
            'incomplete_wind_data': 0,
            'sequence_gaps': 0,
            'complete_examples': 0,
            'partial_examples': 0
        }

        for forecast in self.forecast_processor.process_forecasts():
            stats['total_processed'] += 1

            # Validate date consistency
            is_valid, date_issues = self.validate_date_consistency(
                forecast['periods'],
                forecast['timestamp'].date()
            )

            if not is_valid:
                stats['date_validation_errors'] += 1
                print(f"⚠️  Date validation error in {forecast['timestamp_str']}: {'; '.join(date_issues)}")
                continue

            # Determine which days have complete wind data
            available_days = []
            period_dates = {}

            for period_key, period_data in forecast['periods'].items():
                day_num_str = period_key.split('_')[0]
                day_num = int(day_num_str[1:])  # Extract number from D0, D1, etc.
                date_str = period_data['date']

                if day_num not in period_dates:
                    period_dates[day_num] = date_str

                if self.wind_loader.is_complete_day(date_str) and day_num not in available_days:
                    available_days.append(day_num)

            if not available_days:
                stats['incomplete_wind_data'] += 1
                continue

            # Check for sequence gaps
            has_gaps, sequential_days = self.check_sequence_gaps(available_days)

            if has_gaps and len(sequential_days) == 0:
                stats['sequence_gaps'] += 1
                continue

            # Use sequential days (up to any gap), but limit to days 0-4 only
            available_days_limited = [day for day in sequential_days if day <= 4]

            # Build forecast section (only days 0-4)
            forecast_section = {}
            for day_num in available_days_limited:
                for period_type in ['day', 'night']:
                    period_key = f"D{day_num}_{period_type}"  # Use lowercase to match parsed keys
                    if period_key in forecast['periods']:
                        output_key = f"day_{day_num}_{period_type}"
                        forecast_section[output_key] = forecast['periods'][period_key]['content']

            # Build actual section (only days 0-4)
            actual_section = {}
            for day_num in available_days_limited:
                date_str = period_dates[day_num]
                hourly_data = self.wind_loader.get_hourly_aggregated_data(date_str)

                if hourly_data:
                    actual_section[f"day_{day_num}"] = {
                        'date': date_str,
                        'hourly': hourly_data
                    }

            # Determine if example is complete (has all 5 days: 0, 1, 2, 3, 4)
            is_complete = (
                len(available_days_limited) == 5 and
                available_days_limited == [0, 1, 2, 3, 4]
            )

            if is_complete:
                stats['complete_examples'] += 1
            else:
                stats['partial_examples'] += 1

            # Create training example
            training_example = {
                'issued': forecast['timestamp_str'],
                'issuance_time': forecast['issuance_time'],
                'complete': is_complete,
                'warnings': forecast['warnings'],
                'forecast': forecast_section,
                'actual': actual_section
            }

            training_examples.append(training_example)

            # Progress reporting
            if len(training_examples) % 100 == 0:
                print(f"  Generated {len(training_examples):,} training examples...")

        # Final statistics
        print("\n✅ TRAINING DATA GENERATION COMPLETED!")
        print("=" * 60)
        print(f"📊 Processing Statistics:")
        print(f"   • Total forecasts processed: {stats['total_processed']:,}")
        print(f"   • Date validation errors: {stats['date_validation_errors']:,}")
        print(f"   • Incomplete wind data: {stats['incomplete_wind_data']:,}")
        print(f"   • Sequence gaps: {stats['sequence_gaps']:,}")
        print(f"   • Complete examples (5 days): {stats['complete_examples']:,}")
        print(f"   • Partial examples (<5 days): {stats['partial_examples']:,}")
        print(f"   • Total training examples: {len(training_examples):,}")

        completion_rate = (stats['complete_examples'] / len(training_examples) * 100) if training_examples else 0
        print(f"   • Completion rate: {completion_rate:.1f}%")

        return training_examples


def main():
    """Main function."""
    # Set up file paths
    base_dir = Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm")

    forecast_file = base_dir / "data/cleaned/inner_waters_forecasts_relative_periods.txt"
    wind_data_dir = base_dir / "data/cleaned"
    invalid_dates_file = base_dir / "data/training/invalid_forecast_dates.txt"

    # Output file
    if len(sys.argv) > 1:
        output_file = Path(sys.argv[1])
    else:
        output_file = base_dir / "data/training/training_examples.json"

    # Verify input files exist
    if not forecast_file.exists():
        print(f"❌ Error: Forecast file not found: {forecast_file}")
        sys.exit(1)

    if not wind_data_dir.exists():
        print(f"❌ Error: Wind data directory not found: {wind_data_dir}")
        sys.exit(1)

    if not invalid_dates_file.exists():
        print(f"❌ Error: Invalid dates file not found: {invalid_dates_file}")
        sys.exit(1)

    # Create output directory
    output_file.parent.mkdir(parents=True, exist_ok=True)

    print("LLM TRAINING DATA GENERATOR")
    print("=" * 60)
    print(f"📁 Input Files:")
    print(f"   • Forecasts: {forecast_file}")
    print(f"   • Wind data: {wind_data_dir}")
    print(f"   • Invalid dates: {invalid_dates_file}")
    print(f"📄 Output: {output_file}")
    print()

    # Generate training data
    try:
        generator = TrainingDataGenerator(forecast_file, wind_data_dir, invalid_dates_file)
        training_examples = generator.generate_training_examples()

        # Save to JSON
        print(f"\n💾 Saving training examples to: {output_file}")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(training_examples, f, indent=2, ensure_ascii=False)

        print(f"✅ Successfully generated {len(training_examples):,} training examples!")
        print(f"🎯 Training data ready for LLM fine-tuning!")

    except Exception as e:
        print(f"❌ Error generating training data: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()