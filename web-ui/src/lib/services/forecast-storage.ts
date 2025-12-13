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

/**
 * Get most recent forecast from database with full data
 * Returns complete forecast data for serving to users
 */
export async function getMostRecentForecast(): Promise<{
  id: string;
  nwsIssuedAt: string;
  llmGeneratedAt: string;
  nwsForecastText: string;
  predictions: ForecastPrediction[][];
  llmPrompt: string;
  model: string;
  temperature: number;
  source: string;
} | null> {
  try {
    const result = await sql`
      SELECT
        id,
        nws_issued_at,
        llm_generated_at,
        nws_forecast_text,
        predictions,
        llm_prompt,
        model,
        temperature,
        source
      FROM forecasts
      WHERE source = 'fresh_llm'
      ORDER BY nws_issued_at DESC
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Transform JSONB predictions back to array format
    const predictionsJson = row.predictions;
    const predictions: ForecastPrediction[][] = [
      predictionsJson.day_0 || [],
      predictionsJson.day_1 || [],
      predictionsJson.day_2 || [],
      predictionsJson.day_3 || [],
      predictionsJson.day_4 || []
    ];

    return {
      id: row.id,
      nwsIssuedAt: row.nws_issued_at,
      llmGeneratedAt: row.llm_generated_at,
      nwsForecastText: row.nws_forecast_text,
      predictions,
      llmPrompt: row.llm_prompt,
      model: row.model,
      temperature: parseFloat(row.temperature),
      source: row.source
    };

  } catch (error) {
    console.error('[FORECAST-STORAGE] Failed to get most recent forecast:', error);
    return null;
  }
}

/**
 * Get count of LLM calls made today (PST timezone)
 * Used for rate limiting
 */
export async function getDailyLLMCallCount(): Promise<number> {
  try {
    const result = await sql`
      SELECT COUNT(*) as call_count
      FROM forecasts
      WHERE source = 'fresh_llm'
        AND DATE(stored_at AT TIME ZONE 'America/Los_Angeles') =
            DATE(NOW() AT TIME ZONE 'America/Los_Angeles')
    `;

    return parseInt(result.rows[0].call_count) || 0;

  } catch (error) {
    console.error('[FORECAST-STORAGE] Failed to get daily LLM call count:', error);
    // Return high number on error to prevent runaway costs
    return 999;
  }
}

/**
 * Check if forecast for specific NWS issuance time already exists
 * Returns true if forecast exists, false otherwise
 */
export async function forecastExistsForNWS(nwsIssuedAt: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM forecasts
      WHERE nws_issued_at = ${nwsIssuedAt}
        AND source = 'fresh_llm'
      LIMIT 1
    `;

    return result.rows.length > 0;

  } catch (error) {
    console.error('[FORECAST-STORAGE] Failed to check forecast existence:', error);
    return false;
  }
}
