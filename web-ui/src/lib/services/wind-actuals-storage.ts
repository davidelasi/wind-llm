/**
 * Wind Actuals Storage Service
 *
 * Handles storage and retrieval of actual hourly wind measurements from the database.
 * Used by:
 * - Daily cron job (automated storage at 1 AM PST)
 * - Manual trigger API (testing/backfill)
 * - Future: Forecast vs. actual comparison APIs
 *
 * @module wind-actuals-storage
 */

import { sql } from '@vercel/postgres';
import type { WindDataPoint } from '@/types/wind-data';

export interface WindActualRow {
  id: number;
  date: string;
  hour: number;
  timestamp: string;
  wspd_avg_kt: number;
  gst_max_kt: number;
  wdir_avg_deg: number;
  wdir_text: string;
  temp_avg_c: number | null;
  pres_avg_hpa: number | null;
  sample_count: number;
  stored_at: string;
}

/**
 * Store hourly wind actuals to database
 *
 * Uses UPSERT strategy (INSERT ... ON CONFLICT UPDATE) for idempotency.
 * This allows the same data to be stored multiple times without creating duplicates.
 *
 * @param dataPoints - Array of hourly wind data points (should be filtered to 10 AM - 6 PM)
 * @returns Number of rows successfully inserted/updated
 */
export async function storeWindActuals(dataPoints: WindDataPoint[]): Promise<number> {
  try {
    let storedCount = 0;

    for (const point of dataPoints) {
      // Validate hour is within forecast window
      if (point.hour < 10 || point.hour > 18) {
        console.warn(`[WIND-ACTUALS] Skipping invalid hour: ${point.hour} (must be 10-18)`);
        continue;
      }

      // Upsert (insert or update if exists)
      await sql`
        INSERT INTO wind_actuals (
          date,
          hour,
          timestamp,
          wspd_avg_kt,
          gst_max_kt,
          wdir_avg_deg,
          wdir_text,
          temp_avg_c,
          pres_avg_hpa,
          sample_count
        ) VALUES (
          ${point.date},
          ${point.hour},
          ${point.timestamp},
          ${point.windSpeed},
          ${point.gustSpeed},
          ${point.windDirection},
          ${point.windDirectionText},
          ${point.temperature || null},
          ${point.pressure || null},
          ${point.sampleCount}
        )
        ON CONFLICT (date, hour)
        DO UPDATE SET
          timestamp = EXCLUDED.timestamp,
          wspd_avg_kt = EXCLUDED.wspd_avg_kt,
          gst_max_kt = EXCLUDED.gst_max_kt,
          wdir_avg_deg = EXCLUDED.wdir_avg_deg,
          wdir_text = EXCLUDED.wdir_text,
          temp_avg_c = EXCLUDED.temp_avg_c,
          pres_avg_hpa = EXCLUDED.pres_avg_hpa,
          sample_count = EXCLUDED.sample_count,
          stored_at = NOW()
      `;

      storedCount++;
    }

    console.log(`[WIND-ACTUALS] Successfully stored ${storedCount} hourly records`);
    return storedCount;

  } catch (error) {
    console.error('[WIND-ACTUALS] Failed to store wind actuals:', error);

    if (error instanceof Error) {
      console.error('[WIND-ACTUALS] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3)
      });
    }

    throw error;
  }
}

/**
 * Get wind actuals for a specific date
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns Array of hourly wind actuals for the date (0-9 rows, may have gaps)
 */
export async function getWindActualsForDate(date: string): Promise<WindActualRow[]> {
  try {
    const result = await sql`
      SELECT *
      FROM wind_actuals
      WHERE date = ${date}
      ORDER BY hour ASC
    `;

    return result.rows as WindActualRow[];

  } catch (error) {
    console.error('[WIND-ACTUALS] Failed to get wind actuals for date:', error);
    return [];
  }
}

/**
 * Get recent wind actuals for debugging/verification
 *
 * @param limit - Number of recent records to retrieve (default: 50)
 * @returns Array of most recent wind actuals, sorted newest first
 */
export async function getRecentWindActuals(limit: number = 50): Promise<WindActualRow[]> {
  try {
    const result = await sql`
      SELECT *
      FROM wind_actuals
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.rows as WindActualRow[];

  } catch (error) {
    console.error('[WIND-ACTUALS] Failed to get recent wind actuals:', error);
    return [];
  }
}

/**
 * Check if wind actuals exist for a specific date
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns True if any actuals exist for the date, false otherwise
 */
export async function windActualsExistForDate(date: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count
      FROM wind_actuals
      WHERE date = ${date}
    `;

    return parseInt(result.rows[0].count) > 0;

  } catch (error) {
    console.error('[WIND-ACTUALS] Failed to check wind actuals existence:', error);
    return false;
  }
}

/**
 * Get count of days with stored actuals
 *
 * @returns Number of unique dates with wind actuals data
 */
export async function getWindActualsCount(): Promise<{
  totalDays: number;
  totalHours: number;
  earliestDate: string | null;
  latestDate: string | null;
}> {
  try {
    const result = await sql`
      SELECT
        COUNT(DISTINCT date) as total_days,
        COUNT(*) as total_hours,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM wind_actuals
    `;

    const row = result.rows[0];

    return {
      totalDays: parseInt(row.total_days) || 0,
      totalHours: parseInt(row.total_hours) || 0,
      earliestDate: row.earliest_date || null,
      latestDate: row.latest_date || null
    };

  } catch (error) {
    console.error('[WIND-ACTUALS] Failed to get wind actuals count:', error);
    return {
      totalDays: 0,
      totalHours: 0,
      earliestDate: null,
      latestDate: null
    };
  }
}
