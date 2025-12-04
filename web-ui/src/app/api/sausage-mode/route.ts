import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';

// Re-use types and functions from llm-forecast
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

const NWS_COASTAL_FORECAST_URL = 'https://api.weather.gov/products/types/CWF/locations/LOX';

async function fetchLatestNWSForecast(): Promise<{ text: string; issuedTime: string; url: string } | null> {
  try {
    const response = await fetch(NWS_COASTAL_FORECAST_URL);
    if (!response.ok) throw new Error(`NWS API responded with ${response.status}`);

    const data = await response.json();
    if (!data['@graph'] || data['@graph'].length === 0) {
      throw new Error('No forecasts available from NWS');
    }

    const latestForecast = data['@graph'][0];
    const forecastResponse = await fetch(latestForecast['@id']);
    if (!forecastResponse.ok) {
      throw new Error(`Failed to fetch forecast text: ${forecastResponse.status}`);
    }

    const forecastText = await forecastResponse.text();

    return {
      text: forecastText,
      issuedTime: latestForecast.issuanceTime,
      url: latestForecast['@id']
    };
  } catch (error) {
    console.error('Error fetching NWS forecast:', error);
    return null;
  }
}

function extractInnerWatersForecast(forecastText: string): string | null {
  try {
    const innerWatersRegex = /INNER\s+WATERS[\s\S]*?(?=\$\$)/i;
    const match = forecastText.match(innerWatersRegex);
    if (match) return match[0].trim();

    const generalMatch = forecastText.match(/\.TODAY[\s\S]*?(?=\$\$)/i);
    return generalMatch ? generalMatch[0].trim() : null;
  } catch (error) {
    console.error('Error extracting inner waters forecast:', error);
    return null;
  }
}

interface DayForecast {
  day: number;
  period: string;
  text: string;
}

function parseMultiDayForecast(forecastText: string): DayForecast[] {
  const forecasts: DayForecast[] = [];

  try {
    const lines = forecastText.split('\n');
    let currentDay = 0;
    let lastDayName = '';
    let currentPeriod = '';
    let currentText = '';

    for (const line of lines) {
      const trimmed = line.trim();
      const periodMatch = trimmed.match(/^\.?(TODAY|TONIGHT|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)(\s+NIGHT)?\s*\.{3}(.*)$/i);

      if (periodMatch) {
        if (currentPeriod) {
          forecasts.push({
            day: currentDay,
            period: currentPeriod,
            text: currentText.trim()
          });
        }

        const dayName = periodMatch[1].toUpperCase();
        const isNight = !!periodMatch[2];
        const restOfLine = periodMatch[3] || '';

        if (dayName === 'TODAY') {
          currentDay = 0;
          lastDayName = dayName;
        } else if (dayName === 'TONIGHT') {
          currentDay = 0;
        } else {
          if (dayName !== lastDayName && !isNight) {
            currentDay++;
            lastDayName = dayName;
          }
        }

        currentPeriod = isNight ? `${dayName} NIGHT` : dayName;
        currentText = restOfLine;
      } else if (currentPeriod && trimmed && !trimmed.startsWith('$$')) {
        currentText += ' ' + trimmed;
      }
    }

    if (currentPeriod) {
      forecasts.push({
        day: currentDay,
        period: currentPeriod,
        text: currentText.trim()
      });
    }
  } catch (error) {
    console.error('[SAUSAGE-MODE] Error in parseMultiDayForecast:', error);
  }

  return forecasts;
}

function extractWarnings(forecastText: string): string[] {
  const warnings: string[] = [];
  const warningPatterns = [
    /Small Craft Advisory/gi,
    /Gale Warning/gi,
    /Storm Warning/gi,
    /Hurricane Warning/gi,
    /Tropical Storm Warning/gi,
    /Dense Fog Advisory/gi,
    /High Surf Advisory/gi,
    /Beach Hazards Statement/gi
  ];

  for (const pattern of warningPatterns) {
    const matches = forecastText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        if (!warnings.includes(match)) {
          warnings.push(match);
        }
      });
    }
  }

  return warnings;
}

function combineDayForecasts(forecasts: DayForecast[], day: number): string {
  const dayForecasts = forecasts.filter(f => f.day === day);
  if (dayForecasts.length === 0) return '';
  return dayForecasts.map(f => `${f.period}: ${f.text}`).join('\n');
}

// Load training examples from JSON format
async function loadTrainingExamples(): Promise<{ examples: TrainingExample[]; filePath: string; month: string; forecastNumber: number }> {
  const currentDate = new Date();
  const month = currentDate.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  const hour = currentDate.getHours();

  let forecastNumber = 1;
  if (hour >= 6 && hour < 14) forecastNumber = 1;
  else if (hour >= 14 && hour < 20) forecastNumber = 2;
  else forecastNumber = 3;

  const jsonDirectory = path.join(
    process.cwd(),
    'data',
    'training',
    'few_shot_examples'
  );

  let jsonPath = path.join(jsonDirectory, `${month}_fc${forecastNumber}_examples.json`);

  try {
    await fs.access(jsonPath);
  } catch {
    // Try parent directory (for development)
    const parentJsonPath = path.join(
      process.cwd(),
      '..',
      'data',
      'training',
      'archive',
      'few_shot_examples',
      `${month}_fc${forecastNumber}_examples.json`
    );
    jsonPath = parentJsonPath;
  }

  const fileContent = await fs.readFile(jsonPath, 'utf-8');
  const examples: TrainingExample[] = JSON.parse(fileContent);

  return {
    examples,
    filePath: jsonPath,
    month,
    forecastNumber
  };
}

function createFewShotPrompt(dayForecasts: string[], warnings: string[], examples: TrainingExample[]): string {
  const systemPrompt = `You are an expert wind forecasting system for ocean sports at AGXC1 station (Los Angeles area).

Your task is to predict hourly wind speed (WSPD), gust speed (GST), and wind direction for 10 AM - 6 PM PST for the next 5 days based on NWS coastal forecasts.

Key requirements:
- Predict for exactly 9 hours per day: 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 3 PM, 4 PM, 5 PM, 6 PM (PST)
- Return wind speeds in knots (kt) with 1 decimal place
- Return wind direction in degrees (0-360) as integer
- Consider that this time window is critical for sailing/surfing activities
- Account for typical thermal wind patterns in the LA area
- Pay attention to weather warnings and advisories

Here are ${examples.length} examples showing how NWS multi-day forecasts translate to actual conditions:

`;

  let examplesText = '';
  examples.slice(0, 15).forEach((example, index) => {
    if (!example.forecast || !example.actual || !example.actual.day_0) {
      return;
    }

    examplesText += `=== EXAMPLE ${index + 1} ===\n`;
    examplesText += `FORECAST:\n`;

    const forecastPeriods = [
      ['day_0_night', 'Day 0 Night'],
      ['day_1_day', 'Day 1 Day'],
      ['day_1_night', 'Day 1 Night'],
      ['day_2_day', 'Day 2 Day'],
      ['day_2_night', 'Day 2 Night'],
      ['day_3_day', 'Day 3 Day'],
      ['day_3_night', 'Day 3 Night'],
      ['day_4_day', 'Day 4 Day']
    ];

    forecastPeriods.forEach(([key, label]) => {
      const text = example.forecast[key as keyof typeof example.forecast];
      if (text) {
        examplesText += `${label}: ${text}\n`;
      }
    });

    examplesText += `\nACTUAL WIND CONDITIONS:\n`;

    ['day_0', 'day_1', 'day_2'].forEach(dayKey => {
      const dayData = (example.actual as any)[dayKey];
      if (dayData && dayData.hourly && Array.isArray(dayData.hourly)) {
        const date = dayData.date || 'Unknown';
        examplesText += `${dayKey} (${date}):\n`;

        dayData.hourly.forEach((hourlyData: any) => {
          if (!hourlyData || typeof hourlyData !== 'object') return;

          const hourRange = hourlyData.hour || '';
          const startHour = hourRange.split(':')[0];
          const hour = parseInt(startHour);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

          examplesText += `  ${displayHour} ${ampm}: WSPD ${hourlyData.wspd_avg_kt || 'N/A'}kt, GST ${hourlyData.gst_max_kt || 'N/A'}kt\n`;
        });
        examplesText += '\n';
      }
    });

    examplesText += '\n';
  });

  let currentForecastPrompt = `
Now predict the wind conditions for the next 5 days based on the following NWS forecast:

`;

  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `Return your prediction for ALL 5 days in this exact JSON format:
{
  "day_0": [
    {"hour": 10, "wspd_kt": 12.5, "gst_kt": 16.2, "wdir_deg": 225},
    {"hour": 11, "wspd_kt": 12.5, "gst_kt": 16.2, "wdir_deg": 225},
    {"hour": 12, "wspd_kt": 13.1, "gst_kt": 17.8, "wdir_deg": 230},
    {"hour": 13, "wspd_kt": 14.0, "gst_kt": 18.5, "wdir_deg": 235},
    {"hour": 14, "wspd_kt": 13.8, "gst_kt": 18.0, "wdir_deg": 240},
    {"hour": 15, "wspd_kt": 12.9, "gst_kt": 16.8, "wdir_deg": 242},
    {"hour": 16, "wspd_kt": 11.5, "gst_kt": 15.2, "wdir_deg": 245},
    {"hour": 17, "wspd_kt": 10.2, "gst_kt": 13.8, "wdir_deg": 248},
    {"hour": 18, "wspd_kt": 9.1, "gst_kt": 12.5, "wdir_deg": 250}
  ],
  "day_1": [
    ... (9 hours for day 1)
  ],
  "day_2": [
    ... (9 hours for day 2)
  ],
  "day_3": [
    ... (9 hours for day 3)
  ],
  "day_4": [
    ... (9 hours for day 4)
  ]
}

Respond with ONLY the JSON, no other text.`;

  return systemPrompt + examplesText + currentForecastPrompt;
}

export async function GET(request: NextRequest) {
  try {
    console.log('[SAUSAGE-MODE] Gathering diagnostic information...');

    // 1. Fetch NWS Forecast
    const nwsForecast = await fetchLatestNWSForecast();

    // 2. Extract Inner Waters Forecast
    const innerWatersForecast = nwsForecast ? extractInnerWatersForecast(nwsForecast.text) : null;

    // 3. Load Training Examples
    const trainingData = await loadTrainingExamples();

    // 4. Parse multi-day forecasts and extract warnings
    const parsedForecasts = innerWatersForecast ? parseMultiDayForecast(innerWatersForecast) : [];
    const warnings = innerWatersForecast ? extractWarnings(innerWatersForecast) : [];
    const dayForecasts: string[] = [];
    for (let day = 0; day < 5; day++) {
      const combinedForecast = combineDayForecasts(parsedForecasts, day);
      dayForecasts.push(combinedForecast);
    }

    // 5. Create the Prompt
    const prompt = innerWatersForecast ? createFewShotPrompt(dayForecasts, warnings, trainingData.examples) : null;

    // 6. Get current configuration
    const config = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      currentTime: new Date().toISOString(),
      timezone: PACIFIC_TIMEZONE,
      apiKeySet: !!process.env.ANTHROPIC_API_KEY,
    };

    // Return all diagnostic data
    return NextResponse.json({
      success: true,
      data: {
        // Step 1: NWS Data
        nwsData: {
          url: NWS_COASTAL_FORECAST_URL,
          fetchedAt: new Date().toISOString(),
          issuedTime: nwsForecast?.issuedTime || null,
          forecastUrl: nwsForecast?.url || null,
          rawForecast: nwsForecast?.text || null,
          rawForecastLength: nwsForecast?.text?.length || 0,
        },

        // Step 2: Extracted Forecast & Multi-Day Parsing
        extractedForecast: {
          innerWatersForecast,
          extractedLength: innerWatersForecast?.length || 0,
          extractionMethod: 'INNER WATERS regex',
          parsedPeriods: parsedForecasts.length,
          warnings: warnings,
          dayForecasts: dayForecasts.map((forecast, idx) => ({
            day: idx,
            text: forecast || '(empty)'
          }))
        },

        // Step 3: Training Data (Raw JSON)
        trainingData: {
          filePath: trainingData.filePath,
          month: trainingData.month,
          forecastNumber: trainingData.forecastNumber,
          totalExamples: trainingData.examples.length,
          examplesUsed: Math.min(15, trainingData.examples.length),
          format: 'JSON (multi-day)',
          // Show first 3 examples as raw JSON for inspection
          sampleExamples: trainingData.examples.slice(0, 3).map((example) => {
            // Transform the raw example into a format the UI expects
            return {
              forecastText: example.forecast?.day_0_day || 'N/A',
              actualWinds: example.actual?.day_0?.hourly?.map((h: any) => ({
                hour: h.hour,
                wspd: h.wspd_avg_kt,
                gst: h.gst_max_kt
              })) || []
            };
          }),
          allExamples: trainingData.examples
        },

        // Step 4: The Prompt
        prompt: {
          fullPrompt: prompt,
          promptLength: prompt?.length || 0,
          promptTokenEstimate: prompt ? Math.ceil(prompt.length / 4) : 0,
          requestedDays: 5,
          includesWarnings: warnings.length > 0,
          includesMultiDayContext: true
        },

        // Step 5: LLM Configuration
        llmConfig: config,

        // Step 6: Post-Processing Info
        postProcessing: {
          description: 'Phase 2 Complete: Real 5-day predictions from LLM (no artificial scaling)',
          scalingFormula: {
            day_0: 'Real LLM prediction',
            day_1: 'Real LLM prediction',
            day_2: 'Real LLM prediction',
            day_3: 'Real LLM prediction',
            day_4: 'Real LLM prediction'
          },
          directionShift: 'None - LLM predicts wind direction directly',
          codeLocation: 'web-ui/src/app/api/llm-forecast/route.ts',
          method: 'Multi-day NWS parsing → 5-day LLM request → 5 distinct predictions',
          multiDayParsing: 'Extracts TODAY, TONIGHT, SATURDAY, SATURDAY NIGHT, etc.',
          warningExtraction: 'Detects Small Craft Advisory, Gale Warning, etc.',
          llmRequest: 'Single prompt requesting all 5 days (day_0 through day_4)',
          noPreviousBehavior: 'Artificial scaling removed - each day is real prediction'
        }
      }
    });

  } catch (error) {
    console.error('[SAUSAGE-MODE] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
