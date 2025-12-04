import { NextResponse } from 'next/server';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';

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

    let response: Response | null = null;
    let isTabularFormat = false;
    let rawData: string = '';

    try {
      // Try tabular format first
      const tabularResponse = await fetch('https://www.ndbc.noaa.gov/data/realtime2/AGXC1.txt', {
        headers: {
          'User-Agent': 'Wind-Forecast-App/1.0'
        }
      });

      if (tabularResponse.ok) {
        const testData = await tabularResponse.text();
        // Check if it's tabular data (has multiple space-separated columns)
        const lines = testData.trim().split('\n');
        const lastLine = lines[lines.length - 1];

        if (lines.length > 1 && lastLine.split(/\s+/).length > 10) {
          // Check if the tabular data is recent (within last 7 days)
          const parts = lastLine.split(/\s+/);
          const dataDate = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T${parts[3].padStart(2, '0')}:${parts[4].padStart(2, '0')}:00Z`);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          if (dataDate > sevenDaysAgo) {
            isTabularFormat = true;
            response = tabularResponse;
            rawData = testData;
            debugInfo.dataSource = 'tabular';
            debugInfo.tabularDataAge = `${Math.round((Date.now() - dataDate.getTime()) / (1000 * 60 * 60))} hours old`;
          } else {
            console.log(`Tabular data is too old (${dataDate.toISOString()}), falling back to human-readable format...`);
            debugInfo.tabularDataAge = `${Math.round((Date.now() - dataDate.getTime()) / (1000 * 60 * 60 * 24))} days old - rejected`;
          }
        }
      }
    } catch (error) {
      console.log('Tabular format not available, trying human-readable format...');
    }

    // If tabular didn't work, use 5-day data format as fallback
    if (!isTabularFormat) {
      response = await fetch('https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt', {
        headers: {
          'User-Agent': 'Wind-Forecast-App/1.0'
        }
      });
      debugInfo.dataSource = 'five-day-fallback';

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      rawData = await response.text();
    }

    // Ensure response and rawData are properly assigned (TypeScript safety)
    if (!response) {
      throw new Error('Failed to fetch data from any source');
    }

    if (!rawData) {
      throw new Error('Failed to read data from any source');
    }

    debugInfo.responseStatus = response.status;
    debugInfo.responseHeaders = Object.fromEntries(response.headers.entries());

    // rawData is already read above
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
        windSpeed: Math.round(parseFloat(parts[6]) * 1.94384 * 10) / 10 || 0, // m/s to knots
        gustSpeed: Math.round(parseFloat(parts[7]) * 1.94384 * 10) / 10 || 0,  // m/s to knots
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
      // Parse alternative formats (5-day or human-readable)
      console.log(`Parsing NOAA format (${debugInfo.dataSource})...`);

      // Check if this is 5-day format (has tabular structure)
      if (debugInfo.dataSource === 'five-day-fallback') {
        // Parse the 5-day format - get the most recent measurement
        const dataLines = lines.slice(2); // Skip header lines
        const latestLine = dataLines[0]; // First data line has the most recent data

        if (latestLine && latestLine.split(/\s+/).length >= 8) {
          const parts = latestLine.split(/\s+/);

          // Convert GMT to current time for display
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]);
          const day = parseInt(parts[2]);
          const hour = parseInt(parts[3]);
          const minute = parseInt(parts[4]);

          windData = {
            datetime: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`,
            windDirection: parseFloat(parts[5]) || 0,
            windSpeed: Math.round(parseFloat(parts[6]) * 1.94384 * 10) / 10 || 0, // m/s to knots
            gustSpeed: Math.round(parseFloat(parts[7]) * 1.94384 * 10) / 10 || 0,  // m/s to knots
            pressure: parseFloat(parts[12]) || 0,
            airTemp: parseFloat(parts[13]) ? Math.round((parseFloat(parts[13]) * 9/5 + 32) * 10) / 10 : 0,
            waterTemp: parseFloat(parts[14]) ? Math.round((parseFloat(parts[14]) * 9/5 + 32) * 10) / 10 : 0
          };

          // Handle invalid/missing data
          if (windData.windDirection === 99 || windData.windDirection >= 999) windData.windDirection = 0;
          if (windData.windSpeed >= 99) windData.windSpeed = 0;
          if (windData.gustSpeed >= 99) windData.gustSpeed = 0;
          if (windData.pressure >= 9999) windData.pressure = 0;
          if (windData.airTemp >= 999) windData.airTemp = 0;
          if (windData.waterTemp >= 999) windData.waterTemp = 0;

          debugInfo.fiveDayParsed = true;
        } else {
          throw new Error('Could not parse 5-day format data');
        }
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
          // Parse wind direction from "(180°)" - handle various encodings of degree symbol
          const dirMatch = windLine.match(/\((\d+)[°\ufffd]?\)/);
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
    }

    debugInfo.finalData = windData;

    console.log('Successfully processed wind data:', windData);

    // Calculate data age and convert timestamp to PST
    const dataTimestamp = new Date(windData.datetime);
    const nowPST = new Date();
    const dataAgeMins = Math.floor((nowPST.getTime() - dataTimestamp.getTime()) / (1000 * 60));

    // Convert to PST for display
    const dataPST = new Date(dataTimestamp.getTime() - (8 * 60 * 60 * 1000)); // Convert to PST (UTC-8)
    const formattedTimePST = dataPST.toLocaleString('en-US', {
      timeZone: PACIFIC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + ' PST';

    // Create warning for old data (>12 minutes)
    const dataAge = {
      minutes: dataAgeMins,
      isOld: dataAgeMins > 12,
      warning: dataAgeMins > 12 ? `WARNING: Latest station reading ${dataAgeMins} min ago` : null,
      timestamp: formattedTimePST
    };

    return NextResponse.json({
      success: true,
      data: {
        ...windData,
        datetime: formattedTimePST
      },
      dataAge,
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