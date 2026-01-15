/**
 * Manual Wind Actuals Storage API
 *
 * POST endpoint for manually triggering wind actuals storage.
 * Useful for testing, debugging, and manual backfill.
 *
 * Query parameters:
 *   ?date=YYYY-MM-DD  (optional, defaults to yesterday)
 *
 * Example: POST /api/wind-actuals/store?date=2025-12-04
 *
 * @module wind-actuals/store
 */

import { NextRequest, NextResponse } from 'next/server';
import { storeWindActuals } from '@/lib/services/wind-actuals-storage';
import { parseNoaaData, convertToHourlyWindData, filterToForecastWindow } from '@/lib/services/wind-aggregation';

const NOAA_DATA_URL = 'https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt';

/**
 * Manual trigger for wind actuals storage
 *
 * Fetches NOAA data for a specific date and stores hourly wind actuals (10 AM - 6 PM PST)
 */
export async function POST(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    // Default to yesterday if no date specified
    let targetDate: string;
    if (dateParam) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }
      targetDate = dateParam;
    } else {
      // Default to yesterday in PST
      const nowPST = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles'
      });
      const yesterday = new Date(nowPST);
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`[WIND-ACTUALS-STORE] Manual trigger for date: ${targetDate}`);

    // Fetch NOAA data
    console.log(`[WIND-ACTUALS-STORE] Fetching NOAA data from: ${NOAA_DATA_URL}`);
    const noaaResponse = await fetch(NOAA_DATA_URL, {
      next: { revalidate: 0 }  // No cache, always fresh
    });

    if (!noaaResponse.ok) {
      throw new Error(`NOAA fetch failed: ${noaaResponse.status} ${noaaResponse.statusText}`);
    }

    const noaaData = await noaaResponse.text();
    console.log(`[WIND-ACTUALS-STORE] Fetched NOAA data: ${noaaData.length} characters`);

    // Parse NOAA data
    const rawMeasurements = parseNoaaData(noaaData);
    console.log(`[WIND-ACTUALS-STORE] Parsed ${rawMeasurements.length} raw measurements`);

    // Filter to target date
    const dateMeasurements = rawMeasurements.filter(m => {
      const measurementDate = new Date(Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute));
      const measurementDatePST = measurementDate.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles'
      });
      const datePST = new Date(measurementDatePST).toISOString().split('T')[0];
      return datePST === targetDate;
    });

    console.log(`[WIND-ACTUALS-STORE] Found ${dateMeasurements.length} measurements for ${targetDate}`);

    if (dateMeasurements.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No NOAA data available for ${targetDate}`,
        date: targetDate
      }, { status: 404 });
    }

    // Aggregate to hourly data
    const hourlyData = convertToHourlyWindData(dateMeasurements);
    console.log(`[WIND-ACTUALS-STORE] Aggregated to ${hourlyData.length} hourly data points`);

    // Filter to forecast window (10 AM - 6 PM)
    const forecastWindowData = filterToForecastWindow(hourlyData);
    console.log(`[WIND-ACTUALS-STORE] Filtered to ${forecastWindowData.length} hours (10 AM - 6 PM)`);

    if (forecastWindowData.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No data in forecast window (10 AM - 6 PM) for ${targetDate}`,
        date: targetDate
      }, { status: 404 });
    }

    // Store to database
    const storedCount = await storeWindActuals(forecastWindowData);

    console.log(`[WIND-ACTUALS-STORE] Successfully stored ${storedCount} records for ${targetDate}`);

    return NextResponse.json({
      success: true,
      message: `Stored ${storedCount} hourly wind actuals`,
      date: targetDate,
      hoursStored: storedCount,
      hourRange: '10 AM - 6 PM PST',
      data: forecastWindowData.map(point => ({
        hour: point.hour,
        time: point.time,
        windSpeed: point.windSpeed,
        gustSpeed: point.gustSpeed,
        windDirection: point.windDirection,
        windDirectionText: point.windDirectionText,
        temperature: point.temperature,
        pressure: point.pressure,
        sampleCount: point.sampleCount
      }))
    });

  } catch (error) {
    console.error('[WIND-ACTUALS-STORE] Failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
