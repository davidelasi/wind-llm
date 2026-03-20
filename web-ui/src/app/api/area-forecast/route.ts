import { NextResponse } from 'next/server';
import {
  ProcessedForecast,
  extractInnerWatersForecast,
  extractWarnings,
  convertPeriodsToRelative,
  truncateForecastAtDay
} from '@/lib/forecast-utils';

interface ApiResponse {
  success: boolean;
  data?: ProcessedForecast;
  error?: string;
  debug?: any;
}

const FETCH_TIMEOUT_MS = 8000;

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function GET() {
  const debugInfo: any = {};

  try {
    // Fetch area forecast from NWS
    console.log('Fetching area forecast from NWS...');

    const response = await fetchWithTimeout('https://tgftp.nws.noaa.gov/data/raw/fz/fzus56.klox.cwf.lox.txt', {
      headers: {
        'User-Agent': 'Wind-Forecast-App/1.0'
      }
    }, FETCH_TIMEOUT_MS);

    debugInfo.responseStatus = response.status;
    debugInfo.responseHeaders = Object.fromEntries(response.headers.entries());

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData = await response.text();
    debugInfo.rawDataLength = rawData.length;
    debugInfo.rawDataPreview = rawData.substring(0, 500);

    console.log('Raw forecast data received:', rawData.substring(0, 200) + '...');

    // Extract Inner Waters forecast
    const innerWatersForecast = extractInnerWatersForecast(rawData);
    if (!innerWatersForecast) {
      throw new Error('Could not find Inner Waters forecast in the data');
    }

    debugInfo.innerWatersFound = true;
    debugInfo.innerWatersLength = innerWatersForecast.length;

    // Process the forecast (convert periods, extract warnings, etc.)
    const processedData = processForecast(innerWatersForecast);

    return NextResponse.json({
      success: true,
      data: processedData,
      debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
    });

  } catch (error) {
    console.error('Error processing area forecast:', error);
    console.error('Debug info:', debugInfo);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process area forecast',
        message: error instanceof Error ? error.message : 'Unknown error',
        debug: {
          ...debugInfo,
          errorStack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Parse the issuance time printed in the forecast header.
 * Handles formats like "646 AM PDT Fri Mar 20 2026" or "1200 PM PST Mon Jan 05 2026".
 * Falls back to current time if parsing fails.
 */
function extractIssuanceTime(forecastText: string): { date: Date; iso: string } {
  const match = forecastText.match(/^(\d{3,4})\s+(AM|PM)\s+(P[DS]T)\s+\w+\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/m);
  if (match) {
    const [, timeStr, ampm, tz, mon, day, year] = match;
    const hours = timeStr.length === 3 ? parseInt(timeStr[0]) : parseInt(timeStr.slice(0, 2));
    const minutes = parseInt(timeStr.slice(-2));
    let h24 = hours;
    if (ampm === 'AM' && hours === 12) h24 = 0;
    if (ampm === 'PM' && hours !== 12) h24 = hours + 12;
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const offset = tz === 'PDT' ? '-07:00' : '-08:00';
    const iso = `${year}-${months[mon] ?? '01'}-${day.padStart(2, '0')}T${String(h24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${offset}`;
    return { date: new Date(iso), iso };
  }
  const now = new Date();
  return { date: now, iso: now.toISOString() };
}

function processForecast(forecastText: string): ProcessedForecast {
  const { date: forecastTime, iso: issuedTime } = extractIssuanceTime(forecastText);

  // Extract warnings
  const warnings = extractWarnings(forecastText);

  // Convert day-of-week periods to relative format
  let processedText = convertPeriodsToRelative(forecastText, forecastTime);

  // Truncate at D4 (keep only D0-D4, remove D5+)
  processedText = truncateForecastAtDay(processedText, 4);

  return {
    processed: processedText,
    original: forecastText,
    issuedTime,
    warnings
  };
}
