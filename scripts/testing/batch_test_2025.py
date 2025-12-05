#!/usr/bin/env python3
"""
Batch Testing Script for 2025 Forecasts

Runs forecast tests across multiple dates in 2025 and compiles results.
Can optionally call the LLM API for all tests.

Usage:
    python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-31
    python3 batch_test_2025.py --dates-file dates_to_test.txt --call-llm

Date file format (one date per line):
    2025-07-15
    2025-07-20
    2025-08-01
"""

import json
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional

# Import the main test function
from test_2025_forecast import run_forecast_test


def parse_date_range(start_date: str, end_date: str) -> List[str]:
    """
    Generate list of dates between start_date and end_date (inclusive).

    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format

    Returns:
        List of date strings
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')

    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime('%Y-%m-%d'))
        current += timedelta(days=1)

    return dates


def load_dates_from_file(file_path: Path) -> List[str]:
    """
    Load dates from a text file (one per line).

    Args:
        file_path: Path to the file containing dates

    Returns:
        List of date strings
    """
    dates = []
    with open(file_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                # Validate date format
                try:
                    datetime.strptime(line, '%Y-%m-%d')
                    dates.append(line)
                except ValueError:
                    print(f"⚠️  Warning: Skipping invalid date: {line}")

    return dates


def calculate_error_metrics(actual_conditions: List[Dict], llm_predictions: Optional[Dict]) -> Dict:
    """
    Calculate error metrics between actual conditions and LLM predictions.

    Args:
        actual_conditions: List of actual hourly wind data
        llm_predictions: Dictionary of LLM predictions (if available)

    Returns:
        Dictionary with error metrics
    """
    if not llm_predictions or not actual_conditions:
        return {
            'wspd_mae': None,
            'gst_mae': None,
            'wspd_rmse': None,
            'gst_rmse': None
        }

    # TODO: Parse LLM predictions and calculate errors
    # This would require parsing the LLM response text
    # For now, return None
    return {
        'wspd_mae': None,
        'gst_mae': None,
        'wspd_rmse': None,
        'gst_rmse': None,
        'note': 'Prediction parsing not implemented yet'
    }


def run_batch_tests(
    dates: List[str],
    anthropic_api_key: Optional[str] = None,
    call_llm: bool = False,
    output_dir: Optional[Path] = None
) -> Dict:
    """
    Run forecast tests for multiple dates and compile results.

    Args:
        dates: List of dates to test
        anthropic_api_key: Optional Anthropic API key
        call_llm: Whether to call LLM API
        output_dir: Optional output directory for results

    Returns:
        Dictionary with batch test results
    """
    print("🔬 BATCH TESTING 2025 FORECASTS")
    print("=" * 70)
    print(f"Testing {len(dates)} dates")
    print(f"Date range: {min(dates)} to {max(dates)}")
    print(f"LLM calls: {'Enabled' if call_llm else 'Disabled'}")
    print()

    results = {
        'test_date': datetime.now().isoformat(),
        'total_dates': len(dates),
        'successful_tests': 0,
        'failed_tests': 0,
        'tests': []
    }

    for i, test_date in enumerate(dates, 1):
        print(f"\n[{i}/{len(dates)}] Testing {test_date}...")
        print("-" * 70)

        try:
            result = run_forecast_test(
                test_date,
                anthropic_api_key=anthropic_api_key,
                save_prompt=True,
                call_llm=call_llm,
                verbose=False  # Less verbose for batch mode
            )

            if result:
                # Calculate summary metrics
                actual = result['actual_conditions']
                if actual:
                    avg_wspd = sum(d['wspd_avg_kt'] for d in actual) / len(actual)
                    max_gst = max(d['gst_max_kt'] for d in actual)
                else:
                    avg_wspd = None
                    max_gst = None

                test_summary = {
                    'date': test_date,
                    'status': 'success',
                    'forecast_issued': result['forecast_info']['issued'],
                    'examples_used': result['examples_count'],
                    'data_points': len(actual) if actual else 0,
                    'avg_wspd_kt': round(avg_wspd, 1) if avg_wspd else None,
                    'max_gst_kt': round(max_gst, 1) if max_gst else None,
                    'has_warnings': bool(result['forecast_info'].get('warnings')),
                    'warnings': result['forecast_info'].get('warnings'),
                    'llm_called': call_llm and result['llm_response'] is not None
                }

                results['successful_tests'] += 1
                print(f"  ✓ Success: {len(actual)} hours, "
                      f"Avg WSPD: {avg_wspd:.1f}kt, Max GST: {max_gst:.1f}kt")

            else:
                test_summary = {
                    'date': test_date,
                    'status': 'failed',
                    'error': 'Test returned None'
                }
                results['failed_tests'] += 1
                print(f"  ✗ Failed: Test returned None")

            results['tests'].append(test_summary)

        except Exception as e:
            print(f"  ✗ Failed with exception: {e}")
            results['tests'].append({
                'date': test_date,
                'status': 'error',
                'error': str(e)
            })
            results['failed_tests'] += 1

    # Save results to JSON
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        results_file = output_dir / f'batch_test_results_{timestamp}.json'

        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\n📊 Results saved to: {results_file}")

    return results


def print_summary(results: Dict):
    """Print summary of batch test results."""
    print("\n" + "=" * 70)
    print("📈 BATCH TEST SUMMARY")
    print("=" * 70)

    print(f"Total dates tested: {results['total_dates']}")
    print(f"Successful tests: {results['successful_tests']} "
          f"({results['successful_tests']/results['total_dates']*100:.1f}%)")
    print(f"Failed tests: {results['failed_tests']}")

    # Calculate statistics from successful tests
    successful_tests = [t for t in results['tests'] if t['status'] == 'success']

    if successful_tests:
        # Wind statistics
        wspd_values = [t['avg_wspd_kt'] for t in successful_tests if t['avg_wspd_kt'] is not None]
        gst_values = [t['max_gst_kt'] for t in successful_tests if t['max_gst_kt'] is not None]

        if wspd_values:
            print(f"\nWind Speed Statistics:")
            print(f"  Average WSPD: {sum(wspd_values)/len(wspd_values):.1f}kt")
            print(f"  Min WSPD: {min(wspd_values):.1f}kt")
            print(f"  Max WSPD: {max(wspd_values):.1f}kt")

        if gst_values:
            print(f"\nGust Statistics:")
            print(f"  Average Max GST: {sum(gst_values)/len(gst_values):.1f}kt")
            print(f"  Min GST: {min(gst_values):.1f}kt")
            print(f"  Max GST: {max(gst_values):.1f}kt")

        # Warnings count
        warnings_count = sum(1 for t in successful_tests if t.get('has_warnings'))
        print(f"\nForecasts with warnings: {warnings_count} "
              f"({warnings_count/len(successful_tests)*100:.1f}%)")

    # Failed tests details
    if results['failed_tests'] > 0:
        print(f"\n⚠️  Failed Tests:")
        for test in results['tests']:
            if test['status'] != 'success':
                error_msg = test.get('error', 'Unknown error')
                print(f"  - {test['date']}: {error_msg}")


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description='Batch test 2025 wind forecasts',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test a date range
  python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-31

  # Test specific dates from a file
  python3 batch_test_2025.py --dates-file dates_to_test.txt

  # Test with LLM calls
  python3 batch_test_2025.py --start-date 2025-07-01 --end-date 2025-07-10 --call-llm

  # Test every 7 days
  python3 batch_test_2025.py --start-date 2025-01-01 --end-date 2025-09-30 --step 7
        """
    )

    # Date selection options
    date_group = parser.add_mutually_exclusive_group(required=True)
    date_group.add_argument('--start-date', help='Start date (YYYY-MM-DD)')
    date_group.add_argument('--dates-file', type=Path, help='File with dates to test (one per line)')

    parser.add_argument('--end-date', help='End date (YYYY-MM-DD), required with --start-date')
    parser.add_argument('--step', type=int, default=1, help='Step between dates (default: 1 day)')

    # LLM options
    parser.add_argument('--call-llm', action='store_true', help='Actually call the LLM API')
    parser.add_argument('--anthropic-api-key', help='Anthropic API key')

    # Output options
    parser.add_argument('--output-dir', type=Path, default=Path('data/testing/batch_results'),
                        help='Output directory for results (default: data/testing/batch_results)')

    args = parser.parse_args()

    # Generate list of dates to test
    if args.start_date:
        if not args.end_date:
            parser.error("--end-date is required when using --start-date")

        dates = parse_date_range(args.start_date, args.end_date)

        # Apply step if specified
        if args.step > 1:
            dates = dates[::args.step]

    else:
        dates = load_dates_from_file(args.dates_file)

    if not dates:
        print("❌ No dates to test")
        sys.exit(1)

    # Run batch tests
    results = run_batch_tests(
        dates,
        anthropic_api_key=args.anthropic_api_key,
        call_llm=args.call_llm,
        output_dir=args.output_dir
    )

    # Print summary
    print_summary(results)

    # Exit with error if any tests failed
    if results['failed_tests'] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
