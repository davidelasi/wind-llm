import { NextResponse } from 'next/server';

interface NoaaWindData {
  timestamp: string;
  windSpeed: number;
  windSpeedUnit: string;
  windDirection: number;
  windGust: number | null;
  windGustUnit: string | null;
}

interface NoaaApiResponse {
  success: boolean;
  data?: NoaaWindData;
  station?: string;
  location?: string;
  error?: string;
  message?: string;
  debug?: any;
}

export async function GET() {
  const debugInfo: any = {};

  try {
    // Fetch latest observations from NOAA API
    console.log('Fetching NOAA observations from JSON API...');

    const response = await fetch('https://api.weather.gov/stations/AGXC1/observations/latest', {
      headers: {
        'User-Agent': 'https://wind-la.vercel.app/ Contact:davide.lasi@gmail.com',
        'Accept': 'application/json'
      }
    });

    debugInfo.responseStatus = response.status;
    debugInfo.responseHeaders = Object.fromEntries(response.headers.entries());

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const jsonData = await response.json();
    debugInfo.rawResponseKeys = Object.keys(jsonData);
    debugInfo.propertiesKeys = jsonData.properties ? Object.keys(jsonData.properties) : null;

    console.log('NOAA API response received');
    console.log('Properties keys:', debugInfo.propertiesKeys);

    // Debug wind unit codes
    if (jsonData.properties) {
      debugInfo.windSpeedUnit = jsonData.properties.windSpeed?.unitCode;
      debugInfo.windGustUnit = jsonData.properties.windGust?.unitCode;
      console.log('Wind speed unit code:', debugInfo.windSpeedUnit);
      console.log('Wind gust unit code:', debugInfo.windGustUnit);
    }

    if (!jsonData.properties) {
      throw new Error('No properties object found in API response');
    }

    const properties = jsonData.properties;

    // Extract wind data from properties
    const windData = extractWindData(properties);
    debugInfo.extractedWindData = windData;

    if (!windData.timestamp) {
      throw new Error('No timestamp found in observation data');
    }

    return NextResponse.json({
      success: true,
      data: windData,
      station: 'AGXC1',
      location: 'Los Angeles, CA',
      debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
    });

  } catch (error) {
    console.error('Error fetching NOAA observations:', error);
    console.error('Debug info:', debugInfo);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch NOAA observations',
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

function extractWindData(properties: any): NoaaWindData {
  // Extract timestamp
  const timestamp = properties.timestamp || '';

  // Extract wind speed
  let windSpeed = 0;
  let windSpeedUnit = 'kt';

  if (properties.windSpeed && properties.windSpeed.value !== null) {
    windSpeed = properties.windSpeed.value;
    windSpeedUnit = properties.windSpeed.unitCode ?
      parseUnitCode(properties.windSpeed.unitCode) : 'kt';

    // Convert to knots if needed
    if (windSpeedUnit === 'm/s') {
      windSpeed = Math.round(windSpeed * 1.944 * 10) / 10;
      windSpeedUnit = 'kt';
    } else if (windSpeedUnit === 'km/h') {
      windSpeed = Math.round(windSpeed * 0.539957 * 10) / 10;
      windSpeedUnit = 'kt';
    } else if (windSpeedUnit === 'mph') {
      windSpeed = Math.round(windSpeed * 0.868976 * 10) / 10;
      windSpeedUnit = 'kt';
    }
  }

  // Extract wind direction
  let windDirection = 0;
  if (properties.windDirection && properties.windDirection.value !== null) {
    windDirection = properties.windDirection.value;
  }

  // Extract wind gust
  let windGust: number | null = null;
  let windGustUnit: string | null = null;

  if (properties.windGust && properties.windGust.value !== null) {
    windGust = properties.windGust.value;
    windGustUnit = properties.windGust.unitCode ?
      parseUnitCode(properties.windGust.unitCode) : 'kt';

    // Convert to knots if needed
    if (windGustUnit === 'm/s' && windGust !== null) {
      windGust = Math.round(windGust * 1.944 * 10) / 10;
      windGustUnit = 'kt';
    } else if (windGustUnit === 'km/h' && windGust !== null) {
      windGust = Math.round(windGust * 0.539957 * 10) / 10;
      windGustUnit = 'kt';
    } else if (windGustUnit === 'mph' && windGust !== null) {
      windGust = Math.round(windGust * 0.868976 * 10) / 10;
      windGustUnit = 'kt';
    }
  }

  return {
    timestamp,
    windSpeed,
    windSpeedUnit,
    windDirection,
    windGust,
    windGustUnit
  };
}

function parseUnitCode(unitCode: string): string {
  // NOAA uses unit codes like "wmoUnit:km_h-1", "wmoUnit:m_s-1", etc.
  if (unitCode.includes('m_s-1') || unitCode.includes('m/s')) {
    return 'm/s';
  } else if (unitCode.includes('km_h-1') || unitCode.includes('kmPh') || unitCode.includes('km/h')) {
    return 'km/h';
  } else if (unitCode.includes('mph')) {
    return 'mph';
  } else if (unitCode.includes('kt') || unitCode.includes('knot')) {
    return 'kt';
  }
  // Default to knots
  return 'kt';
}