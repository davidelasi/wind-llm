import { NextResponse } from 'next/server';

interface WindData {
  datetime: string;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

export async function GET() {
  let debugInfo: any = {};

  try {
    // Fetch latest wind data from NOAA AGXC1 station
    console.log('Fetching data from NOAA AGXC1...');
    const response = await fetch('https://www.ndbc.noaa.gov/data/latest_obs/agxc1.txt', {
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

    console.log('Raw data received:', rawData.substring(0, 200) + '...');

    const lines = rawData.trim().split('\n');
    debugInfo.totalLines = lines.length;
    debugInfo.allLines = lines;

    console.log(`Total lines: ${lines.length}`);
    console.log('All lines:', lines);

    if (lines.length < 2) {
      throw new Error(`Not enough data lines. Expected at least 2 (header + data), got ${lines.length}`);
    }

    // Skip header lines and get the latest data
    const dataLine = lines[lines.length - 1];
    debugInfo.dataLine = dataLine;

    console.log('Data line:', dataLine);

    const parts = dataLine.split(/\s+/);
    debugInfo.partsCount = parts.length;
    debugInfo.allParts = parts;

    console.log(`Parts count: ${parts.length}`, parts);

    if (parts.length < 15) {
      throw new Error(`Invalid data format. Expected at least 15 columns, got ${parts.length}. Data line: "${dataLine}". Parts: [${parts.join(', ')}]`);
    }

    // Parse the wind data according to NOAA format
    // Format: YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS TIDE
    console.log('Parsing wind data...');

    const windData: WindData = {
      datetime: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T${parts[3].padStart(2, '0')}:${parts[4].padStart(2, '0')}:00Z`,
      windDirection: parseFloat(parts[5]) || 0,
      windSpeed: parseFloat(parts[6]) || 0,
      gustSpeed: parseFloat(parts[7]) || 0,
      pressure: parseFloat(parts[12]) || 0,
      airTemp: parseFloat(parts[13]) || 0,
      waterTemp: parseFloat(parts[14]) || 0
    };

    debugInfo.parsedData = { ...windData };

    // Handle invalid/missing data (NOAA uses 99.0 or MM for missing data)
    if (windData.windDirection === 99 || isNaN(windData.windDirection)) windData.windDirection = 0;
    if (windData.windSpeed >= 99 || isNaN(windData.windSpeed)) windData.windSpeed = 0;
    if (windData.gustSpeed >= 99 || isNaN(windData.gustSpeed)) windData.gustSpeed = 0;
    if (windData.pressure >= 999 || isNaN(windData.pressure)) windData.pressure = 0;
    if (windData.airTemp >= 99 || isNaN(windData.airTemp)) windData.airTemp = 0;
    if (windData.waterTemp >= 99 || isNaN(windData.waterTemp)) windData.waterTemp = 0;

    // Convert wind speed from m/s to knots (1 m/s = 1.944 knots)
    windData.windSpeed = Math.round(windData.windSpeed * 1.944 * 10) / 10;
    windData.gustSpeed = Math.round(windData.gustSpeed * 1.944 * 10) / 10;

    // Convert air and water temp from Celsius to Fahrenheit (if valid)
    if (windData.airTemp > 0) {
      windData.airTemp = Math.round((windData.airTemp * 9/5 + 32) * 10) / 10;
    }
    if (windData.waterTemp > 0) {
      windData.waterTemp = Math.round((windData.waterTemp * 9/5 + 32) * 10) / 10;
    }

    debugInfo.finalData = windData;

    console.log('Successfully processed wind data:', windData);

    return NextResponse.json({
      success: true,
      data: windData,
      station: 'AGXC1',
      location: 'Los Angeles, CA',
      lastUpdated: new Date().toISOString(),
      debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
    });

  } catch (error) {
    console.error('Error fetching wind data:', error);
    console.error('Debug info:', debugInfo);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch wind data',
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