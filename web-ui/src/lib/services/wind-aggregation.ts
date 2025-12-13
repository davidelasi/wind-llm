/**
 * Wind Aggregation Service
 *
 * Shared service for aggregating raw 6-minute NOAA wind measurements into hourly data points.
 * Extracted from wind-history API to enable reuse across:
 * - Wind history API endpoint (charts/display)
 * - Wind actuals storage (daily cron job)
 *
 * @module wind-aggregation
 */

import { formatInTimeZone } from 'date-fns-tz';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';
import type { WindDataPoint, RawWindMeasurement } from '@/types/wind-data';

// Constants
const MS_TO_KNOTS = 1.94384;

/**
 * Convert wind direction in degrees to compass direction text
 */
export function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Convert raw 6-minute NOAA measurements to hourly aggregated data points
 *
 * This function performs the following transformations:
 * 1. Groups measurements by Pacific timezone hour
 * 2. Calculates average wind speed (all measurements)
 * 3. Calculates maximum gust speed (critical for safety)
 * 4. Calculates average direction, temperature, pressure
 * 5. Converts from m/s to knots
 * 6. Rounds to appropriate precision (1 decimal for speeds, integer for direction)
 *
 * @param measurements - Array of raw NOAA measurements (6-minute intervals)
 * @returns Array of hourly aggregated WindDataPoint objects, sorted by timestamp
 */
export function convertToHourlyWindData(measurements: RawWindMeasurement[]): WindDataPoint[] {
  const hourlyGroups: Map<string, RawWindMeasurement[]> = new Map();

  // Group measurements by Pacific timezone hour
  measurements.forEach(measurement => {
    // Create proper UTC date from GMT components
    const gmtDate = new Date(Date.UTC(
      measurement.year,
      measurement.month - 1,
      measurement.day,
      measurement.hour,
      measurement.minute
    ));

    // Format to Pacific timezone date-hour key: "2025-12-04-13"
    const dateKey = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
    const hourKey = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'HH');
    const groupKey = `${dateKey}-${hourKey}`;

    if (!hourlyGroups.has(groupKey)) {
      hourlyGroups.set(groupKey, []);
    }
    hourlyGroups.get(groupKey)!.push(measurement);
  });

  // Convert each hourly group to a WindDataPoint
  const dataPoints: WindDataPoint[] = [];

  hourlyGroups.forEach((hourMeasurements, groupKey) => {
    if (hourMeasurements.length === 0) return;

    const [dateKey, hourStr] = groupKey.split('-').slice(0, 4).join('-').split(/-(?=\d{2}$)/);
    const hour = parseInt(hourStr);

    // Calculate averages and maximums
    const windSpeeds = hourMeasurements.map(m => m.windSpeed!);
    const gustSpeeds = hourMeasurements.filter(m => m.gustSpeed !== null).map(m => m.gustSpeed!);
    const directions = hourMeasurements.map(m => m.windDirection!);
    const pressures = hourMeasurements.filter(m => m.pressure !== null && m.pressure > 0).map(m => m.pressure!);
    const temps = hourMeasurements.filter(m => m.airTemp !== null && m.airTemp !== 0).map(m => m.airTemp!);

    const avgWindSpeed = windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length;
    const maxGust = gustSpeeds.length > 0 ? Math.max(...gustSpeeds) : 0;
    const avgDirection = directions.reduce((a, b) => a + b, 0) / directions.length;
    const avgPressure = pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : 0;
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;

    // Convert to knots
    const windSpeedKt = avgWindSpeed * MS_TO_KNOTS;
    const gustSpeedKt = maxGust * MS_TO_KNOTS;

    // Create timestamp for this hour
    const firstMeasurement = hourMeasurements[0];
    const gmtDate = new Date(Date.UTC(
      firstMeasurement.year,
      firstMeasurement.month - 1,
      firstMeasurement.day,
      firstMeasurement.hour,
      firstMeasurement.minute
    ));

    // Get Pacific time and set to beginning of hour
    const pacificTimestamp = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, "yyyy-MM-dd'T'HH:00:00XXX");

    dataPoints.push({
      timestamp: pacificTimestamp,
      date: dateKey,
      time: `${hourStr}:00`,
      hour,
      windSpeed: Math.round(windSpeedKt * 10) / 10,
      gustSpeed: Math.round(gustSpeedKt * 10) / 10,
      windDirection: Math.round(avgDirection),
      windDirectionText: getWindDirectionText(Math.round(avgDirection)),
      temperature: Math.round(avgTemp * 10) / 10,
      pressure: Math.round(avgPressure * 10) / 10,
      sampleCount: hourMeasurements.length,
    });
  });

  // Sort by timestamp
  return dataPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Parse raw NOAA text data into structured measurements
 *
 * Parses the standard NOAA 5-day text format from buoy stations.
 * Format: YY MM DD hh mm WDIR WSPD GST ... PRES ATMP WTMP ...
 *
 * @param text - Raw NOAA text data (multi-line format)
 * @returns Array of parsed RawWindMeasurement objects
 */
export function parseNoaaData(text: string): RawWindMeasurement[] {
  const lines = text.split('\n');
  const measurements: RawWindMeasurement[] = [];

  // Skip header lines (first 2 lines)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 19) continue;

    try {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      const hour = parseInt(parts[3]);
      const minute = parseInt(parts[4]);

      // Skip if any timestamp part is invalid
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        continue;
      }

      // Parse wind data (skip if MM - missing data)
      const windDirection = parts[5] === 'MM' ? null : parseFloat(parts[5]);
      const windSpeed = parts[6] === 'MM' ? null : parseFloat(parts[6]);
      const gustSpeed = parts[7] === 'MM' ? null : parseFloat(parts[7]);
      const pressure = parts[12] === 'MM' ? null : parseFloat(parts[12]);
      const airTemp = parts[13] === 'MM' ? null : parseFloat(parts[13]);
      const waterTemp = parts[14] === 'MM' ? null : parseFloat(parts[14]);

      // Only include records with valid wind data (essential parameters)
      if (windDirection !== null && windSpeed !== null) {
        measurements.push({
          year,
          month,
          day,
          hour,
          minute,
          windDirection,
          windSpeed,
          gustSpeed: gustSpeed || 0,
          pressure: pressure || 0,
          airTemp: airTemp || 0,
          waterTemp: waterTemp || 0,
        });
      }
    } catch (error) {
      // Skip malformed lines
      continue;
    }
  }

  return measurements;
}

/**
 * Filter hourly wind data to forecast window (10 AM - 6 PM PST)
 *
 * This is the time window used for:
 * - Wind forecasting predictions
 * - Forecast vs. actual comparisons
 * - Wind actuals storage
 *
 * @param dataPoints - Array of hourly wind data points
 * @returns Filtered array containing only hours 10-18 (10 AM - 6 PM)
 */
export function filterToForecastWindow(dataPoints: WindDataPoint[]): WindDataPoint[] {
  return dataPoints.filter(point => point.hour >= 10 && point.hour <= 18);
}
