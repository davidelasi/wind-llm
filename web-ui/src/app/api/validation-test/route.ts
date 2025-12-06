import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Validation Test API - Recreates the 2023-07-15 validated prediction test
 *
 * This endpoint runs the same test that was validated with Python scripts:
 * - Test Date: 2023-07-15
 * - Validated Results: 1.0kt WSPD error, 1.4kt GST error
 * - Uses: jul_fc2_examples.json and 2023 forecast data
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

      // Check if this is 2023-07-15
      if (datetime.includes('2023-07-15')) {
        try {
          const hour = parseInt(datetime.split('T')[1].split(':')[0]);
          const wspd = parseFloat(parts[2]);
          const gst = parseFloat(parts[3]);

          if (hour >= 10 && hour <= 18) { // 10 AM to 6 PM
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
    // Try parent directory
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
    console.log('[VALIDATION-TEST] Starting validation test for 2023-07-15...');

    // Load actual wind data
    const actualData = await loadActualWindData();
    if (actualData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not load actual wind data for 2023-07-15'
      });
    }

    console.log(`[VALIDATION-TEST] Loaded ${actualData.length} hours of actual data`);

    // Load training examples
    const examples = await loadTrainingExamples();
    if (examples.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not load training examples'
      });
    }

    console.log(`[VALIDATION-TEST] Loaded ${examples.length} training examples`);

    // Create prompt
    const prompt = createPredictionPrompt(examples);

    // Call LLM
    console.log('[VALIDATION-TEST] Calling Claude API...');
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[VALIDATION-TEST] Received response from Claude');

    // Parse LLM response
    let predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }> = [];
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        predictions = parsed.predictions || [];
      }
    } catch (e) {
      console.error('[VALIDATION-TEST] Error parsing LLM response:', e);
    }

    // Calculate errors
    const errors: Array<{
      hour: number;
      actual_wspd: number;
      predicted_wspd: number;
      wspd_error: number;
      actual_gst: number;
      predicted_gst: number;
      gst_error: number;
    }> = [];

    actualData.forEach(actual => {
      const predicted = predictions.find(p => p.hour === actual.hour);
      if (predicted) {
        errors.push({
          hour: actual.hour,
          actual_wspd: actual.wspd,
          predicted_wspd: predicted.wspd_kt,
          wspd_error: Math.abs(actual.wspd - predicted.wspd_kt),
          actual_gst: actual.gst,
          predicted_gst: predicted.gst_kt,
          gst_error: Math.abs(actual.gst - predicted.gst_kt)
        });
      }
    });

    const avgWspdError = errors.reduce((sum, e) => sum + e.wspd_error, 0) / errors.length;
    const avgGstError = errors.reduce((sum, e) => sum + e.gst_error, 0) / errors.length;

    console.log(`[VALIDATION-TEST] Avg WSPD error: ${avgWspdError.toFixed(1)}kt, Avg GST error: ${avgGstError.toFixed(1)}kt`);

    return NextResponse.json({
      success: true,
      data: {
        testDate: '2023-07-15',
        forecast: 'Winds variable 10 kt or less becoming SW 10 kt in the afternoon.',
        actualData,
        predictions,
        errors,
        summary: {
          avgWspdError: avgWspdError.toFixed(1),
          avgGstError: avgGstError.toFixed(1),
          validatedWspdError: '1.0', // From original test
          validatedGstError: '1.4',  // From original test
          examplesUsed: examples.length,
          hoursCompared: errors.length
        }
      }
    });

  } catch (error) {
    console.error('[VALIDATION-TEST] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
