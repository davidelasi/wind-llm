/**
 * Sausage Mode API - Shows exactly how the LLM prompt is constructed
 * Uses the same code paths as the production llm-forecast API
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  extractInnerWatersForecast,
  extractWarnings,
  generateDayMappingInstruction,
  formatForecastWithoutDayConversion
} from '@/lib/forecast-utils';
import { createFewShotPrompt, TrainingExample } from '@/lib/llm-prompt';

// Load configurations
const MODEL_CONFIG_PATH = path.join(process.cwd(), 'config', 'model_config.json');
const PROMPT_CONFIG_PATH = path.join(process.cwd(), 'config', 'prompt_config.json');

const NWS_COASTAL_FORECAST_URL = 'https://api.weather.gov/products/types/CWF/locations/LOX';

async function loadModelConfig() {
  const content = await fs.readFile(MODEL_CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

async function loadPromptConfig() {
  try {
    const content = await fs.readFile(PROMPT_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Fetch the latest NWS coastal forecast
 */
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

    const forecastData = await forecastResponse.json();

    return {
      text: forecastData.productText || '',
      issuedTime: latestForecast.issuanceTime,
      url: latestForecast['@id']
    };
  } catch (error) {
    console.error('[SAUSAGE-MODE] Error fetching NWS forecast:', error);
    return null;
  }
}

/**
 * Load training examples - same logic as llm-forecast
 */
async function loadTrainingExamples(issuanceTime: string): Promise<{ examples: TrainingExample[]; filePath: string; month: string; forecastNumber: number }> {
  const issuanceDate = new Date(issuanceTime);
  const month = issuanceDate.toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'America/Los_Angeles'
  }).toLowerCase();

  const pacificHour = parseInt(issuanceDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Los_Angeles'
  }).split(':')[0]);

  let forecastNumber = 1;
  if (pacificHour >= 0 && pacificHour < 6) forecastNumber = 1;
  else if (pacificHour >= 6 && pacificHour < 12) forecastNumber = 2;
  else if (pacificHour >= 12 && pacificHour < 18) forecastNumber = 3;
  else forecastNumber = 4;

  const jsonDirectory = path.join(process.cwd(), 'data', 'training', 'few_shot_examples');
  const jsonPath = path.join(jsonDirectory, `${month}_fc${forecastNumber}_examples.json`);

  const fileContent = await fs.readFile(jsonPath, 'utf-8');
  const examples: TrainingExample[] = JSON.parse(fileContent);

  return {
    examples,
    filePath: jsonPath,
    month,
    forecastNumber
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('[SAUSAGE-MODE] Building prompt using production code path...');

    // Load configurations
    const modelConfig = await loadModelConfig();
    const promptConfig = await loadPromptConfig();

    // 1. Fetch NWS Forecast
    const nwsForecast = await fetchLatestNWSForecast();
    if (!nwsForecast) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch NWS forecast'
      }, { status: 500 });
    }

    // 2. Extract Inner Waters section
    const innerWatersForecast = extractInnerWatersForecast(nwsForecast.text);
    if (!innerWatersForecast) {
      return NextResponse.json({
        success: false,
        error: 'Failed to extract inner waters forecast'
      }, { status: 500 });
    }

    // 3. Extract warnings
    const warnings = extractWarnings(innerWatersForecast);

    // 4. Load training examples based on NWS issuance time
    const trainingData = await loadTrainingExamples(nwsForecast.issuedTime);

    // 5. Format forecast (same as production)
    // Using the "LLM instruction approach" (convertForecastDaysToRelative=false)
    const forecastTime = new Date(nwsForecast.issuedTime);
    const dayMappingInstruction = generateDayMappingInstruction(forecastTime);
    const formattedForecast = formatForecastWithoutDayConversion(innerWatersForecast);

    // 6. Get geographic context if enabled
    let geographicContext: string | undefined;
    if (modelConfig.includeGeographicContext && promptConfig?.geographicContext) {
      geographicContext = promptConfig.geographicContext + '\n\n';
    }

    // 7. Create the prompt using the SAME function as production
    const prompt = createFewShotPrompt(
      formattedForecast,
      warnings,
      trainingData.examples,
      dayMappingInstruction,
      geographicContext
    );

    // Return all the data for display
    return NextResponse.json({
      success: true,
      data: {
        // NWS Data
        nwsData: {
          url: NWS_COASTAL_FORECAST_URL,
          fetchedAt: new Date().toISOString(),
          issuedTime: nwsForecast.issuedTime,
          forecastUrl: nwsForecast.url,
        },

        // Extracted Forecast
        extractedForecast: {
          innerWatersForecast,
          formattedForecast,
          warnings,
        },

        // Training Data
        trainingData: {
          filePath: trainingData.filePath,
          month: trainingData.month,
          forecastNumber: trainingData.forecastNumber,
          totalExamples: trainingData.examples.length,
          examplesUsed: Math.min(15, trainingData.examples.length),
          allExamples: trainingData.examples.slice(0, 15)
        },

        // The Complete Prompt
        prompt: {
          fullPrompt: prompt,
          promptLength: prompt.length,
          promptTokenEstimate: Math.ceil(prompt.length / 4),
          dayMappingInstruction,
          geographicContext: geographicContext || null,
        },

        // LLM Configuration
        llmConfig: {
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          top_p: modelConfig.top_p,
          max_tokens: modelConfig.max_tokens?.forecast || 2500,
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
