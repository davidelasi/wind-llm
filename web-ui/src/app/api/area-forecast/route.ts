import { NextResponse } from 'next/server';

interface ProcessedForecast {
  processed: string;
  original: string;
  issuedTime: string;
  warnings: string[];
}

interface ApiResponse {
  success: boolean;
  data?: ProcessedForecast;
  error?: string;
  debug?: any;
}

export async function GET() {
  const debugInfo: any = {};

  try {
    // Fetch area forecast from NWS
    console.log('Fetching area forecast from NWS...');

    const response = await fetch('https://tgftp.nws.noaa.gov/data/raw/fz/fzus56.klox.cwf.lox.txt', {
      headers: {
        'User-Agent': 'Wind-Forecast-App/1.0'
      }
    });

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

function extractInnerWatersForecast(content: string): string | null {
  // Split content by forecast delimiter
  const forecastBlocks = content.split('$$');

  // Find the block containing Inner Waters forecast
  for (let i = 0; i < forecastBlocks.length; i++) {
    const block = forecastBlocks[i];
    if (block.includes('Inner waters from Point Mugu to San Mateo Pt. CA including Santa')) {
      // Add back the $$ delimiter (except for the last block)
      return i < forecastBlocks.length - 1 ? block + '$$' : block;
    }
  }

  return null;
}

function processForecast(forecastText: string): ProcessedForecast {
  // Extract timestamp and calculate issue time
  const timestampMatch = forecastText.match(/(\d{6})/);
  let issuedTime = 'Unknown';
  let forecastTime: Date = new Date();

  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const day = parseInt(timestamp.substring(0, 2));
    const hour = parseInt(timestamp.substring(2, 4));
    const minute = parseInt(timestamp.substring(4, 6));

    const now = new Date();
    forecastTime = new Date(now.getFullYear(), now.getMonth(), day, hour, minute);
    issuedTime = forecastTime.toISOString();
  }

  // Extract warnings
  const warnings = extractWarnings(forecastText);

  // Convert day-of-week periods to relative format
  const processedText = convertPeriodsToRelative(forecastText, forecastTime);

  return {
    processed: processedText,
    original: forecastText,
    issuedTime,
    warnings
  };
}

function extractWarnings(text: string): string[] {
  const warnings: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();

    // Check for various warning types
    if (trimmedLine.includes('SMALL CRAFT ADVISORY') ||
        trimmedLine.includes('GALE WARNING') ||
        trimmedLine.includes('STORM WARNING') ||
        trimmedLine.includes('HURRICANE WARNING') ||
        trimmedLine.includes('DENSE FOG ADVISORY') ||
        trimmedLine.includes('HIGH SURF ADVISORY')) {
      warnings.push(line.trim());
    }
  }

  return warnings;
}

function convertPeriodsToRelative(text: string, forecastTime: Date): string {
  const forecastDate = forecastTime.getDate();
  const forecastMonth = forecastTime.getMonth();
  const forecastYear = forecastTime.getFullYear();

  // Calculate period mappings
  const periodMappings = calculatePeriodDates(forecastTime);

  let processedText = text;

  // Convert periods to relative format
  for (const [period, dayOffset] of Object.entries(periodMappings)) {
    const relativeDay = `D${dayOffset}`;

    // Handle night periods
    if (period.includes('NIGHT')) {
      const dayPart = period.replace(' NIGHT', '');
      processedText = processedText.replace(
        new RegExp(`\\.${period}\\b`, 'gi'),
        `.${relativeDay}_NIGHT`
      );
    } else {
      // Handle day periods
      if (period === 'TODAY') {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_DAY`
        );
      } else if (period === 'TONIGHT') {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_NIGHT`
        );
      } else {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_DAY`
        );
      }
    }
  }

  return processedText;
}

function calculatePeriodDates(forecastTime: Date): Record<string, number> {
  const mappings: Record<string, number> = {};
  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // D0 is always the forecast issuance date
  mappings['TODAY'] = 0;
  mappings['TONIGHT'] = 0;

  // Calculate next 7 days and their weekday names
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const futureDate = new Date(forecastTime);
    futureDate.setDate(forecastTime.getDate() + dayOffset);
    const weekdayName = weekdays[futureDate.getDay()];

    mappings[weekdayName] = dayOffset;
    mappings[`${weekdayName} NIGHT`] = dayOffset;
  }

  return mappings;
}