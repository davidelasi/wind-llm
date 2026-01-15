#!/usr/bin/env python3
"""
Generic 2025 Wind Forecast Test Script

Tests wind forecasts for any date in 2025 using the validated few-shot methodology.
Can be called directly or imported by other scripts for batch testing.

Usage:
    python3 test_2025_forecast.py <test_date> [--anthropic-api-key KEY] [--verbose]

Example:
    python3 test_2025_forecast.py 2025-07-15
    python3 test_2025_forecast.py 2025-07-15 --anthropic-api-key sk-ant-...

When imported:
    from test_2025_forecast import run_forecast_test
    result = run_forecast_test('2025-07-15', anthropic_api_key='sk-ant-...')
"""

import json
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# Determine base paths dynamically
SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
CONFIG_DIR = PROJECT_ROOT / 'config'


def find_forecast_for_date(test_date_str: str, forecast_file: Path) -> Optional[Dict]:
    """
    Find the forecast for the test date from inner_waters_forecasts_relative_periods.txt

    Args:
        test_date_str: Date in YYYY-MM-DD format
        forecast_file: Path to the forecast file

    Returns:
        Dictionary with forecast info including warnings, or None if not found
    """
    print(f"Searching for forecast for {test_date_str} in {forecast_file.name}...")

    forecasts_found = []

    with open(forecast_file, 'r') as f:
        lines = f.readlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for "Issued:" lines
        if line.startswith('Issued:'):
            try:
                issued_datetime = line.replace('Issued: ', '')
                dt = datetime.fromisoformat(issued_datetime.replace('Z', '+00:00'))

                # Check if this is issued on our test date
                if dt.date().strftime('%Y-%m-%d') == test_date_str:
                    # Look for D0_DAY forecast and any warnings
                    j = i + 1
                    forecast_content = {}
                    warnings = None

                    while j < len(lines) and not lines[j].strip().startswith('$$'):
                        forecast_line = lines[j].strip()
                        if forecast_line:
                            # Check for warnings
                            if 'ADVISORY' in forecast_line.upper() or 'WARNING' in forecast_line.upper():
                                if not warnings:
                                    warnings = forecast_line
                                else:
                                    warnings += ' ' + forecast_line
                            # Capture forecast periods
                            elif forecast_line.startswith('D0_DAY'):
                                forecast_content['D0_DAY'] = forecast_line
                            elif forecast_line.startswith('D0_NIGHT'):
                                forecast_content['D0_NIGHT'] = forecast_line
                            elif forecast_line.startswith('D1_DAY'):
                                forecast_content['D1_DAY'] = forecast_line
                            elif forecast_line.startswith('D1_NIGHT'):
                                forecast_content['D1_NIGHT'] = forecast_line
                        j += 1

                    if 'D0_DAY' in forecast_content:
                        forecasts_found.append({
                            'issued': issued_datetime,
                            'issue_time': dt.strftime('%H:%M'),
                            'warnings': warnings,
                            **forecast_content
                        })

            except Exception as e:
                pass

        i += 1

    if forecasts_found:
        # Pick morning forecast (around 6-12 AM)
        morning_forecasts = []
        for f in forecasts_found:
            hour = datetime.fromisoformat(f['issued'].replace('Z', '+00:00')).hour
            if 6 <= hour <= 12:
                morning_forecasts.append(f)

        chosen = morning_forecasts[0] if morning_forecasts else forecasts_found[0]

        print(f"  ✓ Found forecast issued: {chosen['issued']} ({chosen['issue_time']})")
        if chosen.get('warnings'):
            print(f"  ⚠️  Warnings: {chosen['warnings']}")
        print(f"  D0_DAY forecast: {chosen['D0_DAY'][:80]}...")
        return chosen
    else:
        print(f"  ❌ No forecast found for {test_date_str}")
        return None


def get_examples_file_for_date(test_date_str: str, examples_dir: Path, forecast_format: str = 'json') -> Optional[Path]:
    """
    Determine which few-shot examples file to use based on test date.

    Args:
        test_date_str: Date in YYYY-MM-DD format
        examples_dir: Path to the few_shot_examples_json or few_shot_examples_toon directory
        forecast_format: Format type - 'json' or 'toon' (default: 'json')

    Returns:
        Path to the appropriate examples file, or None if not found
    """
    dt = datetime.strptime(test_date_str, '%Y-%m-%d')
    month = dt.strftime('%b').lower()  # jan, feb, mar, etc.

    # Determine forecast number based on time of day (simplified - use fc2 as default)
    # In production, this should match the actual issuance time
    forecast_num = 2

    examples_file = examples_dir / f"{month}_fc{forecast_num}_examples.json"

    if examples_file.exists():
        print(f"Using examples file: {examples_file.name}")
        return examples_file
    else:
        print(f"  ⚠️  Examples file not found: {examples_file.name}")
        print(f"  Searching for any {month}_fc* file...")

        # Try to find any file for that month
        month_files = list(examples_dir.glob(f"{month}_fc*.json"))
        if month_files:
            examples_file = month_files[0]
            print(f"  Using: {examples_file.name}")
            return examples_file

        print(f"  ❌ No examples file found for month: {month}")
        return None


def load_all_examples(examples_file: Path) -> List[Dict]:
    """
    Load ALL examples from the few-shot examples file.

    Args:
        examples_file: Path to the examples JSON file

    Returns:
        List of example dictionaries
    """
    print(f"Loading examples from {examples_file.name}...")

    with open(examples_file, 'r') as f:
        examples = json.load(f)

    print(f"  ✓ Loaded {len(examples)} examples")

    # Show variety in examples
    wind_strengths = []
    years = set()
    examples_with_warnings = 0

    for ex in examples:
        # Track years
        issued = ex.get('issued', '')
        if issued:
            try:
                dt = datetime.fromisoformat(issued.replace('Z', '+00:00'))
                years.add(dt.year)
            except:
                pass

        # Count warnings
        if ex.get('warnings'):
            examples_with_warnings += 1

        # Calculate peak wind strength
        peak_wspd = 0
        actual = ex.get('actual', {})
        for day in ['day_0', 'day_1', 'day_2']:
            if day in actual and 'hourly' in actual[day]:
                for hour_data in actual[day]['hourly']:
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    if wspd > peak_wspd:
                        peak_wspd = wspd

        if peak_wspd < 10:
            wind_strengths.append('calm')
        elif peak_wspd <= 20:
            wind_strengths.append('moderate')
        else:
            wind_strengths.append('strong')

    print(f"  Year spread: {sorted(years)}")
    print(f"  Wind variety: calm={wind_strengths.count('calm')}, "
          f"moderate={wind_strengths.count('moderate')}, strong={wind_strengths.count('strong')}")
    print(f"  Examples with warnings: {examples_with_warnings}")

    return examples


def load_processed_wind_data(test_date_str: str, wind_file: Path) -> List[Dict]:
    """
    Load wind data for test date from wind_2025_processed.txt
    Aggregates 6-minute measurements into hourly averages/maximums.

    Args:
        test_date_str: Date in YYYY-MM-DD format
        wind_file: Path to the processed wind data file

    Returns:
        List of hourly wind measurements (aggregated)
    """
    print(f"Loading wind data for {test_date_str} from {wind_file.name}...")

    with open(wind_file, 'r') as f:
        lines = f.readlines()

    # Collect all 6-minute measurements grouped by hour
    hourly_data = {}

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        # Split by space
        parts = line.split()
        if len(parts) < 4:
            continue

        try:
            datetime_pst = parts[0].strip()

            # Extract date from datetime
            if test_date_str in datetime_pst:
                # Parse the processed wind data
                # Format: DATETIME_PST WDIR WSPD GST PRES ATMP
                wspd = float(parts[2].strip()) if parts[2].strip() != 'null' else 0
                gst = float(parts[3].strip()) if parts[3].strip() != 'null' else 0

                # Extract hour from datetime
                dt = datetime.fromisoformat(datetime_pst.replace('-08:00', ''))
                hour = dt.hour

                # Only include hours from 10 AM to 6 PM (18:00)
                if 10 <= hour <= 18:
                    if hour not in hourly_data:
                        hourly_data[hour] = {'wspd_values': [], 'gst_values': []}

                    hourly_data[hour]['wspd_values'].append(wspd)
                    hourly_data[hour]['gst_values'].append(gst)

        except (ValueError, IndexError) as e:
            continue

    # Aggregate into hourly averages/maximums
    test_data = []
    for hour in sorted(hourly_data.keys()):
        data = hourly_data[hour]

        # WSPD: average of all measurements in the hour
        wspd_avg = sum(data['wspd_values']) / len(data['wspd_values']) if data['wspd_values'] else 0

        # GST: maximum value in the hour
        gst_max = max(data['gst_values']) if data['gst_values'] else 0

        test_data.append({
            'hour': hour,
            'wspd_avg_kt': wspd_avg,
            'gst_max_kt': gst_max,
            'measurements_count': len(data['wspd_values'])
        })

    if test_data:
        print(f"  ✓ Found {len(test_data)} hourly aggregates (10 AM - 6 PM)")
        avg_wspd = sum(d['wspd_avg_kt'] for d in test_data) / len(test_data)
        max_gst = max(d['gst_max_kt'] for d in test_data)
        print(f"  Summary: Avg WSPD = {avg_wspd:.1f}kt, Max GST = {max_gst:.1f}kt")
    else:
        print(f"  ⚠️  No wind data found for {test_date_str} (10 AM - 6 PM)")

    return test_data


def create_comprehensive_prompt(examples: List[Dict], forecast_info: Dict, test_date_str: str) -> str:
    """
    Create prompt using ALL examples and correct forecast source.
    Includes warnings from both training examples and the test forecast.

    Args:
        examples: List of training examples
        forecast_info: Dictionary with forecast information
        test_date_str: Date in YYYY-MM-DD format

    Returns:
        Complete prompt string for the LLM
    """
    prompt = "You are a wind forecasting expert for AGXC1 station (Los Angeles area). "
    prompt += "Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots "
    prompt += "for daytime hours (10 AM - 6 PM PST).\n\n"

    prompt += "IMPORTANT: Pay close attention to:\n"
    prompt += "- Wind speed ranges and timing cues in the forecast text\n"
    prompt += "- Any warnings or advisories (Small Craft Advisory often indicates stronger winds)\n"
    prompt += "- Patterns like 'becoming', 'increasing', 'diminishing' that indicate timing\n"
    prompt += "- The difference between sustained wind (WSPD) and gusts (GST)\n\n"

    prompt += f"Here are {len(examples)} examples showing how to interpret forecasts and actual outcomes:\n\n"

    # Add ALL examples
    for i, example in enumerate(examples, 1):
        prompt += f"=== EXAMPLE {i} ===\n"

        # Include warnings if present
        if example.get('warnings'):
            prompt += f"⚠️  WARNINGS: {example['warnings']}\n\n"

        prompt += "FORECAST:\n"

        forecast = example.get('forecast', {})
        for period, text in forecast.items():
            prompt += f"{period}: {text}\n"

        prompt += "\nACTUAL WIND CONDITIONS:\n"

        actual = example.get('actual', {})
        for day in ['day_0', 'day_1', 'day_2']:
            if day in actual and 'hourly' in actual[day]:
                date = actual[day].get('date', 'Unknown')
                prompt += f"{day} ({date}):\n"

                hourly_data = actual[day]['hourly']
                for hour_data in hourly_data:
                    hour = hour_data.get('hour', '')
                    wspd = hour_data.get('wspd_avg_kt', 0)
                    gst = hour_data.get('gst_max_kt', 0)
                    prompt += f"  {hour}: WSPD {wspd:.1f}kt, GST {gst:.1f}kt\n"
                prompt += "\n"

        prompt += "\n"

    # Add the forecast to predict
    prompt += "=== FORECAST TO PREDICT ===\n"
    prompt += f"DATE: {test_date_str}\n"
    prompt += f"ISSUED: {forecast_info['issued']} ({forecast_info['issue_time']})\n\n"

    # Include warnings if present
    if forecast_info.get('warnings'):
        prompt += f"⚠️  WARNINGS: {forecast_info['warnings']}\n\n"

    prompt += "FORECAST TEXT:\n"
    for key in ['D0_DAY', 'D0_NIGHT', 'D1_DAY', 'D1_NIGHT']:
        if key in forecast_info:
            prompt += f"{key}: {forecast_info[key]}\n"
    prompt += "\n"

    prompt += f"Based on the patterns from all {len(examples)} examples above, predict the hourly wind conditions "
    prompt += f"for {test_date_str} from 10 AM to 6 PM PST (9 hourly predictions).\n\n"

    prompt += "Provide your prediction in this EXACT format:\n"
    prompt += f"day_0 ({test_date_str}):\n"
    prompt += "  10:00-11:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  11:00-12:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  12:00-13:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  13:00-14:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  14:00-15:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  15:00-16:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  16:00-17:00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  17:00-18:00: WSPD X.Xkt, GST Y.Ykt\n\n"

    prompt += "Analyze the forecast text carefully, paying special attention to:\n"
    prompt += "- Wind speed ranges (e.g., '5 to 10 kt', '10 to 15 kt')\n"
    prompt += "- Timing cues (e.g., 'this morning', 'this afternoon', 'increasing in the afternoon')\n"
    prompt += "- Any warnings or advisories and their significance\n"
    prompt += "- Similar patterns in the examples above"

    return prompt


def run_forecast_test(
    test_date_str: str,
    anthropic_api_key: Optional[str] = None,
    save_prompt: bool = True,
    call_llm: bool = False,
    verbose: bool = True
) -> Optional[Dict]:
    """
    Run the complete forecast test for a 2025 date.

    Args:
        test_date_str: Date in YYYY-MM-DD format (must be in 2025)
        anthropic_api_key: Optional Anthropic API key (required if call_llm=True)
        save_prompt: Whether to save the prompt to a file
        call_llm: Whether to actually call the LLM API (requires API key)
        verbose: Whether to print detailed progress

    Returns:
        Dictionary with test results, or None if test failed
    """
    if verbose:
        print("🧪 2025 WIND FORECAST TEST")
        print("=" * 70)
        print(f"Test Date: {test_date_str}")
        print()

    # Validate date is in 2025
    try:
        dt = datetime.strptime(test_date_str, '%Y-%m-%d')
        if dt.year != 2025:
            print(f"❌ Error: Date must be in 2025, got {dt.year}")
            return None
    except ValueError as e:
        print(f"❌ Error: Invalid date format. Use YYYY-MM-DD. {e}")
        return None

    # Define file paths
    forecast_file = DATA_DIR / 'cleaned' / 'inner_waters_forecasts_relative_periods.txt'
    examples_dir = DATA_DIR / 'training' / 'few_shot_examples_json'
    wind_file = DATA_DIR / 'cleaned' / 'wind_2025_processed.txt'

    # Verify files exist
    if not forecast_file.exists():
        print(f"❌ Forecast file not found: {forecast_file}")
        return None
    if not wind_file.exists():
        print(f"❌ Wind data file not found: {wind_file}")
        return None
    if not examples_dir.exists():
        print(f"❌ Examples directory not found: {examples_dir}")
        return None

    # Step 1: Find forecast for the test date
    forecast_info = find_forecast_for_date(test_date_str, forecast_file)
    if not forecast_info:
        return None
    if verbose:
        print()

    # Step 2: Get appropriate examples file
    examples_file = get_examples_file_for_date(test_date_str, examples_dir)
    if not examples_file:
        return None

    # Step 3: Load ALL examples
    examples = load_all_examples(examples_file)
    if verbose:
        print()

    # Step 4: Load processed wind data
    actual_conditions = load_processed_wind_data(test_date_str, wind_file)
    if verbose:
        print()

    # Step 5: Create comprehensive prompt
    prompt = create_comprehensive_prompt(examples, forecast_info, test_date_str)

    # Save prompt if requested
    prompt_file = None
    if save_prompt:
        output_dir = DATA_DIR / 'testing' / 'prompts'
        output_dir.mkdir(parents=True, exist_ok=True)
        prompt_file = output_dir / f"forecast_test_{test_date_str.replace('-', '')}.txt"
        with open(prompt_file, 'w') as f:
            f.write(prompt)
        if verbose:
            print(f"📝 Prompt saved to: {prompt_file}")
            print()

    # Step 6: Call LLM if requested
    llm_response = None
    if call_llm:
        if not anthropic_api_key:
            anthropic_api_key = os.environ.get('ANTHROPIC_API_KEY')

        if not anthropic_api_key:
            print("⚠️  Warning: ANTHROPIC_API_KEY not provided and not found in environment")
            print("   Skipping LLM call. Set --anthropic-api-key or ANTHROPIC_API_KEY env var")
        else:
            if verbose:
                print("🤖 Calling Anthropic API...")

            try:
                import anthropic

                # Load model config
                config_file = CONFIG_DIR / 'model_config.json'
                if config_file.exists():
                    with open(config_file, 'r') as f:
                        model_config = json.load(f)
                else:
                    model_config = {
                        'model': 'claude-sonnet-4-20250514',
                        'temperature': 1.0,
                        'max_tokens': {'forecast': 2500}
                    }

                client = anthropic.Anthropic(api_key=anthropic_api_key)

                response = client.messages.create(
                    model=model_config['model'],
                    max_tokens=model_config['max_tokens']['forecast'],
                    temperature=model_config.get('temperature', 1.0),
                    messages=[{
                        'role': 'user',
                        'content': prompt
                    }]
                )

                llm_response = response.content[0].text

                if verbose:
                    print(f"  ✓ Received response ({len(llm_response)} characters)")
                    print()

                # Save LLM response
                if save_prompt and prompt_file:
                    response_file = prompt_file.parent / f"response_{test_date_str.replace('-', '')}.txt"
                    with open(response_file, 'w') as f:
                        f.write(llm_response)
                    if verbose:
                        print(f"💬 LLM response saved to: {response_file}")
                        print()

            except ImportError:
                print("❌ Error: anthropic package not installed. Install with: pip install anthropic")
            except Exception as e:
                print(f"❌ Error calling Anthropic API: {e}")

    # Display results
    if verbose:
        print("🎯 TEST RESULTS")
        print("=" * 70)

        if actual_conditions:
            print(f"\nACTUAL WIND CONDITIONS ({test_date_str}, 10 AM - 6 PM):")
            for data in actual_conditions:
                hour = data['hour']
                wspd = data['wspd_avg_kt']
                gst = data['gst_max_kt']
                print(f"  {hour:02d}:00-{hour+1:02d}:00: WSPD {wspd:.1f}kt, GST {gst:.1f}kt")
        else:
            print(f"\n⚠️  No actual wind data available for {test_date_str}")

        print(f"\nFORECAST USED:")
        print(f"  Issued: {forecast_info['issued']} ({forecast_info['issue_time']})")
        if forecast_info.get('warnings'):
            print(f"  ⚠️  Warnings: {forecast_info['warnings']}")
        print(f"  D0_DAY: {forecast_info['D0_DAY']}")

        print(f"\nTRAINING DATA:")
        print(f"  Examples used: {len(examples)} (from {examples_file.name})")
        print(f"  Forecast source: {forecast_file.name}")
        print(f"  Wind data source: {wind_file.name}")

    return {
        'test_date': test_date_str,
        'actual_conditions': actual_conditions,
        'forecast_info': forecast_info,
        'examples_count': len(examples),
        'examples_file': str(examples_file),
        'prompt_file': str(prompt_file) if prompt_file else None,
        'prompt': prompt,
        'llm_response': llm_response
    }


def main():
    """Main function for command-line usage."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Test wind forecast for any 2025 date',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 test_2025_forecast.py 2025-07-15
  python3 test_2025_forecast.py 2025-07-15 --call-llm --anthropic-api-key sk-ant-...
  python3 test_2025_forecast.py 2025-07-15 --call-llm  # Uses ANTHROPIC_API_KEY env var
        """
    )

    parser.add_argument('test_date', help='Test date in YYYY-MM-DD format (must be in 2025)')
    parser.add_argument('--anthropic-api-key', help='Anthropic API key (or set ANTHROPIC_API_KEY env var)')
    parser.add_argument('--call-llm', action='store_true', help='Actually call the LLM API')
    parser.add_argument('--no-save-prompt', action='store_true', help='Do not save prompt to file')
    parser.add_argument('--verbose', action='store_true', default=True, help='Print detailed progress')

    args = parser.parse_args()

    result = run_forecast_test(
        args.test_date,
        anthropic_api_key=args.anthropic_api_key,
        save_prompt=not args.no_save_prompt,
        call_llm=args.call_llm,
        verbose=args.verbose
    )

    if result:
        print(f"\n✅ Test completed successfully!")
        print(f"📊 Used {result['examples_count']} training examples")
        if result['prompt_file']:
            print(f"📝 Prompt saved: {result['prompt_file']}")
        if result['llm_response']:
            print(f"💬 LLM response received and saved")
    else:
        print("\n❌ Test failed - check error messages above")
        sys.exit(1)


if __name__ == "__main__":
    main()
