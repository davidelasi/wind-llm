#!/usr/bin/env python3
"""
Variance Test for LLM Wind Prediction

Runs the same 2023-07-15 forecast multiple times to measure natural LLM variance.
Uses the validated Python testing approach (no production API calls).

Usage:
    python3 variance_test.py [num_runs] [temperature]

Example:
    python3 variance_test.py 5          # 5 runs with default temperature
    python3 variance_test.py 5 0.0      # 5 runs with temperature=0.0
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path
from anthropic import Anthropic

# Add parent directory to path to import from correct_prediction_test
sys.path.insert(0, str(Path(__file__).parent))

# Load model configuration
def load_model_config():
    """Load model configuration from config file"""
    config_path = Path(__file__).parent.parent / "config" / "model_config.json"
    with open(config_path, 'r') as f:
        return json.load(f)

MODEL_CONFIG = load_model_config()

def find_forecast_for_date(test_date_str, forecast_file):
    """Find the forecast for 2023-07-15"""
    with open(forecast_file, 'r') as f:
        lines = f.readlines()

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('Issued:'):
            try:
                issued_datetime = line.replace('Issued: ', '')
                dt = datetime.fromisoformat(issued_datetime.replace('Z', '+00:00'))

                if dt.date().strftime('%Y-%m-%d') == test_date_str:
                    j = i + 1
                    forecast_content = {}

                    while j < len(lines) and not lines[j].strip().startswith('$$'):
                        forecast_line = lines[j].strip()
                        if forecast_line:
                            if forecast_line.startswith('D0_DAY'):
                                forecast_content['D0_DAY'] = forecast_line
                            elif forecast_line.startswith('D0_NIGHT'):
                                forecast_content['D0_NIGHT'] = forecast_line
                        j += 1

                    if 'D0_DAY' in forecast_content:
                        hour = datetime.fromisoformat(issued_datetime.replace('Z', '+00:00')).hour
                        if 6 <= hour <= 12:
                            return {
                                'issued': issued_datetime,
                                'D0_DAY': forecast_content['D0_DAY'],
                                'D0_NIGHT': forecast_content.get('D0_NIGHT', '')
                            }
            except:
                pass
        i += 1
    return None


def load_all_examples(examples_file):
    """Load ALL examples from jul_fc2_examples.json"""
    with open(examples_file, 'r') as f:
        return json.load(f)


def load_processed_wind_data(test_date_str, wind_file):
    """Load actual wind data for 2023-07-15"""
    with open(wind_file, 'r') as f:
        lines = f.readlines()

    test_data = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        parts = line.split()
        if len(parts) < 4:
            continue

        try:
            datetime_pst = parts[0].strip()
            if test_date_str in datetime_pst:
                wdir = parts[1].strip()
                wspd = float(parts[2].strip()) if parts[2].strip() != 'null' else 0
                gst = float(parts[3].strip()) if parts[3].strip() != 'null' else 0

                dt = datetime.fromisoformat(datetime_pst.replace('-08:00', ''))
                hour = dt.hour

                test_data.append({
                    'datetime': datetime_pst,
                    'hour': hour,
                    'wspd_avg_kt': wspd,
                    'gst_max_kt': gst
                })
        except:
            continue

    return test_data


def create_comprehensive_prompt(examples, forecast_info, test_date_str):
    """Create the exact same prompt used in validation"""
    prompt = "You are a wind forecasting expert. Given NWS coastal water forecasts, predict hourly wind speeds (WSPD) and gusts (GST) in knots for the daytime hours.\n\n"
    prompt += f"Here are {len(examples)} examples showing how to interpret forecasts and actual outcomes:\n\n"

    for i, example in enumerate(examples, 1):
        prompt += f"=== EXAMPLE {i} ===\n"
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

    prompt += "=== FORECAST TO PREDICT ===\n"
    prompt += f"ISSUED: {forecast_info['issued']}\n"
    prompt += f"D0_DAY: {forecast_info['D0_DAY']}\n"
    if forecast_info['D0_NIGHT']:
        prompt += f"D0_NIGHT: {forecast_info['D0_NIGHT']}\n"
    prompt += "\n"

    prompt += f"Based on the patterns from all {len(examples)} examples above, predict the hourly wind conditions for {test_date_str}.\n\n"
    prompt += "Provide your prediction in this format:\n"
    prompt += f"day_0 ({test_date_str}):\n"
    prompt += "  HH:00-(HH+1):00: WSPD X.Xkt, GST Y.Ykt\n"
    prompt += "  (for each hour with available data)\n\n"
    prompt += "Analyze the D0_DAY forecast text carefully for wind speed ranges, timing cues, and pattern similarities to the examples."

    return prompt


def parse_llm_response(response_text):
    """Parse LLM response to extract predictions"""
    predictions = []

    lines = response_text.split('\n')
    for line in lines:
        line = line.strip()

        # Look for pattern like "10:00-11:00: WSPD 8.5kt, GST 11.2kt"
        if ':00-' in line and 'WSPD' in line and 'GST' in line:
            try:
                # Extract hour
                hour_part = line.split(':')[0].strip()
                hour = int(hour_part)

                # Extract WSPD
                wspd_start = line.index('WSPD') + 5
                wspd_end = line.index('kt', wspd_start)
                wspd = float(line[wspd_start:wspd_end].strip())

                # Extract GST
                gst_start = line.index('GST') + 4
                gst_end = line.index('kt', gst_start)
                gst = float(line[gst_start:gst_end].strip())

                predictions.append({
                    'hour': hour,
                    'wspd_kt': wspd,
                    'gst_kt': gst
                })
            except:
                continue

    return predictions


def run_single_prediction(client, prompt, actual_data, run_number, temperature=None, top_p=None):
    """Run a single prediction and calculate errors"""
    print(f"  Run {run_number}...", end='', flush=True)

    # Use config values if not specified
    temp = temperature if temperature is not None else MODEL_CONFIG['temperature']
    top_p_val = top_p if top_p is not None else MODEL_CONFIG['top_p']

    message = client.messages.create(
        model=MODEL_CONFIG['model'],
        max_tokens=MODEL_CONFIG['max_tokens']['validation'],
        temperature=temp,
        top_p=top_p_val,
        messages=[{
            "role": "user",
            "content": prompt
        }]
    )

    response_text = message.content[0].text
    predictions = parse_llm_response(response_text)

    # Calculate errors
    errors = []
    for actual in actual_data:
        pred = next((p for p in predictions if p['hour'] == actual['hour']), None)
        if pred:
            errors.append({
                'hour': actual['hour'],
                'wspd_error': abs(actual['wspd_avg_kt'] - pred['wspd_kt']),
                'gst_error': abs(actual['gst_max_kt'] - pred['gst_kt'])
            })

    avg_wspd_error = sum(e['wspd_error'] for e in errors) / len(errors) if errors else 0
    avg_gst_error = sum(e['gst_error'] for e in errors) / len(errors) if errors else 0

    print(f" WSPD: {avg_wspd_error:.2f}kt, GST: {avg_gst_error:.2f}kt")

    return {
        'run': run_number,
        'predictions': predictions,
        'avg_wspd_error': round(avg_wspd_error, 2),
        'avg_gst_error': round(avg_gst_error, 2),
        'errors': errors
    }


def main():
    num_runs = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    temperature = float(sys.argv[2]) if len(sys.argv) > 2 else MODEL_CONFIG['temperature']
    test_date = "2023-07-15"

    print(f"🧪 LLM VARIANCE TEST - Python Method")
    print("=" * 70)
    print(f"Test Date: {test_date}")
    print(f"Number of runs: {num_runs}")
    print(f"Temperature: {temperature}")
    print(f"Top-p: {MODEL_CONFIG['top_p']}")
    print(f"Model: {MODEL_CONFIG['model']}")
    print()

    # File paths - try both possible locations
    base_paths = [
        Path("/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm"),
        Path(__file__).parent.parent
    ]

    forecast_file = None
    examples_file = None
    wind_file = None

    for base in base_paths:
        ff = base / "data/cleaned/inner_waters_forecasts_relative_periods.txt"
        ef = base / "data/training/few_shot_examples/jul_fc2_examples.json"
        wf = base / "data/cleaned/wind_2023_processed.txt"

        if ff.exists() and ef.exists() and wf.exists():
            forecast_file = str(ff)
            examples_file = str(ef)
            wind_file = str(wf)
            break

    if not forecast_file:
        print("❌ Error: Could not find data files")
        print("Searched in:")
        for base in base_paths:
            print(f"  - {base}")
        sys.exit(1)

    # Load data
    print("Loading data...")
    forecast_info = find_forecast_for_date(test_date, forecast_file)
    examples = load_all_examples(examples_file)
    actual_data = load_processed_wind_data(test_date, wind_file)

    if not forecast_info or not examples or not actual_data:
        print("❌ Error loading data")
        sys.exit(1)

    print(f"  ✓ Loaded forecast, {len(examples)} examples, {len(actual_data)} hours of actual data")
    print()

    # Create prompt
    prompt = create_comprehensive_prompt(examples, forecast_info, test_date)

    # Initialize Anthropic client
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = Anthropic(api_key=api_key)

    # Run predictions
    print(f"Running {num_runs} predictions...")
    runs = []
    for i in range(1, num_runs + 1):
        run = run_single_prediction(client, prompt, actual_data, i, temperature=temperature)
        runs.append(run)

    print()

    # Calculate statistics
    wspd_errors = [r['avg_wspd_error'] for r in runs]
    gst_errors = [r['avg_gst_error'] for r in runs]

    mean_wspd = sum(wspd_errors) / len(wspd_errors)
    mean_gst = sum(gst_errors) / len(gst_errors)

    import math
    std_wspd = math.sqrt(sum((x - mean_wspd)**2 for x in wspd_errors) / len(wspd_errors))
    std_gst = math.sqrt(sum((x - mean_gst)**2 for x in gst_errors) / len(gst_errors))

    # Output results as JSON
    results = {
        'test_date': test_date,
        'num_runs': num_runs,
        'method': 'Python (validated approach)',
        'model_config': {
            'model': MODEL_CONFIG['model'],
            'temperature': temperature,
            'top_p': MODEL_CONFIG['top_p'],
            'max_tokens': MODEL_CONFIG['max_tokens']['validation']
        },
        'runs': runs,
        'actual_data': actual_data,
        'statistics': {
            'wspd': {
                'mean': round(mean_wspd, 2),
                'std_dev': round(std_wspd, 2),
                'min': round(min(wspd_errors), 2),
                'max': round(max(wspd_errors), 2),
                'validated_value': 1.0
            },
            'gst': {
                'mean': round(mean_gst, 2),
                'std_dev': round(std_gst, 2),
                'min': round(min(gst_errors), 2),
                'max': round(max(gst_errors), 2),
                'validated_value': 1.4
            }
        }
    }

    # Print summary
    print("📊 VARIANCE TEST RESULTS")
    print("=" * 70)
    print(f"WSPD Error: {mean_wspd:.2f} ± {std_wspd:.2f}kt (range: {min(wspd_errors):.2f}-{max(wspd_errors):.2f}kt)")
    print(f"GST Error:  {mean_gst:.2f} ± {std_gst:.2f}kt (range: {min(gst_errors):.2f}-{max(gst_errors):.2f}kt)")
    print()
    print(f"Validated values: WSPD=1.0kt, GST=1.4kt")
    print()

    # Save results with temperature-specific filename to public folder for web access
    temp_str = str(temperature).replace('.', '_')
    output_file = Path(__file__).parent.parent / f"web-ui/public/data/variance_test_results_temp_{temp_str}.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"✅ Results saved to: {output_file}")
    print()
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
