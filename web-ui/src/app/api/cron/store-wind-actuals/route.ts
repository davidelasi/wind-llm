/**
 * Daily Wind Actuals Storage Cron Job
 *
 * Scheduled to run at 2 AM PST (10 AM UTC) via Vercel cron.
 * Automatically stores previous day's hourly wind actuals (10 AM - 6 PM PST).
 * Also supports manual trigger via `?manual=true` (no auth) for debugging.
 *
 * Authentication: Vercel sends Authorization: Bearer ${CRON_SECRET} for cron jobs.
 *
 * @module cron/store-wind-actuals
 */

import { NextRequest, NextResponse } from 'next/server';
import { storeWindActuals } from '@/lib/services/wind-actuals-storage';
import { parseNoaaData, convertToHourlyWindData, filterToForecastWindow } from '@/lib/services/wind-aggregation';

const NOAA_DATA_URL = 'https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt';

/**
 * Daily cron job to store actual hourly wind data
 *
 * Runs at 2 AM PST daily, storing previous day's wind actuals.
 * This timing ensures NOAA data for the previous day is finalized.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron authorization using CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const manualTrigger = new URL(request.url).searchParams.get('manual') === 'true';
    const isProduction = process.env.NODE_ENV === 'production';

    // In production: require valid cron secret OR manual trigger for debugging
    // In development: allow all requests
    const isAuthorized = isProduction
      ? (authHeader === `Bearer ${cronSecret}` || manualTrigger)
      : true;

    if (!isAuthorized) {
      console.warn('[CRON] Unauthorized wind actuals storage attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[CRON] Starting daily wind actuals storage...');

    // Calculate yesterday's date in PST
    const nowPST = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles'
    });
    const yesterday = new Date(nowPST);
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`[CRON] Processing wind actuals for date: ${targetDate}`);

    // Fetch raw NOAA data for yesterday
    console.log(`[CRON] Fetching NOAA data from: ${NOAA_DATA_URL}`);
    const noaaResponse = await fetch(NOAA_DATA_URL, {
      next: { revalidate: 0 }  // No cache, always fresh
    });

    if (!noaaResponse.ok) {
      throw new Error(`NOAA fetch failed: ${noaaResponse.status} ${noaaResponse.statusText}`);
    }

    const noaaData = await noaaResponse.text();
    console.log(`[CRON] Fetched NOAA data: ${noaaData.length} characters`);

    // Parse NOAA data
    const rawMeasurements = parseNoaaData(noaaData);
    console.log(`[CRON] Parsed ${rawMeasurements.length} raw measurements`);

    // Filter to yesterday's data
    const yesterdayMeasurements = rawMeasurements.filter(m => {
      const measurementDate = new Date(Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute));
      const measurementDatePST = measurementDate.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles'
      });
      const datePST = new Date(measurementDatePST).toISOString().split('T')[0];
      return datePST === targetDate;
    });

    console.log(`[CRON] Found ${yesterdayMeasurements.length} measurements for ${targetDate}`);

    if (yesterdayMeasurements.length === 0) {
      console.warn(`[CRON] No NOAA data available for ${targetDate}`);
      return NextResponse.json({
        success: false,
        message: `No NOAA data available for ${targetDate}`,
        date: targetDate,
        willRetry: 'Next scheduled run (1 AM PST tomorrow)'
      }, { status: 503 });
    }

    // Convert to hourly aggregates
    const hourlyData = convertToHourlyWindData(yesterdayMeasurements);
    console.log(`[CRON] Aggregated to ${hourlyData.length} hourly data points`);

    // Filter to forecast window (10 AM - 6 PM)
    const forecastWindowData = filterToForecastWindow(hourlyData);
    console.log(`[CRON] Filtered to ${forecastWindowData.length} hours (10 AM - 6 PM)`);

    if (forecastWindowData.length === 0) {
      console.warn(`[CRON] No data in forecast window (10 AM - 6 PM) for ${targetDate}`);
      return NextResponse.json({
        success: false,
        message: `No data in forecast window for ${targetDate}`,
        date: targetDate,
        note: 'This may be expected for days with limited data coverage'
      });
    }

    // Store to database
    const storedCount = await storeWindActuals(forecastWindowData);

    console.log(`[CRON] Successfully stored ${storedCount} hourly records for ${targetDate}`);

    return NextResponse.json({
      success: true,
      message: `Stored ${storedCount} hourly wind actuals`,
      date: targetDate,
      hoursStored: storedCount,
      hourRange: '10 AM - 6 PM PST',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CRON] Failed to store wind actuals:', error);

    if (error instanceof Error) {
      console.error('[CRON] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3)
      });
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      willRetry: 'Next scheduled run (1 AM PST tomorrow)'
    }, { status: 500 });
  }
}
