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
  try {
    // Fetch latest wind data from NOAA AGXC1 station
    const response = await fetch('https://www.ndbc.noaa.gov/data/latest_obs/agxc1.txt', {
      headers: {
        'User-Agent': 'Wind-Forecast-App/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData = await response.text();
    const lines = rawData.trim().split('\n');

    // Skip header lines and get the latest data
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.split(/\s+/);

    if (parts.length < 13) {
      throw new Error('Invalid data format');
    }

    // Parse the wind data according to NOAA format
    // Format: YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS TIDE
    const windData: WindData = {
      datetime: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T${parts[3].padStart(2, '0')}:${parts[4].padStart(2, '0')}:00Z`,
      windDirection: parseFloat(parts[5]) || 0,
      windSpeed: parseFloat(parts[6]) || 0,
      gustSpeed: parseFloat(parts[7]) || 0,
      pressure: parseFloat(parts[12]) || 0,
      airTemp: parseFloat(parts[13]) || 0,
      waterTemp: parseFloat(parts[14]) || 0
    };

    // Convert wind speed from m/s to knots (1 m/s = 1.944 knots)
    windData.windSpeed = Math.round(windData.windSpeed * 1.944 * 10) / 10;
    windData.gustSpeed = Math.round(windData.gustSpeed * 1.944 * 10) / 10;

    // Convert air and water temp from Celsius to Fahrenheit
    windData.airTemp = Math.round((windData.airTemp * 9/5 + 32) * 10) / 10;
    windData.waterTemp = Math.round((windData.waterTemp * 9/5 + 32) * 10) / 10;

    return NextResponse.json({
      success: true,
      data: windData,
      station: 'AGXC1',
      location: 'Los Angeles, CA',
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching wind data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch wind data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}