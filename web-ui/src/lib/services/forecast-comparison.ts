/**
 * Forecast vs Actuals Comparison Service
 *
 * Compares LLM-generated wind forecasts against actual wind measurements
 * on a solar time basis (same PST hour-of-day comparison).
 *
 * @module forecast-comparison
 */

import { sql } from '@vercel/postgres';
import { getWindActualsForDate, type WindActualRow } from './wind-actuals-storage';
import { shouldSkipDatabase, logDatabaseSkipped } from '@/lib/db/db-utils';
import { type ForecastPrediction } from './forecast-storage';
import { formatInTimeZone } from 'date-fns-tz';
import { addDays, parseISO } from 'date-fns';

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

/**
 * Hourly comparison between forecast and actual wind data
 */
export interface HourlyComparison {
  hour: number;           // 10-17 PST (internal)
  displayTime: string;    // "11 AM", "12 PM", etc.
  forecast: { wspd: number; gst: number } | null;
  actual: { wspd: number; gst: number } | null;
  error: { wspd: number; gst: number } | null;  // actual - forecast (positive = underforecast)
}

/**
 * Daily comparison summary with all hourly data
 */
export interface DayComparison {
  dayIndex: number;       // 0-4 (day_0 through day_4)
  date: string;           // YYYY-MM-DD
  displayDate: string;    // "Jan 18, 2026"
  dayLabel: string;       // "Today", "Tomorrow", "Day 2", etc.
  hourly: HourlyComparison[];
  summary: {
    avgWspdError: number | null;    // Mean absolute error
    avgGstError: number | null;
    maxWspdError: number | null;    // Max absolute error
    maxGstError: number | null;
    hoursWithActuals: number;
    totalHours: number;
  };
  status: 'complete' | 'partial' | 'no_data' | 'future';
}

/**
 * Full forecast comparison result
 */
export interface ForecastComparison {
  forecastId: string;
  nwsIssuedAt: string;
  llmGeneratedAt: string;
  displayGeneratedAt: string;
  days: DayComparison[];
  overallSummary: {
    totalHoursCompared: number;
    avgWspdError: number | null;
    avgGstError: number | null;
    daysWithData: number;
    totalDays: number;
  };
}

/**
 * Stored forecast record from database
 */
interface StoredForecast {
  id: string;
  nws_issued_at: string | Date;  // Postgres may return Date object
  llm_generated_at: string | Date;  // Postgres may return Date object
  predictions: {
    day_0: ForecastPrediction[];
    day_1: ForecastPrediction[];
    day_2: ForecastPrediction[];
    day_3: ForecastPrediction[];
    day_4: ForecastPrediction[];
  };
}

/**
 * Map display time (e.g., "11 AM") to internal hour (10-17)
 * Display times are offset by 1 because they represent the END of the hour window
 */
function displayTimeToHour(displayTime: string): number {
  const hourMap: Record<string, number> = {
    '11 AM': 10,
    '12 PM': 11,
    '1 PM': 12,
    '2 PM': 13,
    '3 PM': 14,
    '4 PM': 15,
    '5 PM': 16,
    '6 PM': 17,
  };
  return hourMap[displayTime] ?? -1;
}

/**
 * Map internal hour (10-17) to display time
 */
function hourToDisplayTime(hour: number): string {
  const displayMap: Record<number, string> = {
    10: '11 AM',
    11: '12 PM',
    12: '1 PM',
    13: '2 PM',
    14: '3 PM',
    15: '4 PM',
    16: '5 PM',
    17: '6 PM',
  };
  return displayMap[hour] ?? `${hour}:00`;
}

/**
 * Calculate date for a forecast day index based on NWS issuance date
 */
function getForecastDateForDay(nwsIssuedAt: string | Date, dayIndex: number): string {
  // Parse the NWS issuance timestamp and get its Pacific date
  // Handle both Date objects and ISO strings from Postgres
  const issuedDate = nwsIssuedAt instanceof Date
    ? nwsIssuedAt
    : parseISO(nwsIssuedAt);
  const pacificDateStr = formatInTimeZone(issuedDate, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
  const baseDate = parseISO(pacificDateStr);

  // Add the day index
  const targetDate = addDays(baseDate, dayIndex);
  return formatInTimeZone(targetDate, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Format date for display (e.g., "Jan 18, 2026")
 */
function formatDisplayDate(dateStr: string): string {
  const date = parseISO(dateStr);
  return formatInTimeZone(date, PACIFIC_TIMEZONE, 'MMM d, yyyy');
}

/**
 * Get day label based on day index
 */
function getDayLabel(dayIndex: number): string {
  switch (dayIndex) {
    case 0: return 'Today';
    case 1: return 'Tomorrow';
    default: return `Day ${dayIndex}`;
  }
}

/**
 * Determine data status for a day
 */
function getDayStatus(
  forecastDate: string,
  hoursWithActuals: number,
  totalHours: number
): 'complete' | 'partial' | 'no_data' | 'future' {
  const today = formatInTimeZone(new Date(), PACIFIC_TIMEZONE, 'yyyy-MM-dd');

  if (forecastDate > today) {
    return 'future';
  }

  if (hoursWithActuals === 0) {
    return 'no_data';
  }

  if (hoursWithActuals < totalHours) {
    return 'partial';
  }

  return 'complete';
}

/**
 * Compare a single day's forecast against actuals
 */
async function compareDayForecastToActuals(
  dayPredictions: ForecastPrediction[],
  forecastDate: string,
  dayIndex: number
): Promise<DayComparison> {
  // Get actuals for this date
  const actuals = await getWindActualsForDate(forecastDate);

  // Create a map of actuals by hour for fast lookup
  const actualsMap = new Map<number, WindActualRow>();
  for (const actual of actuals) {
    actualsMap.set(actual.hour, actual);
  }

  // Build hourly comparisons for all forecast hours (10-17)
  const hourlyComparisons: HourlyComparison[] = [];
  const errors: { wspd: number; gst: number }[] = [];

  // Process each forecast prediction
  for (const prediction of dayPredictions) {
    if (prediction.isEmpty) continue;

    const hour = displayTimeToHour(prediction.time);
    if (hour < 10 || hour > 17) continue;

    const actual = actualsMap.get(hour);

    const comparison: HourlyComparison = {
      hour,
      displayTime: prediction.time,
      forecast: {
        wspd: prediction.windSpeed,
        gst: prediction.gustSpeed,
      },
      actual: actual ? {
        wspd: Number(actual.wspd_avg_kt),
        gst: Number(actual.gst_max_kt),
      } : null,
      error: null,
    };

    // Calculate error if we have actuals
    if (actual) {
      const wspdError = Number(actual.wspd_avg_kt) - prediction.windSpeed;
      const gstError = Number(actual.gst_max_kt) - prediction.gustSpeed;
      comparison.error = { wspd: wspdError, gst: gstError };
      errors.push({ wspd: Math.abs(wspdError), gst: Math.abs(gstError) });
    }

    hourlyComparisons.push(comparison);
  }

  // Sort by hour
  hourlyComparisons.sort((a, b) => a.hour - b.hour);

  // Calculate summary statistics
  const hoursWithActuals = errors.length;
  const totalHours = hourlyComparisons.length;

  let avgWspdError: number | null = null;
  let avgGstError: number | null = null;
  let maxWspdError: number | null = null;
  let maxGstError: number | null = null;

  if (errors.length > 0) {
    avgWspdError = errors.reduce((sum, e) => sum + e.wspd, 0) / errors.length;
    avgGstError = errors.reduce((sum, e) => sum + e.gst, 0) / errors.length;
    maxWspdError = Math.max(...errors.map(e => e.wspd));
    maxGstError = Math.max(...errors.map(e => e.gst));
  }

  const status = getDayStatus(forecastDate, hoursWithActuals, totalHours);

  return {
    dayIndex,
    date: forecastDate,
    displayDate: formatDisplayDate(forecastDate),
    dayLabel: getDayLabel(dayIndex),
    hourly: hourlyComparisons,
    summary: {
      avgWspdError: avgWspdError !== null ? Math.round(avgWspdError * 10) / 10 : null,
      avgGstError: avgGstError !== null ? Math.round(avgGstError * 10) / 10 : null,
      maxWspdError: maxWspdError !== null ? Math.round(maxWspdError * 10) / 10 : null,
      maxGstError: maxGstError !== null ? Math.round(maxGstError * 10) / 10 : null,
      hoursWithActuals,
      totalHours,
    },
    status,
  };
}

/**
 * Get forecast by ID from database
 */
async function getForecastById(forecastId: string): Promise<StoredForecast | null> {
  // Skip database in local development
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('getForecastById');
    return null;
  }

  try {
    const result = await sql`
      SELECT
        id,
        nws_issued_at,
        llm_generated_at,
        predictions
      FROM forecasts
      WHERE id = ${forecastId}
    `;

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as StoredForecast;
  } catch (error) {
    console.error('[FORECAST-COMPARISON] Failed to get forecast by ID:', error);
    return null;
  }
}

/**
 * Compare a forecast against actual wind data
 *
 * @param forecastId - UUID of the forecast to compare
 * @returns Full comparison data with all days and summary statistics
 */
export async function compareForecastToActuals(
  forecastId: string
): Promise<ForecastComparison | null> {
  try {
    // Get the forecast
    const forecast = await getForecastById(forecastId);
    if (!forecast) {
      console.error(`[FORECAST-COMPARISON] Forecast not found: ${forecastId}`);
      return null;
    }

    const predictions = forecast.predictions;
    const nwsIssuedAt = forecast.nws_issued_at;

    // Compare each day (0-4)
    const dayComparisons: DayComparison[] = [];

    for (let dayIndex = 0; dayIndex <= 4; dayIndex++) {
      const dayKey = `day_${dayIndex}` as keyof typeof predictions;
      const dayPredictions = predictions[dayKey] || [];

      if (dayPredictions.length === 0) {
        // No predictions for this day - skip
        continue;
      }

      const forecastDate = getForecastDateForDay(nwsIssuedAt, dayIndex);
      const dayComparison = await compareDayForecastToActuals(
        dayPredictions,
        forecastDate,
        dayIndex
      );

      dayComparisons.push(dayComparison);
    }

    // Calculate overall summary
    let totalHoursCompared = 0;
    let totalWspdError = 0;
    let totalGstError = 0;
    let daysWithData = 0;

    for (const day of dayComparisons) {
      if (day.summary.hoursWithActuals > 0) {
        totalHoursCompared += day.summary.hoursWithActuals;
        totalWspdError += (day.summary.avgWspdError ?? 0) * day.summary.hoursWithActuals;
        totalGstError += (day.summary.avgGstError ?? 0) * day.summary.hoursWithActuals;
        daysWithData++;
      }
    }

    const overallAvgWspdError = totalHoursCompared > 0
      ? Math.round((totalWspdError / totalHoursCompared) * 10) / 10
      : null;
    const overallAvgGstError = totalHoursCompared > 0
      ? Math.round((totalGstError / totalHoursCompared) * 10) / 10
      : null;

    // Format display date for generated time
    // Handle both Date objects and ISO strings from Postgres
    const generatedDate = forecast.llm_generated_at instanceof Date
      ? forecast.llm_generated_at
      : parseISO(forecast.llm_generated_at);
    const displayGeneratedAt = formatInTimeZone(
      generatedDate,
      PACIFIC_TIMEZONE,
      'MMM d, yyyy h:mm a'
    );

    return {
      forecastId,
      nwsIssuedAt: forecast.nws_issued_at instanceof Date
        ? forecast.nws_issued_at.toISOString()
        : forecast.nws_issued_at,
      llmGeneratedAt: forecast.llm_generated_at instanceof Date
        ? forecast.llm_generated_at.toISOString()
        : forecast.llm_generated_at,
      displayGeneratedAt,
      days: dayComparisons,
      overallSummary: {
        totalHoursCompared,
        avgWspdError: overallAvgWspdError,
        avgGstError: overallAvgGstError,
        daysWithData,
        totalDays: dayComparisons.length,
      },
    };

  } catch (error) {
    console.error('[FORECAST-COMPARISON] Failed to compare forecast:', error);
    return null;
  }
}

/**
 * Get list of available forecasts for the dropdown selector
 */
export async function getAvailableForecasts(limit: number = 20): Promise<{
  id: string;
  nwsIssuedAt: string;
  llmGeneratedAt: string;
  displayLabel: string;
  month: string;
  forecastNumber: number;
}[]> {
  // Skip database in local development
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('getAvailableForecasts');
    return [];
  }

  try {
    const result = await sql`
      SELECT
        id,
        nws_issued_at,
        llm_generated_at,
        month,
        forecast_number
      FROM forecasts
      WHERE source = 'fresh_llm'
      ORDER BY llm_generated_at DESC
      LIMIT ${limit}
    `;

    return result.rows.map(row => {
      // Handle both Date objects and ISO strings from Postgres
      const generatedDate = row.llm_generated_at instanceof Date
        ? row.llm_generated_at
        : parseISO(row.llm_generated_at);
      const nwsDate = row.nws_issued_at instanceof Date
        ? row.nws_issued_at
        : parseISO(row.nws_issued_at);

      const generatedStr = formatInTimeZone(generatedDate, PACIFIC_TIMEZONE, 'MMM d, h:mm a');
      const nwsStr = formatInTimeZone(nwsDate, PACIFIC_TIMEZONE, 'h:mm a');

      return {
        id: row.id,
        nwsIssuedAt: row.nws_issued_at instanceof Date
          ? row.nws_issued_at.toISOString()
          : row.nws_issued_at,
        llmGeneratedAt: row.llm_generated_at instanceof Date
          ? row.llm_generated_at.toISOString()
          : row.llm_generated_at,
        displayLabel: `${generatedStr} (NWS: ${nwsStr})`,
        month: row.month,
        forecastNumber: row.forecast_number,
      };
    });

  } catch (error) {
    console.error('[FORECAST-COMPARISON] Failed to get available forecasts:', error);
    return [];
  }
}
