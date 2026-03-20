import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';

// Configure runtime for longer timeouts (LLM calls can take 10-30 seconds)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max for LLM API calls
import {
  extractInnerWatersForecast,
  extractWarnings,
  convertPeriodsToRelative,
  formatForecastForLLM,
  generateDayMappingInstruction,
  formatForecastWithoutDayConversion
} from '@/lib/forecast-utils';
import {
  storeForecast,
  getMostRecentForecast,
  getMostRecentForecastBefore,
  getDailyLLMCallCount,
  type ForecastStorageData
} from '@/lib/services/forecast-storage';
import { getPacificISOString } from '@/lib/timezone-utils';

// Load model configuration
const MODEL_CONFIG_PATH = path.join(process.cwd(), 'config', 'model_config.json');
const PROMPT_CONFIG_PATH = path.join(process.cwd(), 'config', 'prompt_config.json');
let MODEL_CONFIG: any = null;
let PROMPT_CONFIG: any = null;

const FORECAST_HOURS = [10, 11, 12, 13, 14, 15, 16, 17];
const FORECAST_TIME_LABELS = ['11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];

async function loadModelConfig() {
  if (!MODEL_CONFIG) {
    const content = await fs.readFile(MODEL_CONFIG_PATH, 'utf-8');
    MODEL_CONFIG = JSON.parse(content);
  }
  return MODEL_CONFIG;
}

async function loadPromptConfig() {
  if (!PROMPT_CONFIG) {
    const content = await fs.readFile(PROMPT_CONFIG_PATH, 'utf-8');
    PROMPT_CONFIG = JSON.parse(content);
  }
  return PROMPT_CONFIG;
}

/**
 * Determine current month and forecast number
 * Used for training example selection and storage metadata
 */
/**
 * Determine forecast metadata based on the NWS issuance time (Pacific).
 * Buckets:
 *  - fc1: 00:00–05:59
 *  - fc2: 06:00–11:59
 *  - fc3: 12:00–17:59
 *  - fc4: 18:00–23:59
 */
function getForecastMetadataFromIssuance(issuanceIso: string): { month: string; forecastNumber: number } {
  const issuanceDate = new Date(issuanceIso);
  const month = issuanceDate.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'America/Los_Angeles'
  }).toLowerCase();

  const pacificHour = parseInt(issuanceDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Los_Angeles'
  }).split(':')[0]);

  if (pacificHour >= 0 && pacificHour < 6) return { month, forecastNumber: 1 };
  if (pacificHour >= 6 && pacificHour < 12) return { month, forecastNumber: 2 };
  if (pacificHour >= 12 && pacificHour < 18) return { month, forecastNumber: 3 };
  return { month, forecastNumber: 4 };
}

function getCurrentPacificHour(): number {
  const currentDate = new Date();
  return parseInt(currentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Los_Angeles'
  }).split(':')[0]);
}

function getPacificCutoffIso(): string {
  const now = new Date();
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacificNow.setHours(18, 0, 0, 0); // 6 PM PST cutoff
  return pacificNow.toISOString();
}

function applyPreCutoffDay0(predictions: ForecastPrediction[][] | null, preCutoff: ForecastPrediction[][] | null): ForecastPrediction[][] | null {
  if (!predictions || !predictions[0]) return predictions;
  const merged = [...predictions];
  if (preCutoff && preCutoff[0]) {
    merged[0] = preCutoff[0];
  }
  return merged;
}

function createEmptySlot(label: string): ForecastPrediction {
  return {
    time: label,
    windSpeed: 0,
    gustSpeed: 0,
    windDirection: 0,
    windDirectionText: '',
    isEmpty: true
  };
}

function normalizeForecastDayFromModel(dayPredictions: any[]): ForecastPrediction[] | null {
  if (!Array.isArray(dayPredictions)) return null;

  const byHour = new Map<number, any>();
  dayPredictions.forEach(p => {
    const hour = Number(p?.hour);
    if (!Number.isFinite(hour) || !FORECAST_HOURS.includes(hour)) {
      return;
    }
    if (byHour.has(hour)) return; // keep first occurrence
    byHour.set(hour, p);
  });

  const normalized: ForecastPrediction[] = FORECAST_HOURS.map((hour, idx) => {
    const slot = byHour.get(hour);
    if (!slot || slot.wspd_kt === undefined || slot.gst_kt === undefined || slot.wdir_deg === undefined) {
      return createEmptySlot(FORECAST_TIME_LABELS[idx]);
    }

    const wspd = Number(slot.wspd_kt);
    const gust = Number(slot.gst_kt);
    const dir = Number(slot.wdir_deg);

    if (!Number.isFinite(wspd) || !Number.isFinite(gust) || !Number.isFinite(dir)) {
      return createEmptySlot(FORECAST_TIME_LABELS[idx]);
    }

    return {
      time: FORECAST_TIME_LABELS[idx],
      windSpeed: parseFloat(wspd.toFixed(1)),
      gustSpeed: parseFloat(gust.toFixed(1)),
      windDirection: Math.round(dir),
      windDirectionText: getWindDirectionText(dir),
      isEmpty: false
    };
  });

  return normalized;
}

function normalizeModelPredictions(prediction: any): ForecastPrediction[][] | null {
  if (!prediction || typeof prediction !== 'object') return null;

  const allDays: ForecastPrediction[][] = [];

  for (let day = 0; day < 5; day++) {
    const dayKey = `day_${day}`;
    const dayPredictions = prediction[dayKey];
    const normalizedDay = normalizeForecastDayFromModel(dayPredictions);

    if (!normalizedDay || normalizedDay.length !== FORECAST_HOURS.length) {
      console.warn(`[LLM-FORECAST] Invalid or missing predictions for ${dayKey}`);
      return null;
    }

    allDays.push(normalizedDay);
  }

  return allDays;
}

function normalizeStoredPredictions(predictions: any): ForecastPrediction[][] | null {
  if (!predictions || typeof predictions !== 'object') return null;

  const normalized: ForecastPrediction[][] = [];

  for (let day = 0; day < 5; day++) {
    const dayPredictions = Array.isArray(predictions)
      ? predictions[day]
      : (predictions as any)[`day_${day}`];
    if (!Array.isArray(dayPredictions) || dayPredictions.length !== FORECAST_HOURS.length) {
      console.warn(`[LLM-FORECAST] Stored predictions invalid shape for day_${day}`);
      return null;
    }

    const normalizedDay = dayPredictions.map((entry: any, idx: number) => ({
      time: typeof entry?.time === 'string' ? entry.time : FORECAST_TIME_LABELS[idx],
      windSpeed: typeof entry?.windSpeed === 'number' ? entry.windSpeed : 0,
      gustSpeed: typeof entry?.gustSpeed === 'number' ? entry.gustSpeed : 0,
      windDirection: typeof entry?.windDirection === 'number' ? entry.windDirection : 0,
      windDirectionText: typeof entry?.windDirectionText === 'string' ? entry.windDirectionText : '',
      isEmpty: Boolean(entry?.isEmpty)
    }));

    normalized.push(normalizedDay);
  }

  return normalized;
}

async function withSafeDay0(data: {
  predictions: ForecastPrediction[][];
  isLLMGenerated: boolean;
  lastUpdated: string;
  nwsForecastTime: string;
  source: string;
  warning?: string;
  llmPrompt?: string;
  reasoning?: string | null;
}) {
  try {
    const pacificHour = getCurrentPacificHour();
    if (pacificHour < 18 || !data.predictions || !data.predictions[0]) {
      return data;
    }

    const cutoffIso = getPacificCutoffIso();
    const preCutoffForecast = await getMostRecentForecastBefore(cutoffIso);
    const preCutoffPredictions = normalizeStoredPredictions(preCutoffForecast?.predictions);

    let mergedPredictions: ForecastPrediction[][] | null = data.predictions;
    let mergedWarning = data.warning;

    if (preCutoffPredictions?.[0]) {
      mergedPredictions = applyPreCutoffDay0(data.predictions, preCutoffPredictions);
      // Only add warning if config enables it
      const modelConfig = await loadModelConfig();
      if (modelConfig.showDay0SourceWarning) {
        mergedWarning = [
          data.warning,
          'Day 0 sourced from last pre-6 PM forecast'
        ].filter(Boolean).join(' | ');
      }
    } else if (preCutoffForecast) {
      const modelConfig = await loadModelConfig();
      if (modelConfig.showDay0SourceWarning) {
        mergedWarning = [
          data.warning,
          'Pre-6 PM forecast found but invalid shape; keeping current Day 0'
        ].filter(Boolean).join(' | ');
      }
    }

    return {
      ...data,
      predictions: mergedPredictions,
      warning: mergedWarning
    };
  } catch (err) {
    console.error('[LLM-FORECAST] withSafeDay0 failed, returning original data:', err);
    return data;
  }
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

// Initialize Anthropic client lazily to prevent module-level errors
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

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

// JSON format support functions - Load training examples from JSON files
async function loadTrainingExamples(issuanceIso: string): Promise<TrainingExample[]> {
  try {
    // Determine which training file to use based on NWS issuance time in Pacific timezone
    const { month, forecastNumber } = getForecastMetadataFromIssuance(issuanceIso);

    console.log(`[LLM-FORECAST] Loading JSON format examples for ${month}_fc${forecastNumber}`);

    // Use JSON format from web-ui data directory
    const jsonDirectory = path.join(
      process.cwd(),
      'data',
      'training',
      'few_shot_examples'
    );

    let jsonPath = path.join(jsonDirectory, `${month}_fc${forecastNumber}_examples.json`);

    console.log(`[LLM-FORECAST] Trying primary path: ${jsonPath}`);

    // Check if file exists, if not try alternative paths
    try {
      await fs.access(jsonPath);
      console.log(`[LLM-FORECAST] Primary path EXISTS`);
    } catch (accessError) {
      console.log(`[LLM-FORECAST] Primary path FAILED, trying fallback...`);
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
      console.log(`[LLM-FORECAST] Trying fallback path: ${parentJsonPath}`);
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

function createFewShotPrompt(formattedForecast: string, warnings: string[], examples: TrainingExample[], dayMappingInstruction?: string, geographicContext?: string, reasoningInstruction?: string): string {
  let systemPrompt = `You are an expert wind forecasting system for ocean sports at AGXC1 station (Los Angeles area).

Your task is to predict hourly wind speed (WSPD), gust speed (GST), and wind direction for 10 AM - 6 PM PST for the next 5 days based on NWS coastal forecasts.

Key requirements:
- Predict for exactly 8 hours per day: 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 3 PM, 4 PM, 5 PM (each bucket represents the hour ending 11 AM through 6 PM PST)
- Return wind speeds in knots (kt) with 1 decimal place
- Return wind direction in degrees (0-360) as integer
- Consider that this time window is critical for sailing/surfing activities
- Account for typical thermal wind patterns in the LA area
- Pay attention to weather warnings and advisories

Here are ${examples.length} examples showing how NWS multi-day forecasts translate to actual conditions:

`;

  if (reasoningInstruction) {
    systemPrompt += `\n\n${reasoningInstruction}`;
  }

  let examplesText = '';
  examples.slice(0, 15).forEach((example, index) => {
    // Skip examples without proper structure
    if (!example.forecast || !example.actual || !example.actual.day_0) {
      console.log(`[LLM-FORECAST] Skipping example ${index + 1}: Missing forecast/actual data structure`);
      return;
    }

    examplesText += `=== EXAMPLE ${index + 1} ===\n`;

    // Add issuance context if available
    const issuedDate = (example as any).issued || (example as any).issuance_time || (example as any).issuanceTime;
    if (issuedDate) {
      examplesText += `Forecast issued on ${issuedDate} (Day 0)\n`;
    }

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

    // Include multi-day actual data (day_0 through day_4 when available)
    ['day_0', 'day_1', 'day_2', 'day_3', 'day_4'].forEach(dayKey => {
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
========================================
NOW PREDICT based on the following NWS forecast:
========================================

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add geographic context if provided (helps LLM interpret sub-area mentions)
  if (geographicContext) {
    currentForecastPrompt += geographicContext;
  }

  // Add day mapping instruction if provided (used when convertForecastDaysToRelative is false)
  if (dayMappingInstruction) {
    currentForecastPrompt += dayMappingInstruction;
  }

  // Add formatted forecast
  currentForecastPrompt += `FORECAST:\n${formattedForecast}\n`;

  currentForecastPrompt += `
========================================
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure. Replace EVERY null with your predicted numbers; do not leave nulls or placeholders:
{
  "reasoning": "A strong high-pressure system is keeping winds light this morning, but expect a lively sea breeze to fill in by early afternoon today, building to 15-18 knots by 3 PM. Tomorrow looks very similar. Wednesday winds ease as the high weakens.",
  "day_0": [
    {"hour": 10, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 11, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 12, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 13, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 14, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 15, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 16, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 17, "wspd_kt": null, "gst_kt": null, "wdir_deg": null}
  ],
  "day_1": [
    ... (8 entries for day 1, same keys as day_0)
  ],
  "day_2": [
    ... (8 entries for day 2, same keys as day_0)
  ],
  "day_3": [
    ... (8 entries for day 3, same keys as day_0)
  ],
  "day_4": [
    ... (8 entries for day 4, same keys as day_0)
  ]
}

========================================
CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Include the "reasoning" field as the first key in your JSON output
- Respond with ONLY the JSON object, no explanations outside the JSON
========================================`;

  return systemPrompt + examplesText + currentForecastPrompt;
}

function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

async function generateForecastWithLLM(forecastText: string, issuanceTime: string): Promise<{ predictions: ForecastPrediction[][], prompt: string, reasoning?: string } | null> {
  try {
    console.log('[LLM-FORECAST] Processing forecast...');
    console.log(`[LLM-FORECAST] Raw forecast text length: ${forecastText.length}`);

    // Load model config to check settings
    const modelConfig = await loadModelConfig();
    const convertDays = modelConfig.convertForecastDaysToRelative !== false; // Default true for backwards compatibility
    const includeGeoContext = modelConfig.includeGeographicContext !== false; // Default true

    // Load geographic context and reasoning instruction if enabled
    let geographicContext: string | undefined;
    let reasoningInstruction: string | undefined;
    if (includeGeoContext) {
      try {
        const promptConfig = await loadPromptConfig();
        geographicContext = promptConfig.geographicContext;
        reasoningInstruction = promptConfig.reasoningInstruction as string | undefined;
        console.log('[LLM-FORECAST] Geographic context loaded from prompt_config.json');
        if (reasoningInstruction) {
          console.log('[LLM-FORECAST] Reasoning instruction loaded from prompt_config.json');
        }
      } catch (err) {
        console.warn('[LLM-FORECAST] Failed to load geographic context, continuing without it:', err);
      }
    }

    // Extract warnings using shared utility
    const warnings = extractWarnings(forecastText);
    if (warnings.length > 0) {
      console.log(`[LLM-FORECAST] Found warnings: ${warnings.join(', ')}`);
    }

    let formattedForecast: string;
    let dayMappingInstruction: string | undefined;

    if (convertDays) {
      // OLD APPROACH: Script-based conversion of weekday names to relative days
      console.log('[LLM-FORECAST] Using script-based day conversion (convertForecastDaysToRelative=true)');

      // Convert periods to relative format (D0_DAY, D1_NIGHT, etc.)
      const processedForecast = convertPeriodsToRelative(forecastText, new Date());
      console.log(`[LLM-FORECAST] Processed forecast length: ${processedForecast.length}`);

      // Format for LLM (simple string replacement: .D0_NIGHT... → Day 0 Night:)
      formattedForecast = formatForecastForLLM(processedForecast);
    } else {
      // NEW APPROACH: Keep original weekday names, tell LLM the mapping via instruction
      console.log('[LLM-FORECAST] Using LLM instruction approach (convertForecastDaysToRelative=false)');

      // Parse the issuance time to generate the day mapping
      const forecastTime = new Date(issuanceTime);
      dayMappingInstruction = generateDayMappingInstruction(forecastTime);
      console.log(`[LLM-FORECAST] Generated day mapping instruction for ${forecastTime.toISOString()}`);

      // Format forecast without day conversion (keeps original weekday names)
      formattedForecast = formatForecastWithoutDayConversion(forecastText);
    }

    console.log(`[LLM-FORECAST] Formatted forecast for LLM, length: ${formattedForecast.length}`);

    console.log(`[LLM-FORECAST] Loading training examples...`);
    let examples;
    try {
      examples = await loadTrainingExamples(issuanceTime);
      console.log(`[LLM-FORECAST] Loaded ${examples.length} JSON training examples`);
    } catch (loadError) {
      console.error('[LLM-FORECAST] Failed to load training examples:', {
        error: loadError instanceof Error ? loadError.message : String(loadError),
        stack: loadError instanceof Error ? loadError.stack : undefined
      });
      throw loadError; // Re-throw to be caught by outer try-catch
    }

    if (examples.length === 0) {
      throw new Error('No JSON training examples loaded - check file paths');
    }

    console.log('[LLM-FORECAST] Creating few-shot prompt with JSON format examples...');
    const prompt = createFewShotPrompt(formattedForecast, warnings, examples, dayMappingInstruction, geographicContext, reasoningInstruction);
    console.log(`[LLM-FORECAST] JSON prompt created, length: ${prompt.length} characters`);

    console.log('[LLM-FORECAST] Calling Claude API for 5-day forecast prediction...');
    // modelConfig already loaded above for convertForecastDaysToRelative check
    let response;
    try {
      const client = getAnthropicClient();
      response = await client.messages.create({
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

    const parsedJson = JSON.parse(jsonMatch[0]);
    const llmReasoning: string | undefined =
      typeof parsedJson.reasoning === 'string' ? parsedJson.reasoning.trim() : undefined;

    const normalizedPredictions = normalizeModelPredictions(parsedJson);
    if (!normalizedPredictions) {
      throw new Error('LLM forecast missing required 8-slot window (hours 10-17)');
    }

    console.log('[LLM-FORECAST] Successfully generated 5-day forecast with strict 8-slot window');
    if (llmReasoning) {
      console.log(`[LLM-FORECAST] Reasoning extracted (${llmReasoning.length} chars)`);
    }
    return { predictions: normalizedPredictions, prompt, reasoning: llmReasoning };

  } catch (error) {
    const errorDetails = {
      forecastTextLength: forecastText?.length,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    };

    logError('Error generating forecast with LLM', error, errorDetails);

    // Log to console for debugging
    console.error('[LLM-FORECAST] FATAL ERROR:', errorDetails);

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

    // Security: Only allow force refresh in development or with admin key
    const isAdmin = request.headers.get('x-admin-key') === process.env.ADMIN_SECRET;
    const forceRequested = url.searchParams.get('force') === 'true';
    const forceUpdate = forceRequested && (process.env.NODE_ENV !== 'production' || isAdmin);

    // Detect if this is a cron-triggered request
    const isCronTriggered = url.searchParams.get('cron') === 'true';

    const useTestData = url.searchParams.get('test') === 'true';

    console.log(`[LLM-FORECAST] Request received`, {
      isCronTriggered,
      forceUpdate,
      isAdmin
    });

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

    // Fetch latest NWS forecast first
    console.log('[LLM-FORECAST] Starting forecast generation process...');
    console.log('[LLM-FORECAST] Fetching latest NWS forecast...');
    const nwsForecast = await fetchLatestNWSForecast();

    if (!nwsForecast) {
      logError('NWS forecast fetch failed', 'No forecast data returned');

      // Try to return most recent forecast from database
      const dbForecast = await getMostRecentForecast();
      const normalizedDbPredictions = dbForecast ? normalizeStoredPredictions(dbForecast.predictions) : null;
      if (dbForecast && normalizedDbPredictions) {
        console.log('[LLM-FORECAST] Returning database forecast (NWS unavailable)');
        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_nws_failed',
          warning: 'Unable to fetch latest NWS forecast, using stored forecast',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });
        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      await sendErrorEmail('Failed to fetch NWS forecast', { timestamp: new Date().toISOString() });
      return NextResponse.json({
        success: false,
        error: 'Unable to fetch NWS forecast and no cached data available'
      }, { status: 503 });
    }

    // Check database for most recent forecast
    const dbForecast = await getMostRecentForecast();
    const normalizedDbPredictions = dbForecast ? normalizeStoredPredictions(dbForecast.predictions) : null;
    if (dbForecast && !normalizedDbPredictions) {
      console.warn('[LLM-FORECAST] Stored forecast found but rejected due to invalid shape (expected 8 slots per day)');
    }

    // Check if on-demand generation is allowed (cron-only mode check)
    const modelConfig = await loadModelConfig();
    const allowOnDemandGeneration = modelConfig.allowOnDemandGeneration !== false; // Default to true

    if (!allowOnDemandGeneration && !isCronTriggered) {
      console.log('[LLM-FORECAST] On-demand generation disabled (cron-only mode)');

      // In cron-only mode, always return database forecast (if available)
      if (dbForecast && normalizedDbPredictions) {
        console.log('[LLM-FORECAST] Returning database forecast (cron-only mode)');

        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_cron_only',
          warning: 'On-demand generation disabled. Forecasts updated via scheduled cron jobs only.',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });

        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      // No database forecast available in cron-only mode
      console.error('[LLM-FORECAST] No database forecast available in cron-only mode');
      return NextResponse.json({
        success: false,
        error: 'No forecast available. On-demand generation is disabled. Please wait for next scheduled update.',
        nextScheduledUpdate: 'Forecasts are generated at 6:15 AM, 12:15 PM, and 6:15 PM PST'
      }, { status: 503 });
    }

    // Compare NWS issuance time with database forecast
    if (!forceUpdate && dbForecast && normalizedDbPredictions) {
      // Helper function: Truncate to minute precision for reliable comparison
      const truncateToMinute = (date: Date): number => {
        const truncated = new Date(date);
        truncated.setSeconds(0, 0);
        return truncated.getTime();
      };

      const nwsTime = new Date(nwsForecast.issuedTime);
      const dbTime = new Date(dbForecast.nwsIssuedAt);

      const nwsTimeMinutes = truncateToMinute(nwsTime);
      const dbTimeMinutes = truncateToMinute(dbTime);

      // Detailed diagnostic logging
      console.log('[LLM-FORECAST] Timestamp comparison:', {
        nwsRaw: nwsForecast.issuedTime,
        dbRaw: dbForecast.nwsIssuedAt,
        nwsParsed: nwsTime.toISOString(),
        dbParsed: dbTime.toISOString(),
        nwsMs: nwsTime.getTime(),
        dbMs: dbTime.getTime(),
        nwsMinutes: nwsTimeMinutes,
        dbMinutes: dbTimeMinutes,
        diffMs: nwsTime.getTime() - dbTime.getTime(),
        willUseCache: dbTimeMinutes >= nwsTimeMinutes
      });

      if (dbTimeMinutes >= nwsTimeMinutes) {
        console.log('[LLM-FORECAST] Database forecast is current (NWS unchanged)');
        console.log(`[LLM-FORECAST] DB forecast time: ${dbForecast.nwsIssuedAt}, NWS time: ${nwsForecast.issuedTime}`);

        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_current',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });

        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      console.log('[LLM-FORECAST] NWS forecast is newer than database, will generate new forecast');
      console.log(`[LLM-FORECAST] DB forecast time: ${dbForecast.nwsIssuedAt}, NWS time: ${nwsForecast.issuedTime}`);
    }

    // Extract inner waters forecast
    console.log('[LLM-FORECAST] Extracting inner waters forecast from NWS data...');
    const innerWatersForecast = extractInnerWatersForecast(nwsForecast.text);

    if (!innerWatersForecast) {
      logError('Inner waters forecast extraction failed', { forecastLength: nwsForecast.text?.length });

      // Try to return database forecast if available
      if (dbForecast && normalizedDbPredictions) {
        console.log('[LLM-FORECAST] Returning database forecast (extraction failed)');
        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_extraction_failed',
          warning: 'Unable to extract inner waters forecast, using stored forecast',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });
        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      await sendErrorEmail('Failed to extract inner waters forecast', {
        forecastText: nwsForecast.text,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json({
        success: false,
        error: 'Unable to extract inner waters forecast'
      }, { status: 500 });
    }

    const isServerless = process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT;
    const allowLocalLlmCalls = process.env.ALLOW_LLM_CALLS === 'true';

    // === Rate Limiting Check ===
    // Note: modelConfig was already loaded above at line 730
    const allowLocalLlmCallsConfig = modelConfig.allowLocalLlmCalls === true;

    if (!isServerless && !allowLocalLlmCalls && !allowLocalLlmCallsConfig) {
      console.warn('[LLM-FORECAST] Local LLM calls disabled (set ALLOW_LLM_CALLS=true to enable)');

      if (dbForecast && normalizedDbPredictions) {
        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_local_llm_disabled',
          warning: 'Local LLM calls disabled. Set ALLOW_LLM_CALLS=true to enable.',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });
        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      return NextResponse.json({
        success: false,
        error: 'Local LLM calls disabled. Set ALLOW_LLM_CALLS=true to enable.',
        rateLimitInfo: {
          callsToday: 0,
          limit: modelConfig.maxDailyLlmCalls || 6,
          resetsAt: 'Midnight PST'
        }
      }, { status: 403 });
    }

    // Check if rate limiting is enabled
    const rateLimitEnabled = modelConfig.enableRateLimit !== false; // Default to true
    const maxDailyCalls = modelConfig.maxDailyLlmCalls || 6;

    // Skip rate limit check if disabled or set to -1
    if (rateLimitEnabled && maxDailyCalls > 0) {
      const todayCallCount = await getDailyLLMCallCount();

      console.log(`[RATE-LIMIT] Daily LLM calls: ${todayCallCount}/${maxDailyCalls}`);

      if (todayCallCount >= maxDailyCalls && !forceUpdate) {
      console.warn('[RATE-LIMIT] Daily LLM call limit exceeded');

      // Return most recent database forecast
      if (dbForecast && normalizedDbPredictions) {
        console.log('[RATE-LIMIT] Returning database forecast (limit exceeded)');
        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_rate_limited',
          warning: `Daily LLM call limit reached (${maxDailyCalls} calls). Using stored forecast.`,
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });
        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      // No database forecast available and rate limited
      await sendErrorEmail('Rate limit exceeded with no cached data', {
        todayCallCount,
        maxDailyCalls,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: false,
        error: `Daily LLM call limit exceeded (${maxDailyCalls} calls). No cached forecast available.`,
        rateLimitInfo: {
          callsToday: todayCallCount,
          limit: maxDailyCalls,
          resetsAt: 'Midnight PST'
        }
      }, { status: 429 });  // 429 Too Many Requests
      }

      console.log('[RATE-LIMIT] Within daily limit, proceeding with LLM generation');
    } else {
      console.log('[RATE-LIMIT] Rate limiting disabled or set to unlimited (-1)');
    }
    // === END Rate Limiting Check ===

    // Generate new forecast with LLM
    console.log(`[LLM-FORECAST] Generating 5-day forecast with LLM using JSON training examples`);
    console.log('[LLM-FORECAST] Inner waters forecast text length:', innerWatersForecast.length);
    const result = await generateForecastWithLLM(innerWatersForecast, nwsForecast.issuedTime);

    if (!result) {
      logError('LLM prediction generation failed', { forecastText: innerWatersForecast?.substring(0, 200) + '...' });

      // Try to return database forecast
      if (dbForecast && normalizedDbPredictions) {
        await sendErrorEmail('LLM forecast generation failed', {
          forecastText: innerWatersForecast,
          timestamp: new Date().toISOString()
        });
        const safeData = await withSafeDay0({
          predictions: normalizedDbPredictions,
          isLLMGenerated: true,
          lastUpdated: dbForecast.llmGeneratedAt,
          nwsForecastTime: dbForecast.nwsIssuedAt,
          source: 'db_llm_failed',
          warning: 'LLM forecast generation failed, using stored forecast',
          llmPrompt: dbForecast.llmPrompt,
          reasoning: dbForecast.reasoning
        });

        return NextResponse.json({
          success: true,
          data: safeData
        });
      }

      await sendErrorEmail('LLM forecast generation failed with no cache', {
        forecastText: innerWatersForecast,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: false,
        error: 'LLM forecast generation failed and no cached data available',
        details: process.env.NODE_ENV === 'development' ? {
          forecastText: innerWatersForecast?.substring(0, 200),
          message: 'Check server console for detailed error logs'
        } : undefined
      }, { status: 500 });
    }

    // Store forecast to database
    const now = new Date();
    try {
      const { month, forecastNumber } = getForecastMetadataFromIssuance(nwsForecast.issuedTime);
      const modelConfig = await loadModelConfig();

      const storageData: ForecastStorageData = {
        nwsIssuedAt: nwsForecast.issuedTime,
        llmGeneratedAt: getPacificISOString(now),
        nwsForecastText: innerWatersForecast,
        llmPrompt: result.prompt,
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        topP: modelConfig.top_p,
        maxTokens: modelConfig.max_tokens.forecast,
        month,
        forecastNumber,
        predictions: result.predictions,
        source: 'fresh_llm',
        notes: undefined,
        reasoning: result.reasoning
      };

      // Store forecast synchronously to ensure it completes before next request
      try {
        await storeForecast(storageData);
        console.log('[LLM-FORECAST] Successfully stored forecast to database');
      } catch (storageErr) {
        console.error('[LLM-FORECAST] CRITICAL: Failed to store forecast to database:', storageErr);
        // Continue even if storage fails - user still gets prediction
        // TODO: Consider adding retry logic or admin alerts in future
      }

    } catch (storageError) {
      // Log but don't fail the API response
      console.error('[LLM-FORECAST] Failed to prepare forecast storage:', storageError);
    }

    console.log(`Successfully generated and cached new forecast`);

    const safeData = await withSafeDay0({
      predictions: result.predictions,
      isLLMGenerated: true,
      lastUpdated: now.toISOString(),
      nwsForecastTime: nwsForecast.issuedTime,
      source: 'fresh_llm',
      llmPrompt: result.prompt,
      reasoning: result.reasoning
    });

    return NextResponse.json({
      success: true,
      data: safeData
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
