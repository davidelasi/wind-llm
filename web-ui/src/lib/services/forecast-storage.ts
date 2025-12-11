import { sql } from '@vercel/postgres';
import { createHash } from 'crypto';

export interface ForecastPrediction {
  time: string;
  windSpeed: number;
  gustSpeed: number;
  windDirection: number;
  windDirectionText: string;
  isEmpty: boolean;
}

export interface ForecastStorageData {
  // Timestamps
  nwsIssuedAt: string;
  llmGeneratedAt: string;

  // Source data
  nwsForecastText: string;
  llmPrompt: string;

  // Model config
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;

  // Forecast metadata
  month: string;
  forecastNumber: number;

  // Predictions
  predictions: ForecastPrediction[][];

  // Quality
  source: string;
  notes?: string;
}

/**
 * Generate unique hash for forecast deduplication
 * Based on NWS issuance time + forecast text
 */
export function generateForecastHash(nwsIssuedAt: string, forecastText: string): string {
  const hashInput = `${nwsIssuedAt}|${forecastText}`;
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Store forecast to database
 * Returns forecast ID if successful, null if failed or duplicate
 */
export async function storeForecast(data: ForecastStorageData): Promise<string | null> {
  try {
    // Generate deduplication hash
    const forecastHash = generateForecastHash(data.nwsIssuedAt, data.nwsForecastText);

    // Check if this forecast already exists
    const existing = await sql`
      SELECT id FROM forecasts WHERE forecast_hash = ${forecastHash}
    `;

    if (existing.rows.length > 0) {
      console.log(`[FORECAST-STORAGE] Forecast already stored (hash: ${forecastHash.substring(0, 8)}...)`);
      return null; // Already stored, skip
    }

    // Transform predictions to JSONB structure
    const predictionsJson = {
      day_0: data.predictions[0] || [],
      day_1: data.predictions[1] || [],
      day_2: data.predictions[2] || [],
      day_3: data.predictions[3] || [],
      day_4: data.predictions[4] || []
    };

    // Insert forecast
    const result = await sql`
      INSERT INTO forecasts (
        forecast_hash,
        nws_issued_at,
        llm_generated_at,
        nws_forecast_text,
        llm_prompt,
        model,
        temperature,
        top_p,
        max_tokens,
        month,
        forecast_number,
        predictions,
        source,
        storage_notes
      ) VALUES (
        ${forecastHash},
        ${data.nwsIssuedAt},
        ${data.llmGeneratedAt},
        ${data.nwsForecastText},
        ${data.llmPrompt},
        ${data.model},
        ${data.temperature},
        ${data.topP},
        ${data.maxTokens},
        ${data.month},
        ${data.forecastNumber},
        ${JSON.stringify(predictionsJson)},
        ${data.source},
        ${data.notes || null}
      )
      RETURNING id
    `;

    const forecastId = result.rows[0].id;
    console.log(`[FORECAST-STORAGE] Successfully stored forecast ID: ${forecastId}`);
    console.log(`[FORECAST-STORAGE] NWS issued: ${data.nwsIssuedAt}, FC${data.forecastNumber}, ${data.month}`);

    return forecastId;

  } catch (error) {
    console.error('[FORECAST-STORAGE] Failed to store forecast:', error);

    // Log detailed error info
    if (error instanceof Error) {
      console.error('[FORECAST-STORAGE] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3)
      });
    }

    return null;
  }
}

/**
 * Query recent forecasts for debugging/verification
 */
export async function getRecentForecasts(limit: number = 10) {
  try {
    const result = await sql`
      SELECT
        id,
        forecast_hash,
        nws_issued_at,
        llm_generated_at,
        month,
        forecast_number,
        model,
        temperature,
        source,
        stored_at
      FROM forecasts
      ORDER BY llm_generated_at DESC
      LIMIT ${limit}
    `;

    return result.rows;
  } catch (error) {
    console.error('[FORECAST-STORAGE] Failed to query recent forecasts:', error);
    return [];
  }
}
