#!/usr/bin/env python3
"""
Few-Shot Example Curation Script

Generates 48 curated example files (12 months × 4 forecast numbers) from training data.
Each file contains 15 diverse examples filtered by month window, forecast number,
wind strength, and temporal diversity.

Usage:
    python3 curate_few_shot_examples.py
"""

import json
import os
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import re
import random
from pathlib import Path


class FewShotExampleCurator:
    """Curates few-shot examples from training data with sophisticated filtering."""

    def __init__(self, training_file, output_dir):
        self.training_file = training_file
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Load training data
        print("Loading training examples...")
        with open(training_file, 'r') as f:
            self.training_data = json.load(f)
        print(f"Loaded {len(self.training_data)} training examples")

        # Month windows (3-month periods)
        self.month_windows = {
            1: [12, 1, 2],   # Jan: Dec-Feb
            2: [1, 2, 3],    # Feb: Jan-Mar
            3: [2, 3, 4],    # Mar: Feb-Apr
            4: [3, 4, 5],    # Apr: Mar-May
            5: [4, 5, 6],    # May: Apr-Jun
            6: [5, 6, 7],    # Jun: May-Jul
            7: [6, 7, 8],    # Jul: Jun-Aug
            8: [7, 8, 9],    # Aug: Jul-Sep
            9: [8, 9, 10],   # Sep: Aug-Oct
            10: [9, 10, 11], # Oct: Sep-Nov
            11: [10, 11, 12],# Nov: Oct-Dec
            12: [11, 12, 1]  # Dec: Nov-Jan
        }

        # Wind strength categories (based on peak WSPD)
        self.wind_targets = {
            'calm': 4,      # < 10 kt
            'moderate': 8,  # 10-20 kt
            'strong': 3     # > 20 kt
        }

        # Statistics tracking
        self.stats = {
            'total_combinations': 0,
            'successful_combinations': 0,
            'insufficient_data': [],
            'examples_by_month': defaultdict(int),
            'examples_by_forecast_num': defaultdict(int),
            'wind_distribution': defaultdict(lambda: defaultdict(int))
        }

    def get_issue_month(self, issued_datetime):
        """Extract month from issued datetime string."""
        try:
            dt = datetime.fromisoformat(issued_datetime.replace('Z', '+00:00'))
            return dt.month
        except:
            return None

    def is_in_month_window(self, issue_month, target_month):
        """Check if issue month falls within target month's 3-month window."""
        if not issue_month:
            return False
        return issue_month in self.month_windows[target_month]

    def has_complete_forecast_data(self, example):
        """Check if example has complete wind data for all forecasted days."""
        actual = example.get('actual', {})

        # Check for at least D0, D1, D2 (3 days as per project spec)
        required_days = ['day_0', 'day_1', 'day_2']

        for day in required_days:
            if day not in actual:
                return False

            day_data = actual[day]
            if not day_data or 'hourly' not in day_data:
                return False

            # Check that we have meaningful hourly data
            hourly = day_data['hourly']
            if not hourly or len(hourly) < 5:  # Need at least 5 hours of data
                return False

            # Check that wind data exists
            for hour_data in hourly:
                if not hour_data.get('wspd_avg_kt') or not hour_data.get('gst_max_kt'):
                    return False

        return True

    def get_peak_wind_speed(self, example):
        """Get peak wind speed across all forecasted days."""
        max_wspd = 0
        actual = example.get('actual', {})

        for day in ['day_0', 'day_1', 'day_2']:
            if day in actual and 'hourly' in actual[day]:
                for hour_data in actual[day]['hourly']:
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    if wspd > max_wspd:
                        max_wspd = wspd

        return max_wspd

    def classify_wind_strength(self, peak_wspd):
        """Classify wind strength based on peak WSPD."""
        if peak_wspd < 10:
            return 'calm'
        elif peak_wspd <= 20:
            return 'moderate'
        else:
            return 'strong'

    def get_example_year(self, example):
        """Extract year from issued datetime."""
        try:
            issued = example.get('issued', '')
            dt = datetime.fromisoformat(issued.replace('Z', '+00:00'))
            return dt.year
        except:
            return None

    def get_example_week(self, example):
        """Get week identifier for temporal spreading."""
        try:
            issued = example.get('issued', '')
            dt = datetime.fromisoformat(issued.replace('Z', '+00:00'))
            return f"{dt.year}-W{dt.isocalendar()[1]:02d}"
        except:
            return None

    def has_warning(self, example):
        """Check if forecast has weather warnings."""
        warnings = example.get('warnings')
        return warnings is not None and warnings.strip()

    def select_diverse_examples(self, candidates, target_count=15):
        """Select diverse examples from candidates with wind strength targets."""
        if len(candidates) < target_count:
            print(f"    Warning: Only {len(candidates)} candidates available, need {target_count}")
            return candidates

        # Group by wind strength
        by_wind = defaultdict(list)
        for example in candidates:
            peak_wspd = self.get_peak_wind_speed(example)
            wind_class = self.classify_wind_strength(peak_wspd)
            by_wind[wind_class].append(example)

        print(f"    Wind distribution: calm={len(by_wind['calm'])}, moderate={len(by_wind['moderate'])}, strong={len(by_wind['strong'])}")

        selected = []

        # Select examples for each wind category
        for wind_class, wind_target_count in self.wind_targets.items():
            available = by_wind[wind_class]

            if len(available) >= wind_target_count:
                # Select with diversity
                selected_for_class = self.select_diverse_subset(available, wind_target_count)
                selected.extend(selected_for_class)
                print(f"    Selected {len(selected_for_class)} {wind_class} examples")
            else:
                # Take all available
                selected.extend(available)
                print(f"    Warning: Only {len(available)} {wind_class} examples available, need {wind_target_count}")

        print(f"    After wind selection: {len(selected)} examples")

        # If we don't have enough, fill from remaining candidates
        if len(selected) < target_count:
            remaining_needed = target_count - len(selected)
            used_indices = {id(ex) for ex in selected}
            remaining_candidates = [ex for ex in candidates if id(ex) not in used_indices]

            print(f"    Need {remaining_needed} more examples, {len(remaining_candidates)} remaining candidates")

            if remaining_candidates:
                additional = self.select_diverse_subset(remaining_candidates, remaining_needed)
                selected.extend(additional)
                print(f"    Added {len(additional)} additional examples")

        print(f"    Final selection: {len(selected)} examples (target was {target_count})")
        return selected[:target_count]

    def select_diverse_subset(self, examples, count):
        """Select diverse subset with basic shuffling."""
        import random

        if len(examples) <= count:
            return examples

        # Simple approach: shuffle and return first N
        shuffled = examples.copy()
        random.shuffle(shuffled)
        return shuffled[:count]

    def process_combination(self, month, forecast_num):
        """Process one month × forecast number combination."""
        month_names = ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                      'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        month_name = month_names[month]

        print(f"\nProcessing {month_name.upper()} forecast #{forecast_num}...")

        # Filter candidates
        candidates = []

        for example in self.training_data:
            # Check forecast number
            if example.get('number') != forecast_num:
                continue

            # Check month window
            issued = example.get('issued', '')
            issue_month = self.get_issue_month(issued)
            if not self.is_in_month_window(issue_month, month):
                continue

            # Check completeness
            if not example.get('complete', False):
                continue

            # Check complete forecast data
            if not self.has_complete_forecast_data(example):
                continue

            candidates.append(example)

        print(f"  Found {len(candidates)} valid candidates")

        # Select diverse examples
        selected = self.select_diverse_examples(candidates, 15)

        # Save to file
        filename = f"{month_name}_fc{forecast_num}_examples.json"
        filepath = self.output_dir / filename

        with open(filepath, 'w') as f:
            json.dump(selected, f, indent=2)

        print(f"  Saved {len(selected)} examples to {filename}")

        # Update statistics
        self.stats['examples_by_month'][month_name] += len(selected)
        self.stats['examples_by_forecast_num'][forecast_num] += len(selected)

        if len(selected) < 15:
            self.stats['insufficient_data'].append({
                'month': month_name,
                'forecast_num': forecast_num,
                'available': len(selected),
                'needed': 15
            })

        # Wind distribution stats
        for example in selected:
            peak_wspd = self.get_peak_wind_speed(example)
            wind_class = self.classify_wind_strength(peak_wspd)
            self.stats['wind_distribution'][month_name][wind_class] += 1

        return len(selected)

    def generate_all_combinations(self):
        """Generate all 48 month × forecast number combinations."""
        print("Generating 48 few-shot example files...")
        print("=" * 60)

        total_examples = 0

        for month in range(1, 13):
            for forecast_num in range(1, 5):
                self.stats['total_combinations'] += 1
                examples_count = self.process_combination(month, forecast_num)
                total_examples += examples_count

                if examples_count > 0:
                    self.stats['successful_combinations'] += 1

        print(f"\n" + "=" * 60)
        print(f"SUMMARY: Generated {self.stats['successful_combinations']}/{self.stats['total_combinations']} combinations")
        print(f"Total examples curated: {total_examples}")

        return total_examples

    def generate_report(self, total_examples):
        """Generate comprehensive curation report."""
        report_path = self.output_dir.parent / "FEW_SHOT_CURATION_REPORT.md"

        with open(report_path, 'w') as f:
            f.write("# Few-Shot Example Curation Report\n\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

            # Summary
            f.write("## Summary\n\n")
            f.write(f"- **Total files generated:** {self.stats['successful_combinations']}/48\n")
            f.write(f"- **Total examples curated:** {total_examples}\n")
            f.write(f"- **Target examples per file:** 15\n")
            f.write(f"- **Average examples per file:** {total_examples/max(1, self.stats['successful_combinations']):.1f}\n\n")

            # Distribution table
            f.write("## Distribution by Month × Forecast Number\n\n")
            f.write("| Month | FC1 | FC2 | FC3 | FC4 | Total |\n")
            f.write("|-------|-----|-----|-----|-----|-------|\n")

            months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                     'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

            for month in months:
                row = f"| {month.title()} |"
                total_month = 0
                for fc in range(1, 5):
                    # Count examples in file
                    filename = f"{month}_fc{fc}_examples.json"
                    filepath = self.output_dir / filename

                    if filepath.exists():
                        with open(filepath, 'r') as file:
                            examples = json.load(file)
                            count = len(examples)
                    else:
                        count = 0

                    row += f" {count:2d} |"
                    total_month += count

                row += f" {total_month:3d} |"
                f.write(row + "\n")

            # Insufficient data
            if self.stats['insufficient_data']:
                f.write("\n## Combinations with Insufficient Data\n\n")
                f.write("| Month | Forecast # | Available | Needed |\n")
                f.write("|-------|------------|-----------|--------|\n")

                for item in self.stats['insufficient_data']:
                    f.write(f"| {item['month'].title()} | {item['forecast_num']} | {item['available']} | {item['needed']} |\n")

            # Wind strength distribution
            f.write("\n## Wind Strength Distribution by Month\n\n")
            f.write("| Month | Calm (<10kt) | Moderate (10-20kt) | Strong (>20kt) |\n")
            f.write("|-------|--------------|--------------------|-----------------|\n")

            for month in months:
                wind_dist = self.stats['wind_distribution'][month]
                f.write(f"| {month.title()} | {wind_dist['calm']:2d} | {wind_dist['moderate']:2d} | {wind_dist['strong']:2d} |\n")

        print(f"Report saved to: {report_path}")


def main():
    """Main execution function."""
    # File paths
    training_file = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/training_examples.json"
    output_dir = "/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/few_shot_examples"

    # Create curator and generate examples
    curator = FewShotExampleCurator(training_file, output_dir)
    total_examples = curator.generate_all_combinations()
    curator.generate_report(total_examples)

    print(f"\n✅ Curation complete!")
    print(f"📁 Files saved to: {output_dir}")
    print(f"📄 Report: {Path(output_dir).parent}/FEW_SHOT_CURATION_REPORT.md")


if __name__ == "__main__":
    main()