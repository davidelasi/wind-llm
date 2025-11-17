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
    // Try the tabular data format first, fall back to human-readable format
    console.log('Fetching data from NOAA AGXC1...');

    let response;
    let isTabularFormat = false;

    try {
      // Try tabular format first
      response = await fetch('https://www.ndbc.noaa.gov/data/realtime2/AGXC1.txt', {
        headers: {
          'User-Agent': 'Wind-Forecast-App/1.0'
        }
      });

      if (response.ok) {
        const testData = await response.text();
        // Check if it's tabular data (has multiple space-separated columns)
        const lines = testData.trim().split('\n');
        if (lines.length > 1 && lines[lines.length - 1].split(/\s+/).length > 10) {
          isTabularFormat = true;
          debugInfo.dataSource = 'tabular';
        }
      }
    } catch (error) {
      console.log('Tabular format not available, trying human-readable format...');
    }

    // If tabular didn't work, use human-readable format
    if (!isTabularFormat) {
      response = await fetch('https://www.ndbc.noaa.gov/data/latest_obs/agxc1.txt', {
        headers: {
          'User-Agent': 'Wind-Forecast-App/1.0'
        }
      });
      debugInfo.dataSource = 'human-readable';
    }

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
      throw new Error(`Not enough data lines. Expected at least 2, got ${lines.length}`);
    }

    let windData: WindData;

    if (isTabularFormat) {
      // Parse tabular format (NOAA realtime data)
      console.log('Parsing tabular NOAA format...');

      // Skip header lines and get the latest data
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.split(/\s+/);

      debugInfo.dataLine = dataLine;
      debugInfo.partsCount = parts.length;
      debugInfo.allParts = parts;

      if (parts.length < 13) {
        throw new Error(`Invalid tabular data format. Expected at least 13 columns, got ${parts.length}`);
      }

      // Format: YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS TIDE
      windData = {
        datetime: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T${parts[3].padStart(2, '0')}:${parts[4].padStart(2, '0')}:00Z`,
        windDirection: parseFloat(parts[5]) || 0,
        windSpeed: Math.round(parseFloat(parts[6]) * 1.944 * 10) / 10 || 0, // m/s to knots
        gustSpeed: Math.round(parseFloat(parts[7]) * 1.944 * 10) / 10 || 0,  // m/s to knots
        pressure: parseFloat(parts[12]) || 0,
        airTemp: parseFloat(parts[13]) ? Math.round((parseFloat(parts[13]) * 9/5 + 32) * 10) / 10 : 0,
        waterTemp: parseFloat(parts[14]) ? Math.round((parseFloat(parts[14]) * 9/5 + 32) * 10) / 10 : 0
      };

      // Handle invalid/missing data (NOAA uses 99.0 or MM for missing data)
      if (windData.windDirection === 99 || windData.windDirection >= 999) windData.windDirection = 0;
      if (windData.windSpeed >= 99) windData.windSpeed = 0;
      if (windData.gustSpeed >= 99) windData.gustSpeed = 0;
      if (windData.pressure >= 9999) windData.pressure = 0;
      if (windData.airTemp >= 999) windData.airTemp = 0;
      if (windData.waterTemp >= 999) windData.waterTemp = 0;

    } else {
      // Parse human-readable format
      console.log('Parsing human-readable NOAA format...');

      let windDirection = 0;
      let windSpeed = 0;
      let gustSpeed = 0;
      let dateTime = '';

      // Extract date/time from lines like "2348 GMT 11/16/25"
      const gmtLine = lines.find(line => line.includes('GMT'));
      if (gmtLine) {
        const gmtMatch = gmtLine.match(/(\d{4})\s+GMT\s+(\d{1,2})\/(\d{1,2})\/(\d{2})/);
        if (gmtMatch) {
          const [, time, month, day, year] = gmtMatch;
          const hours = time.substring(0, 2);
          const minutes = time.substring(2, 4);
          const fullYear = `20${year}`;
          dateTime = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours}:${minutes}:00Z`;
        }
      }

      // Extract wind data from lines like "Wind: S (180°), 8.0 kt"
      const windLine = lines.find(line => line.includes('Wind:'));
      if (windLine) {
        // Parse wind direction from "(180°)"
        const dirMatch = windLine.match(/\((\d+)°?\)/);
        if (dirMatch) {
          windDirection = parseInt(dirMatch[1]);
        }

        // Parse wind speed from "8.0 kt"
        const speedMatch = windLine.match(/,\s*([\d.]+)\s*kt/);
        if (speedMatch) {
          windSpeed = parseFloat(speedMatch[1]);
        }
      }

      // Extract gust data from lines like "Gust: 14.0 kt"
      const gustLine = lines.find(line => line.includes('Gust:'));
      if (gustLine) {
        const gustMatch = gustLine.match(/Gust:\s*([\d.]+)\s*kt/);
        if (gustMatch) {
          gustSpeed = parseFloat(gustMatch[1]);
        }
      }

      debugInfo.extractedData = {
        windDirection,
        windSpeed,
        gustSpeed,
        dateTime
      };

      if (!dateTime) {
        throw new Error('Could not parse date/time from NOAA data');
      }

      // Wind speeds are already in knots for human-readable format
      windData = {
        datetime: dateTime,
        windDirection,
        windSpeed,
        gustSpeed,
        pressure: 0, // Not available in this format
        airTemp: 0,  // Not available in this format
        waterTemp: 0 // Not available in this format
      };
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