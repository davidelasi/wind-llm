/**
 * Unified Wind History API Endpoint
 *
 * This endpoint consolidates the functionality of /api/five-day-wind and /api/station-history
 * into a single, consistent API with unified data format and timezone handling.
 *
 * @returns WindHistoryResponse with standardized data structure
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { format } from 'date-fns';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';
import { fileCache, createEtagCache } from '../../../../lib/cache/file-cache';
import { convertToHourlyWindData, getWindDirectionText } from '@/lib/services/wind-aggregation';
import type { WindHistoryResponse, DayData, WindDataPoint, DaySummary, RawWindMeasurement } from '@/types/wind-data';

// Constants
const MS_TO_KNOTS = 1.94384;
const NOAA_DATA_URL = 'https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt';
const STATION_ID = 'AGXC1';
const LOCATION = 'Los Angeles, CA';


/**
 * Parse raw NOAA text data into structured measurements
 */
function parseNoaaData(text: string): RawWindMeasurement[] {
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
 * Convert raw measurements to wind data points with timezone handling
 */
function convertToWindDataPoints(measurements: RawWindMeasurement[]): WindDataPoint[] {
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
    const pacificTimestamp = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, "yyyy-MM-dd'T'HH':00:00XXX'");
    const timeStr = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'HH:mm');

    dataPoints.push({
      timestamp: pacificTimestamp.replace("XXX'", "XXX"),
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
 * Convert raw 6-minute measurements to WindDataPoint format
 * WITHOUT hourly aggregation (preserves original cadence)
 */
function convertRawToDataPoints(measurements: RawWindMeasurement[]): WindDataPoint[] {
  const dataPoints: WindDataPoint[] = [];

  measurements.forEach(measurement => {
    // Create proper UTC date from GMT components
    const gmtDate = new Date(Date.UTC(
      measurement.year,
      measurement.month - 1,
      measurement.day,
      measurement.hour,
      measurement.minute
    ));

    // Format to Pacific timezone
    const pacificTimestamp = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
    const dateKey = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
    const timeStr = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'HH:mm');
    const hour = parseInt(formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, 'HH'));

    // Convert wind speeds from m/s to knots
    const windSpeedKt = measurement.windSpeed! * MS_TO_KNOTS;
    const gustSpeedKt = (measurement.gustSpeed || 0) * MS_TO_KNOTS;

    dataPoints.push({
      timestamp: pacificTimestamp,
      date: dateKey,
      time: timeStr,
      hour,
      windSpeed: Math.round(windSpeedKt * 10) / 10,
      gustSpeed: Math.round(gustSpeedKt * 10) / 10,
      windDirection: Math.round(measurement.windDirection!),
      windDirectionText: getWindDirectionText(Math.round(measurement.windDirection!)),
      temperature: Math.round((measurement.airTemp || 0) * 10) / 10,
      pressure: Math.round((measurement.pressure || 0) * 10) / 10,
      sampleCount: 1, // Single 6-minute sample
    });
  });

  // Sort by timestamp
  return dataPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * Group wind data points by day
 */
function groupByDay(dataPoints: WindDataPoint[]): DayData[] {
  const dayGroups: Map<string, WindDataPoint[]> = new Map();

  // Group by date key
  dataPoints.forEach(point => {
    if (!dayGroups.has(point.date)) {
      dayGroups.set(point.date, []);
    }
    dayGroups.get(point.date)!.push(point);
  });

  // Convert to DayData array
  const days: DayData[] = [];

  dayGroups.forEach((hourlyData, dateKey) => {
    // Calculate summary statistics
    const summary = calculateDaySummary(hourlyData);

    // Format display date
    const date = new Date(dateKey + 'T12:00:00');
    const displayDate = format(date, 'MMM dd, yyyy');

    days.push({
      date: dateKey,
      displayDate,
      hourlyData: hourlyData.sort((a, b) => a.hour - b.hour),
      summary,
    });
  });

  // Sort by date (newest first)
  return days.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Calculate summary statistics for a day
 */
function calculateDaySummary(hourlyData: WindDataPoint[]): DaySummary {
  if (hourlyData.length === 0) {
    return {
      avgWindSpeed: 0,
      maxWindSpeed: 0,
      avgGustSpeed: 0,
      maxGustSpeed: 0,
      avgDirection: 0,
      primaryDirectionText: 'N',
      avgTemperature: 0,
      avgPressure: 0,
      dataPoints: 0,
    };
  }

  const windSpeeds = hourlyData.map(h => h.windSpeed);
  const gustSpeeds = hourlyData.map(h => h.gustSpeed);
  const directions = hourlyData.map(h => h.windDirection);
  const temps = hourlyData.filter(h => h.temperature !== 0).map(h => h.temperature);
  const pressures = hourlyData.filter(h => h.pressure !== 0).map(h => h.pressure);

  const avgWindSpeed = windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length;
  const maxWindSpeed = Math.max(...windSpeeds);
  const avgGustSpeed = gustSpeeds.reduce((a, b) => a + b, 0) / gustSpeeds.length;
  const maxGustSpeed = Math.max(...gustSpeeds);
  const avgDirection = directions.reduce((a, b) => a + b, 0) / directions.length;
  const avgTemperature = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
  const avgPressure = pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : 0;

  // Calculate primary direction
  const directionCounts: { [key: string]: number } = {};
  hourlyData.forEach(h => {
    const dir = h.windDirectionText;
    directionCounts[dir] = (directionCounts[dir] || 0) + 1;
  });
  const primaryDirectionText = Object.entries(directionCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N';

  return {
    avgWindSpeed: Math.round(avgWindSpeed * 10) / 10,
    maxWindSpeed: Math.round(maxWindSpeed * 10) / 10,
    avgGustSpeed: Math.round(avgGustSpeed * 10) / 10,
    maxGustSpeed: Math.round(maxGustSpeed * 10) / 10,
    avgDirection: Math.round(avgDirection),
    primaryDirectionText,
    avgTemperature: Math.round(avgTemperature * 10) / 10,
    avgPressure: Math.round(avgPressure * 10) / 10,
    dataPoints: hourlyData.length,
  };
}

/**
 * GET handler for wind history API with file caching
 */
export async function GET(request: NextRequest) {
  try {
    // Extract query parameter for granularity
    const { searchParams } = new URL(request.url);
    const granularity = searchParams.get('granularity') || 'hourly';

    // Create cache key based on current hour and granularity
    const now = new Date();
    const hourKey = formatInTimeZone(now, PACIFIC_TIMEZONE, 'yyyy-MM-dd-HH');
    const cacheKey = `wind-history-${granularity}-${hourKey}`;

    console.log('[WIND-HISTORY] Cache key:', cacheKey, '| Granularity:', granularity);

    // Try ETag cache first for HTTP conditional requests
    try {
      const { data, etag, cached } = await createEtagCache<WindHistoryResponse>(
        fileCache,
        cacheKey,
        60 * 60 * 1000 // 1 hour cache
      )(
        request,
        async () => {
          console.log('[WIND-HISTORY] Cache miss, fetching fresh data...');

          const startTime = Date.now();

          // Fetch raw data from NOAA
          const response = await fetch(NOAA_DATA_URL, {
            headers: {
              'User-Agent': 'Wind Forecast LLM (david@example.com)',
            },
          });

          if (!response.ok) {
            throw new Error(`NOAA API responded with status: ${response.status}`);
          }

          const rawText = await response.text();
          console.log('[WIND-HISTORY] Raw data received:', rawText.length, 'bytes');

          // Parse and process data
          const measurements = parseNoaaData(rawText);
          console.log('[WIND-HISTORY] Parsed measurements:', measurements.length);

          if (measurements.length === 0) {
            throw new Error('No valid wind data measurements found');
          }

          // Convert to wind data points based on granularity
          let dataPoints: WindDataPoint[];
          if (granularity === '6min') {
            // NEW: Return raw 6-minute data without aggregation
            dataPoints = convertRawToDataPoints(measurements);
            console.log('[WIND-HISTORY] Converted to 6-minute data points:', dataPoints.length);
          } else {
            // EXISTING: Hourly aggregation using shared service
            dataPoints = convertToHourlyWindData(measurements);
            console.log('[WIND-HISTORY] Converted to hourly data points:', dataPoints.length);
          }

          // Group by day
          const days = groupByDay(dataPoints);
          console.log('[WIND-HISTORY] Grouped into days:', days.length);

          // Calculate metadata
          const dateRange = {
            start: days[days.length - 1]?.date || '',
            end: days[0]?.date || '',
          };

          const processingTime = Date.now() - startTime;
          console.log('[WIND-HISTORY] Fresh data processed in', processingTime, 'ms');

          // Return unified response structure
          return {
            success: true,
            data: days,
            metadata: {
              station: STATION_ID,
              location: LOCATION,
              lastUpdated: new Date().toISOString(),
              timezone: PACIFIC_TIMEZONE,
              dateRange,
              totalHours: dataPoints.length,
              totalDays: days.length,
            },
          } as WindHistoryResponse;
        }
      );

      // If ETag matched, this will throw { status: 304, etag }
      // Otherwise return cached or fresh data with ETag header

      console.log(`[WIND-HISTORY] ${cached ? 'CACHED' : 'FRESH'} data served`);

      return NextResponse.json(data, {
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=300', // Browser cache for 5 minutes
        },
      });

    } catch (etagError: any) {
      // Handle conditional request - return 304 Not Modified
      if (etagError.status === 304) {
        console.log('[WIND-HISTORY] Conditionally cached via ETag');
        return new Response(null, {
          status: 304,
          headers: {
            'ETag': etagError.etag,
          },
        });
      }
      // Re-throw if not an ETag error
      throw etagError;
    }

  } catch (error) {
    console.error('[WIND-HISTORY] Error:', error);

    const errorResponse: WindHistoryResponse = {
      success: false,
      data: [],
      metadata: {
        station: STATION_ID,
        location: LOCATION,
        lastUpdated: new Date().toISOString(),
        timezone: PACIFIC_TIMEZONE,
        dateRange: { start: '', end: '' },
        totalHours: 0,
        totalDays: 0,
      },
      error: 'Failed to fetch wind history',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
