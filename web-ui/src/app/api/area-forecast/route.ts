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

function processForecast(forecastText: string): ProcessedForecast {
  // Use current system time as forecast reference point
  // The forecast is fetched in real-time, so "now" is the most accurate reference
  const forecastTime = new Date();
  const issuedTime = forecastTime.toISOString();

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
