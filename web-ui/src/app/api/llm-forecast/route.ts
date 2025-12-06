import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';

// Load model configuration
const MODEL_CONFIG_PATH = path.join(process.cwd(), '..', 'config', 'model_config.json');
let MODEL_CONFIG: any = null;

async function loadModelConfig() {
  if (!MODEL_CONFIG) {
    const content = await fs.readFile(MODEL_CONFIG_PATH, 'utf-8');
    MODEL_CONFIG = JSON.parse(content);
  }
  return MODEL_CONFIG;
}

// Types
interface ForecastPrediction {
  time: string;
  windSpeed: number;
  gustSpeed: number;
  windDirection: number;
  windDirectionText: string;
  isEmpty: boolean;
}

interface CachedForecast {
  predictions: ForecastPrediction[][];
  nwsForecastText: string;
  nwsForecastTime: string;
  generatedAt: string;
  expiresAt: string;
}

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

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cache for storing the latest forecast
let forecastCache: CachedForecast | null = null;

// NWS API configuration
const NWS_COASTAL_FORECAST_URL = 'https://api.weather.gov/products/types/CWF/locations/LOX';

async function fetchLatestNWSForecast(): Promise<{ text: string; issuedTime: string } | null> {
  try {
    console.log('Fetching latest NWS coastal forecast...');
    const response = await fetch(NWS_COASTAL_FORECAST_URL);

    if (!response.ok) {
      throw new Error(`NWS API responded with ${response.status}`);
    }

    const data = await response.json();

    if (!data['@graph'] || data['@graph'].length === 0) {
      throw new Error('No forecasts available from NWS');
    }

    // Get the most recent forecast
    const latestForecast = data['@graph'][0];

    // Fetch the actual forecast text
    const forecastResponse = await fetch(latestForecast['@id']);
    if (!forecastResponse.ok) {
      throw new Error(`Failed to fetch forecast text: ${forecastResponse.status}`);
    }

    const forecastText = await forecastResponse.text();

    return {
      text: forecastText,
      issuedTime: latestForecast.issuanceTime
    };
  } catch (error) {
    console.error('Error fetching NWS forecast:', error);
    return null;
  }
}

function extractInnerWatersForecast(forecastText: string): string | null {
  try {
    // Look for inner waters section in the forecast
    const innerWatersRegex = /INNER\s+WATERS[\s\S]*?(?=\$\$)/i;
    const match = forecastText.match(innerWatersRegex);

    if (match) {
      return match[0].trim();
    }

    // Fallback: look for any section that might contain relevant forecast
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
    // Split by lines starting with a period followed by day name
    const lines = forecastText.split('\n');
    let currentDay = 0;
    let lastDayName = '';
    let currentPeriod = '';
    let currentText = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if line starts with a period and a day name (full or abbreviated)
      const periodMatch = trimmed.match(/^\.?(TODAY|TONIGHT|MON(?:DAY)?|TUE(?:SDAY)?|WED(?:NESDAY)?|THU(?:RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?|SUN(?:DAY)?)(\s+NIGHT)?\s*\.{3}(.*)$/i);

      if (periodMatch) {
        // Save previous period if exists
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

        // Determine which day this is
        if (dayName === 'TODAY') {
          currentDay = 0;
          lastDayName = dayName;
        } else if (dayName === 'TONIGHT') {
          currentDay = 0;
        } else {
          // For named days (SATURDAY, SUNDAY, etc.)
          if (dayName !== lastDayName && !isNight) {
            currentDay++;
            lastDayName = dayName;
          }
        }

        currentPeriod = isNight ? `${dayName} NIGHT` : dayName;
        currentText = restOfLine;
      } else if (currentPeriod && trimmed && !trimmed.startsWith('$$')) {
        // Continue accumulating text for current period
        currentText += ' ' + trimmed;
      }
    }

    // Save last period
    if (currentPeriod) {
      forecasts.push({
        day: currentDay,
        period: currentPeriod,
        text: currentText.trim()
      });
    }

    console.log(`[LLM-FORECAST] Parsed ${forecasts.length} periods:`, forecasts.map(f => `Day ${f.day}: ${f.period}`).join(', '));
  } catch (error) {
    console.error('[LLM-FORECAST] Error in parseMultiDayForecast:', error);
  }

  return forecasts;
}

function extractWarnings(forecastText: string): string[] {
  const warnings: string[] = [];

  // Look for common warning patterns
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

  if (dayForecasts.length === 0) {
    return '';
  }

  return dayForecasts.map(f => `${f.period}: ${f.text}`).join('\n');
}

// JSON format support functions - Load training examples from JSON files
async function loadTrainingExamples(): Promise<TrainingExample[]> {
  try {
    // Determine which training file to use based on current month in Pacific timezone
    const currentDate = new Date();
    const month = currentDate.toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'America/Los_Angeles'
    }).toLowerCase();

    // Get current hour in Pacific timezone
    const pacificHour = parseInt(currentDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Los_Angeles'
    }).split(':')[0]);

    // Determine forecast number based on Pacific time
    let forecastNumber = 1; // Default to morning forecast
    if (pacificHour >= 6 && pacificHour < 14) forecastNumber = 1; // Morning
    else if (pacificHour >= 14 && pacificHour < 20) forecastNumber = 2; // Afternoon
    else forecastNumber = 3; // Evening/night

    console.log(`[LLM-FORECAST] Loading JSON format examples for ${month}_fc${forecastNumber}`);

    // Use JSON format from web-ui data directory
    const jsonDirectory = path.join(
      process.cwd(),
      'data',
      'training',
      'few_shot_examples'
    );

    let jsonPath = path.join(jsonDirectory, `${month}_fc${forecastNumber}_examples.json`);

    // Check if file exists, if not try alternative paths
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

    console.log(`[LLM-FORECAST] Loading JSON examples from: ${jsonPath}`);
    const fileContent = await fs.readFile(jsonPath, 'utf-8');
    const examples: TrainingExample[] = JSON.parse(fileContent);

    console.log(`[LLM-FORECAST] Loaded ${examples.length} JSON training examples`);
    return examples;
  } catch (error) {
    console.error('Error loading JSON training examples:', error);
    throw error;
  }
}



NOW PREDICT based on the following NWS forecast:

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure:
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

CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no narrative text
========================================`;

NOW PREDICT based on the following NWS forecast:

NOW PREDICT based on the following NWS forecast:

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure:
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

CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no narrative text
========================================`;

NOW PREDICT based on the following NWS forecast:

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
CRITICAL: Return your prediction in JSON format (NOT TOON format).
Return predictions for ALL 5 days in this EXACT JSON structure:
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

CRITICAL REMINDER:
- Training examples above were in TOON format (pipe-separated)
- Your OUTPUT must be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no TOON format
========================================`;

  return systemPrompt + currentForecastPrompt;
}
  return systemPrompt + examplesText + currentForecastPrompt;
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
    // Skip examples without proper structure
    if (!example.forecast || !example.actual || !example.actual.day_0) {
      console.log(`[LLM-FORECAST] Skipping example ${index + 1}: Missing forecast/actual data structure`);
      return;
    }

    examplesText += `=== EXAMPLE ${index + 1} ===\n`;
    examplesText += `FORECAST:\n`;

    // Include ALL forecast periods (day_0_night through day_4_day)
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

    // Include multi-day actual data (day_0, day_1, day_2)
    ['day_0', 'day_1', 'day_2'].forEach(dayKey => {
      const dayData = (example.actual as any)[dayKey];
      if (dayData && dayData.hourly && Array.isArray(dayData.hourly)) {
        const date = dayData.date || 'Unknown';
        examplesText += `${dayKey} (${date}):\n`;

        dayData.hourly.forEach((hourlyData: any) => {
          if (!hourlyData || typeof hourlyData !== 'object') return;

          // Parse the hour range (e.g., "10:00-11:00" -> "10 AM")
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
NOW PREDICT based on the following NWS forecast:

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure:
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

CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no narrative text
========================================`;

  return systemPrompt + examplesText + currentForecastPrompt;
}
========================================
NOW PREDICT based on the following NWS forecast:
========================================

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
========================================
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure:
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

========================================
CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no narrative text
========================================`;

NOW PREDICT based on the following NWS forecast:

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
CRITICAL: Return your prediction in JSON format (NOT TOON format).
Return predictions for ALL 5 days in this EXACT JSON structure:
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

CRITICAL REMINDER:
- Training examples above were in TOON format (pipe-separated)
- Your OUTPUT must be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no TOON format
========================================`;

  return systemPrompt + currentForecastPrompt;
}
  return systemPrompt + examplesText + currentForecastPrompt;
}
========================================
NOW PREDICT based on the following NWS forecast:
========================================

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add forecast for each day
  currentForecastPrompt += `FORECAST:\n`;
  dayForecasts.forEach((forecast, index) => {
    if (forecast) {
      currentForecastPrompt += `Day ${index}:\n${forecast}\n\n`;
    }
  });

  currentForecastPrompt += `
========================================
CRITICAL: Return your prediction in JSON format (NOT TOON format).
Return predictions for ALL 5 days in this EXACT JSON structure:
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

========================================
CRITICAL REMINDER:
- Training examples above were in TOON format (pipe-separated)
- Your OUTPUT must be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no TOON format
========================================`;

  return systemPrompt + currentForecastPrompt;
}

function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

async function generateForecastWithLLM(forecastText: string, format: string = 'json'): Promise<ForecastPrediction[][] | null> {
  try {
    console.log('[LLM-FORECAST] Parsing multi-day NWS forecast...');
    console.log(`[LLM-FORECAST] Raw forecast text: ${forecastText.substring(0, 500)}`);
    const parsedForecasts = parseMultiDayForecast(forecastText);
    console.log(`[LLM-FORECAST] Parsed ${parsedForecasts.length} forecast periods`);

    // Extract warnings
    const warnings = extractWarnings(forecastText);
    if (warnings.length > 0) {
      console.log(`[LLM-FORECAST] Found warnings: ${warnings.join(', ')}`);
    }

    // Combine forecasts for each day (0-4)
    const dayForecasts: string[] = [];
    for (let day = 0; day < 5; day++) {
      const combinedForecast = combineDayForecasts(parsedForecasts, day);
      dayForecasts.push(combinedForecast);
      if (combinedForecast) {
        console.log(`[LLM-FORECAST] Day ${day} forecast: ${combinedForecast.substring(0, 80)}...`);
      } else {
        console.log(`[LLM-FORECAST] Day ${day} forecast: (empty)`);
      }
    }

    console.log(`[LLM-FORECAST] Loading training examples...`);
    // Load JSON format examples (default)
    const examples = await loadTrainingExamples();
    console.log(`[LLM-FORECAST] Loaded ${examples.length} JSON training examples`);

    if (examples.length === 0) {
      throw new Error('No JSON training examples loaded - check file paths');
    }

    console.log('[LLM-FORECAST] Creating few-shot prompt with JSON format examples...');
    const prompt = createFewShotPrompt(dayForecasts, warnings, examples);
    console.log(`[LLM-FORECAST] JSON prompt created, length: ${prompt.length} characters`);

    console.log('[LLM-FORECAST] Calling Claude API for 5-day forecast prediction...');
    const modelConfig = await loadModelConfig();
    let response;
    try {
      response = await anthropic.messages.create({
        model: modelConfig.model,
        max_tokens: modelConfig.max_tokens.forecast,
        temperature: modelConfig.temperature,
        top_p: modelConfig.top_p,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      console.log('[LLM-FORECAST] Claude API call successful');
    } catch (apiError) {
      logError('Claude API call failed', apiError, {
        promptLength: prompt.length,
        apiKey: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'
      });
      throw apiError;
    }

    if (!response.content[0] || response.content[0].type !== 'text') {
      const errorMsg = 'Invalid response from Claude';
      logError(errorMsg, { response: response });
      throw new Error(errorMsg);
    }

    const responseText = response.content[0].text.trim();
    console.log('[LLM-FORECAST] Claude response received, parsing...');
    console.log(`[LLM-FORECAST] Response length: ${responseText.length} characters`);
    console.log(`[LLM-FORECAST] Response preview (first 500 chars): ${responseText.substring(0, 500)}`);

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[LLM-FORECAST ERROR] No JSON found in Claude response!');
      console.error(`[LLM-FORECAST ERROR] Full response: ${responseText.substring(0, 2000)}`);
      throw new Error('No JSON found in Claude response');
    }

    const prediction = JSON.parse(jsonMatch[0]);

    // Convert to our format for all 5 days
    const allDays: ForecastPrediction[][] = [];

    for (let day = 0; day < 5; day++) {
      const dayKey = `day_${day}`;
      const dayPredictions = prediction[dayKey];

      if (!dayPredictions || !Array.isArray(dayPredictions)) {
        console.warn(`[LLM-FORECAST] Missing predictions for ${dayKey}, using empty array`);
        allDays.push([]);
        continue;
      }

      const formattedPredictions: ForecastPrediction[] = dayPredictions
        .filter((p: any) => p && typeof p === 'object' && p.wspd_kt !== undefined && p.gst_kt !== undefined && p.wdir_deg !== undefined)
        .map((p: any) => {
          const ampm = p.hour >= 12 ? 'PM' : 'AM';
          const displayHour = p.hour > 12 ? p.hour - 12 : p.hour === 0 ? 12 : p.hour;

          return {
            time: `${displayHour} ${ampm}`,
            windSpeed: parseFloat(p.wspd_kt.toFixed(1)),
            gustSpeed: parseFloat(p.gst_kt.toFixed(1)),
            windDirection: Math.round(p.wdir_deg),
            windDirectionText: getWindDirectionText(p.wdir_deg),
            isEmpty: false
          };
        });

      allDays.push(formattedPredictions);
      console.log(`[LLM-FORECAST] Day ${day}: ${formattedPredictions.length} hourly predictions`);
    }

    console.log('[LLM-FORECAST] Successfully generated 5-day forecast');
    return allDays;

  } catch (error) {
    logError('Error generating forecast with LLM', error, {
      forecastTextLength: forecastText?.length,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

async function sendErrorEmail(error: string, details: any) {
  // TODO: Implement email sending
  console.error('Would send email to davidelasiad@gmail.com:', {
    error,
    details,
    timestamp: new Date().toISOString()
  });
}

// Enhanced logging function
function logError(context: string, error: any, additionalData?: any) {
  // Handle different error types more robustly
  let errorMessage = 'Unknown error';
  let errorStack = undefined;
  let errorDetails = {};

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (typeof error === 'object' && error !== null) {
    // Try to extract meaningful info from objects
    errorMessage = error.message || error.error || JSON.stringify(error);
    errorStack = error.stack;
    errorDetails = error;
  } else {
    errorMessage = String(error);
  }

  console.error(`[LLM-FORECAST ERROR] ${context}:`, {
    error: errorMessage,
    stack: errorStack,
    errorDetails,
    additionalData,
    timestamp: new Date().toISOString()
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const forceUpdate = url.searchParams.get('force') === 'true';
    const useTestData = url.searchParams.get('test') === 'true';
    const format = url.searchParams.get('format') || 'json'; // 'json' or 'toon'

    console.log(`[LLM-FORECAST] Request format: ${format}`);

    // If test mode, return placeholder data
    if (useTestData) {
      return NextResponse.json({
        success: true,
        data: {
          predictions: [], // Return empty for test mode to use placeholder
          isLLMGenerated: false,
          lastUpdated: new Date().toISOString(),
          source: 'test_mode'
        }
      });
    }

    // Check if we have cached forecast that's still valid
    if (!forceUpdate && forecastCache && new Date() < new Date(forecastCache.expiresAt)) {
      console.log(`Returning cached forecast`);
      return NextResponse.json({
        success: true,
        data: {
          predictions: forecastCache.predictions,
          isLLMGenerated: true,
          lastUpdated: forecastCache.generatedAt,
          nwsForecastTime: forecastCache.nwsForecastTime,
          source: 'cache',
          format: 'JSON'
        }
      });
    }

    // Fetch latest NWS forecast
    console.log('[LLM-FORECAST] Starting forecast generation process...');
    console.log('[LLM-FORECAST] Fetching latest NWS forecast...');
    const nwsForecast = await fetchLatestNWSForecast();

    if (!nwsForecast) {
      logError('NWS forecast fetch failed', 'No forecast data returned');
      // If we have cached data, return it with a warning
      if (forecastCache) {
        return NextResponse.json({
          success: true,
          data: {
            predictions: forecastCache.predictions,
            isLLMGenerated: true,
            lastUpdated: forecastCache.generatedAt,
            nwsForecastTime: forecastCache.nwsForecastTime,
            source: 'cache_fallback',
            warning: 'Unable to fetch latest NWS forecast, using cached data'
          }
        });
      }

      await sendErrorEmail('Failed to fetch NWS forecast', { timestamp: new Date().toISOString() });
      return NextResponse.json({
        success: false,
        error: 'Unable to fetch NWS forecast and no cached data available'
      }, { status: 503 });
    }

    // Extract inner waters forecast
    console.log('[LLM-FORECAST] Extracting inner waters forecast from NWS data...');
    const innerWatersForecast = extractInnerWatersForecast(nwsForecast.text);

    if (!innerWatersForecast) {
      logError('Inner waters forecast extraction failed', { forecastLength: nwsForecast.text?.length });
      await sendErrorEmail('Failed to extract inner waters forecast', {
        forecastText: nwsForecast.text,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({
        success: false,
        error: 'Unable to extract inner waters forecast'
      }, { status: 500 });
    }

    // Check if this is a newer forecast than what we have cached
    if (forecastCache &&
        forecastCache.nwsForecastTime === nwsForecast.issuedTime &&
        !forceUpdate) {
      console.log(`NWS forecast unchanged, returning cached prediction`);
      return NextResponse.json({
        success: true,
        data: {
          predictions: forecastCache.predictions,
          isLLMGenerated: true,
          lastUpdated: forecastCache.generatedAt,
          nwsForecastTime: forecastCache.nwsForecastTime,
          source: 'cache_same_forecast',
          format: 'JSON'
        }
      });
    }

    // Generate new forecast with LLM
    console.log(`[LLM-FORECAST] Generating 5-day forecast with LLM (${format.toUpperCase()} format, multi-day parsing, warnings)...`);
    console.log('[LLM-FORECAST] Inner waters forecast text length:', innerWatersForecast.length);
    const predictions = await generateForecastWithLLM(innerWatersForecast, format);

    if (!predictions) {
      logError('LLM prediction generation failed', { forecastText: innerWatersForecast?.substring(0, 200) + '...' });
      // If we have cached data, return it with a warning
      if (forecastCache) {
        await sendErrorEmail('LLM forecast generation failed', {
          forecastText: innerWatersForecast,
          timestamp: new Date().toISOString()
        });

        return NextResponse.json({
          success: true,
          data: {
            predictions: forecastCache.predictions,
            isLLMGenerated: true,
            lastUpdated: forecastCache.generatedAt,
            nwsForecastTime: forecastCache.nwsForecastTime,
            source: 'cache_llm_failed',
            warning: 'LLM forecast generation failed, using cached data'
          }
        });
      }

      await sendErrorEmail('LLM forecast generation failed with no cache', {
        forecastText: innerWatersForecast,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: false,
        error: 'LLM forecast generation failed and no cached data available'
      }, { status: 500 });
    }

    // Cache the new forecast (expires in 3 hours)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now

    forecastCache = {
      predictions,
      nwsForecastText: innerWatersForecast,
      nwsForecastTime: nwsForecast.issuedTime,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    console.log(`Successfully generated and cached new forecast`);

    return NextResponse.json({
      success: true,
      data: {
        predictions,
        isLLMGenerated: true,
        lastUpdated: now.toISOString(),
        nwsForecastTime: nwsForecast.issuedTime,
        source: 'fresh_llm'
      }
    });

  } catch (error) {
    logError('Unexpected error in LLM forecast API', error);
    await sendErrorEmail('Unexpected error in LLM forecast API', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
