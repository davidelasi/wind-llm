import { NextRequest, NextResponse } from 'next/server';

interface RawWindData {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

interface ProcessedWindData {
  datetime: string;
  datetimePST: string;
  windDirection: number;
  windSpeedKt: number;
  gustSpeedKt: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

interface HourlyWindData {
  hour: string;
  datetimePST: string;
  windSpeedAvgKt: number;
  gustSpeedMaxKt: number;
  windDirection: number;
  pressure: number;
  airTemp: number;
  sampleCount: number;
}

interface DailyWindData {
  date: string;
  hourlyData: HourlyWindData[];
  dailySummary: {
    avgWindSpeedKt: number;
    maxGustKt: number;
    avgDirection: number;
    avgPressure: number;
    avgAirTemp: number;
  };
}

const MS_TO_KNOTS = 1.94384;

function convertGMTtoPacific(year: number, month: number, day: number, hour: number, minute: number): Date {
  const gmtDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Use Intl.DateTimeFormat to get actual Pacific time (handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(gmtDate);
  const pacificYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const pacificMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
  const pacificDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const pacificHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const pacificMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

  return new Date(pacificYear, pacificMonth - 1, pacificDay, pacificHour, pacificMinute);
}

function parseWindData(text: string): RawWindData[] {
  const lines = text.split('\n');
  const data: RawWindData[] = [];

  // Skip header lines (first 2 lines)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 19) continue;

    try {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      const hour = parseInt(parts[3]);
      const minute = parseInt(parts[4]);

      // Skip if any timestamp part is invalid
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        continue;
      }

      // Parse wind data (skip if MM - missing data)
      const windDirection = parts[5] === 'MM' ? null : parseFloat(parts[5]);
      const windSpeed = parts[6] === 'MM' ? null : parseFloat(parts[6]);
      const gustSpeed = parts[7] === 'MM' ? null : parseFloat(parts[7]);
      const pressure = parts[12] === 'MM' ? null : parseFloat(parts[12]);
      const airTemp = parts[13] === 'MM' ? null : parseFloat(parts[13]);
      const waterTemp = parts[14] === 'MM' ? null : parseFloat(parts[14]);

      // Only include records with valid wind data
      if (windDirection !== null && windSpeed !== null) {
        data.push({
          year,
          month,
          day,
          hour,
          minute,
          windDirection,
          windSpeed,
          gustSpeed: gustSpeed || 0,
          pressure: pressure || 0,
          airTemp: airTemp || 0,
          waterTemp: waterTemp || 0,
        });
      }
    } catch (error) {
      continue; // Skip malformed lines
    }
  }

  return data;
}

function aggregateHourlyData(rawData: RawWindData[]): DailyWindData[] {
  const dailyGroups: { [date: string]: RawWindData[] } = {};

  // Group by date (Pacific timezone - handles DST)
  rawData.forEach(record => {
    const pacificDate = convertGMTtoPacific(record.year, record.month, record.day, record.hour, record.minute);
    const dateKey = pacificDate.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!dailyGroups[dateKey]) {
      dailyGroups[dateKey] = [];
    }
    dailyGroups[dateKey].push(record);
  });

  const result: DailyWindData[] = [];

  Object.entries(dailyGroups).forEach(([date, dayRecords]) => {
    const hourlyGroups: { [hour: number]: RawWindData[] } = {};

    // Group by hour (Pacific timezone - handles DST)
    dayRecords.forEach(record => {
      const pacificDate = convertGMTtoPacific(record.year, record.month, record.day, record.hour, record.minute);
      const pacificHour = pacificDate.getHours();

      if (!hourlyGroups[pacificHour]) {
        hourlyGroups[pacificHour] = [];
      }
      hourlyGroups[pacificHour].push(record);
    });

    const hourlyData: HourlyWindData[] = [];
    let dailyWindSpeeds: number[] = [];
    let dailyGusts: number[] = [];
    let dailyDirections: number[] = [];
    let dailyPressures: number[] = [];
    let dailyAirTemps: number[] = [];

    // Process each hour
    Object.entries(hourlyGroups).forEach(([hourStr, hourRecords]) => {
      const hour = parseInt(hourStr);

      if (hourRecords.length > 0) {
        // Calculate averages for the hour
        const windSpeeds = hourRecords.map(r => r.windSpeed);
        const gustSpeeds = hourRecords.map(r => r.gustSpeed);
        const directions = hourRecords.map(r => r.windDirection);
        const pressures = hourRecords.filter(r => r.pressure > 0).map(r => r.pressure);
        const airTemps = hourRecords.filter(r => r.airTemp !== 0).map(r => r.airTemp);

        const avgWindSpeed = windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length;
        const maxGust = Math.max(...gustSpeeds);
        const avgDirection = directions.reduce((a, b) => a + b, 0) / directions.length;
        const avgPressure = pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : 0;
        const avgAirTemp = airTemps.length > 0 ? airTemps.reduce((a, b) => a + b, 0) / airTemps.length : 0;

        // Create representative datetime for this hour
        const firstRecord = hourRecords[0];
        const pacificDateTime = convertGMTtoPacific(firstRecord.year, firstRecord.month, firstRecord.day, firstRecord.hour, firstRecord.minute);
        pacificDateTime.setHours(hour, 0, 0, 0); // Set to beginning of hour

        hourlyData.push({
          hour: hour.toString().padStart(2, '0') + ':00',
          datetimePST: pacificDateTime.toISOString().replace('Z', '-08:00'),
          windSpeedAvgKt: avgWindSpeed * MS_TO_KNOTS,
          gustSpeedMaxKt: maxGust * MS_TO_KNOTS,
          windDirection: Math.round(avgDirection),
          pressure: avgPressure,
          airTemp: avgAirTemp,
          sampleCount: hourRecords.length,
        });

        // Collect for daily summary
        dailyWindSpeeds.push(avgWindSpeed);
        dailyGusts.push(maxGust);
        dailyDirections.push(avgDirection);
        if (avgPressure > 0) dailyPressures.push(avgPressure);
        if (avgAirTemp !== 0) dailyAirTemps.push(avgAirTemp);
      }
    });

    // Sort hourly data by hour
    hourlyData.sort((a, b) => parseInt(a.hour.split(':')[0]) - parseInt(b.hour.split(':')[0]));

    // Calculate daily summary
    const dailySummary = {
      avgWindSpeedKt: dailyWindSpeeds.length > 0 ? (dailyWindSpeeds.reduce((a, b) => a + b, 0) / dailyWindSpeeds.length) * MS_TO_KNOTS : 0,
      maxGustKt: dailyGusts.length > 0 ? Math.max(...dailyGusts) * MS_TO_KNOTS : 0,
      avgDirection: dailyDirections.length > 0 ? Math.round(dailyDirections.reduce((a, b) => a + b, 0) / dailyDirections.length) : 0,
      avgPressure: dailyPressures.length > 0 ? dailyPressures.reduce((a, b) => a + b, 0) / dailyPressures.length : 0,
      avgAirTemp: dailyAirTemps.length > 0 ? dailyAirTemps.reduce((a, b) => a + b, 0) / dailyAirTemps.length : 0,
    };

    result.push({
      date,
      hourlyData,
      dailySummary,
    });
  });

  // Sort by date (most recent first)
  result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return result;
}

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching NOAA 5-day wind data...');

    const response = await fetch('https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt', {
      headers: {
        'User-Agent': 'Wind Forecast LLM (david@example.com)',
      },
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`NOAA API responded with status: ${response.status}`);
    }

    const text = await response.text();
    console.log('Raw data length:', text.length);

    // Parse and process the data
    const rawData = parseWindData(text);
    console.log('Parsed records:', rawData.length);

    if (rawData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid wind data found',
        message: 'The NOAA data file contains no parseable wind measurements',
        debug: {
          rawDataLength: text.length,
          sampleLines: text.split('\n').slice(0, 5)
        }
      });
    }

    // Aggregate into hourly and daily summaries
    const processedData = aggregateHourlyData(rawData);
    console.log('Processed days:', processedData.length);

    const now = new Date();
    const dataAge = {
      lastUpdated: now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        timeZoneName: 'short'
      }),
      recordCount: rawData.length,
      dateRange: {
        oldest: processedData[processedData.length - 1]?.date,
        newest: processedData[0]?.date
      }
    };

    return NextResponse.json({
      success: true,
      data: processedData,
      metadata: dataAge,
      station: 'AGXC1',
      location: 'Los Angeles, CA',
      debug: {
        rawRecords: rawData.length,
        processedDays: processedData.length,
        sampleData: processedData.slice(0, 1)
      }
    });

  } catch (error) {
    console.error('Error fetching 5-day wind data:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch 5-day wind data',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      debug: {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      }
    });
  }
}