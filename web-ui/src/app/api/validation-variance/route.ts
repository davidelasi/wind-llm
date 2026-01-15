import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';

// Load model configuration
const MODEL_CONFIG_PATH = path.join(process.cwd(), 'config', 'model_config.json');
let MODEL_CONFIG: any = null;

async function loadModelConfig() {
  if (!MODEL_CONFIG) {
    const content = await fs.readFile(MODEL_CONFIG_PATH, 'utf-8');
    MODEL_CONFIG = JSON.parse(content);
  }
  return MODEL_CONFIG;
}

/**
 * Validation Variance Test - Runs the same forecast N times to measure LLM variance
 *
 * This tests whether differences between production and validation are due to
 * natural LLM variance or actual code issues.
 */

interface TrainingExample {
  forecast: {
    day_0_day: string;
    day_0_night: string;
    day_1_day: string;
    day_1_night: string;
    day_2_day: string;
    day_2_night: string;
    day_3_day: string;
    day_4_day: string;
  };
  actual: {
    day_0: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
  };
}

interface PredictionRun {
  runNumber: number;
  predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }>;
  avgWspdError: number;
  avgGstError: number;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load actual wind data for 2023-07-15
async function loadActualWindData(): Promise<Array<{ hour: number; wspd: number; gst: number }>> {
  const dataPath = path.join(process.cwd(), '..', 'data', 'cleaned', 'wind_2023_processed.txt');

  try {
    const content = await fs.readFile(dataPath, 'utf-8');
    const lines = content.split('\n');

    const windData: Array<{ hour: number; wspd: number; gst: number }> = [];

    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const datetime = parts[0];

      if (datetime.includes('2023-07-15')) {
        try {
          const hour = parseInt(datetime.split('T')[1].split(':')[0]);
          const wspd = parseFloat(parts[2]);
          const gst = parseFloat(parts[3]);

          if (hour >= 10 && hour <= 18) {
            windData.push({ hour, wspd, gst });
          }
        } catch (e) {
          continue;
        }
      }
    }

    return windData.sort((a, b) => a.hour - b.hour);
  } catch (error) {
    console.error('Error loading actual wind data:', error);
    return [];
  }
}

// Load training examples
async function loadTrainingExamples(): Promise<TrainingExample[]> {
  const jsonPath = path.join(
    process.cwd(),
    'data',
    'training',
    'few_shot_examples',
    'jul_fc2_examples.json'
  );

  try {
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    const parentPath = path.join(
      process.cwd(),
      '..',
      'data',
      'training',
      'few_shot_examples',
      'jul_fc2_examples.json'
    );

    try {
      const content = await fs.readFile(parentPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Error loading training examples:', error);
      return [];
    }
  }
}

// Create prediction prompt
function createPredictionPrompt(examples: TrainingExample[]): string {
  let prompt = `You are an expert wind forecasting system for ocean sports at AGXC1 station (Los Angeles area).

Your task is to predict hourly wind speed (WSPD) and gust speed (GST) for 10 AM - 6 PM PST based on NWS coastal forecasts.

Here are ${examples.length} examples showing how NWS forecasts translate to actual conditions:

`;

  // Add examples
  examples.slice(0, 15).forEach((example, index) => {
    prompt += `=== EXAMPLE ${index + 1} ===\n`;
    prompt += `FORECAST:\n`;
    prompt += `Day 0 Day: ${example.forecast.day_0_day}\n`;

    if (example.actual?.day_0?.hourly) {
      prompt += `\nACTUAL WIND CONDITIONS:\n`;
      prompt += `day_0 (${example.actual.day_0.date}):\n`;

      example.actual.day_0.hourly.forEach((h: any) => {
        prompt += `  ${h.hour}: WSPD ${h.wspd_avg_kt}kt, GST ${h.gst_max_kt}kt\n`;
      });
    }

    prompt += '\n';
  });

  // Add the test forecast
  prompt += `=== FORECAST TO PREDICT ===
ISSUED: 2023-07-15 (Morning forecast)
D0_DAY: Winds variable 10 kt or less becoming SW 10 kt in the afternoon.

Based on the patterns from the examples above, predict the hourly wind conditions for 2023-07-15 (10 AM to 6 PM).

Return ONLY valid JSON in this exact format:
{
  "predictions": [
    {"hour": 10, "wspd_kt": 8.5, "gst_kt": 11.2},
    {"hour": 11, "wspd_kt": 8.5, "gst_kt": 11.2},
    {"hour": 12, "wspd_kt": 9.0, "gst_kt": 12.0},
    {"hour": 13, "wspd_kt": 9.5, "gst_kt": 12.5},
    {"hour": 14, "wspd_kt": 10.0, "gst_kt": 13.0},
    {"hour": 15, "wspd_kt": 10.0, "gst_kt": 13.0},
    {"hour": 16, "wspd_kt": 9.5, "gst_kt": 12.5},
    {"hour": 17, "wspd_kt": 9.0, "gst_kt": 12.0},
    {"hour": 18, "wspd_kt": 8.5, "gst_kt": 11.5}
  ]
}`;

  return prompt;
}

// Run a single prediction
async function runSinglePrediction(
  prompt: string,
  actualData: Array<{ hour: number; wspd: number; gst: number }>,
  runNumber: number
): Promise<PredictionRun> {
  console.log(`[VARIANCE-TEST] Running prediction ${runNumber}...`);

  const modelConfig = await loadModelConfig();
  const message = await anthropic.messages.create({
    model: modelConfig.model,
    max_tokens: modelConfig.max_tokens.validation,
    temperature: modelConfig.temperature,
    top_p: modelConfig.top_p,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Parse LLM response
  let predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }> = [];
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      predictions = parsed.predictions || [];
    }
  } catch (e) {
    console.error(`[VARIANCE-TEST] Error parsing run ${runNumber}:`, e);
  }

  // Calculate errors
  let wspdErrors: number[] = [];
  let gstErrors: number[] = [];

  actualData.forEach(actual => {
    const predicted = predictions.find(p => p.hour === actual.hour);
    if (predicted) {
      wspdErrors.push(Math.abs(actual.wspd - predicted.wspd_kt));
      gstErrors.push(Math.abs(actual.gst - predicted.gst_kt));
    }
  });

  const avgWspdError = wspdErrors.length > 0 ? wspdErrors.reduce((a, b) => a + b, 0) / wspdErrors.length : 0;
  const avgGstError = gstErrors.length > 0 ? gstErrors.reduce((a, b) => a + b, 0) / gstErrors.length : 0;

  return {
    runNumber,
    predictions,
    avgWspdError,
    avgGstError
  };
}

export async function GET(request: NextRequest) {
  // Disable validation endpoints in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_VALIDATION_ENDPOINTS) {
    return NextResponse.json({
      success: false,
      error: 'Validation endpoints are disabled in production',
      message: 'These endpoints require large historical data files not included in deployment'
    }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const numRuns = Math.min(parseInt(url.searchParams.get('runs') || '5'), 10); // Max 10 runs

    console.log(`[VARIANCE-TEST] Starting ${numRuns} prediction runs...`);

    // Load actual wind data
    const actualData = await loadActualWindData();
    if (actualData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not load actual wind data for 2023-07-15'
      });
    }

    // Load training examples
    const examples = await loadTrainingExamples();
    if (examples.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not load training examples'
      });
    }

    // Create prompt (same for all runs)
    const prompt = createPredictionPrompt(examples);

    // Run predictions sequentially
    const runs: PredictionRun[] = [];
    for (let i = 1; i <= numRuns; i++) {
      const run = await runSinglePrediction(prompt, actualData, i);
      runs.push(run);
    }

    // Calculate statistics
    const wspdErrors = runs.map(r => r.avgWspdError);
    const gstErrors = runs.map(r => r.avgGstError);

    const meanWspdError = wspdErrors.reduce((a, b) => a + b, 0) / wspdErrors.length;
    const meanGstError = gstErrors.reduce((a, b) => a + b, 0) / gstErrors.length;

    const stdDevWspd = Math.sqrt(
      wspdErrors.reduce((sum, x) => sum + Math.pow(x - meanWspdError, 2), 0) / wspdErrors.length
    );
    const stdDevGst = Math.sqrt(
      gstErrors.reduce((sum, x) => sum + Math.pow(x - meanGstError, 2), 0) / gstErrors.length
    );

    const minWspdError = Math.min(...wspdErrors);
    const maxWspdError = Math.max(...wspdErrors);
    const minGstError = Math.min(...gstErrors);
    const maxGstError = Math.max(...gstErrors);

    console.log(`[VARIANCE-TEST] Completed ${numRuns} runs`);
    console.log(`[VARIANCE-TEST] WSPD: ${meanWspdError.toFixed(2)}±${stdDevWspd.toFixed(2)}kt (range: ${minWspdError.toFixed(2)}-${maxWspdError.toFixed(2)})`);
    console.log(`[VARIANCE-TEST] GST: ${meanGstError.toFixed(2)}±${stdDevGst.toFixed(2)}kt (range: ${minGstError.toFixed(2)}-${maxGstError.toFixed(2)})`);

    return NextResponse.json({
      success: true,
      data: {
        testDate: '2023-07-15',
        numRuns,
        runs,
        statistics: {
          wspd: {
            mean: parseFloat(meanWspdError.toFixed(2)),
            stdDev: parseFloat(stdDevWspd.toFixed(2)),
            min: parseFloat(minWspdError.toFixed(2)),
            max: parseFloat(maxWspdError.toFixed(2)),
            validatedValue: 1.0
          },
          gst: {
            mean: parseFloat(meanGstError.toFixed(2)),
            stdDev: parseFloat(stdDevGst.toFixed(2)),
            min: parseFloat(minGstError.toFixed(2)),
            max: parseFloat(maxGstError.toFixed(2)),
            validatedValue: 1.4
          }
        },
        actualData
      }
    });

  } catch (error) {
    console.error('[VARIANCE-TEST] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
