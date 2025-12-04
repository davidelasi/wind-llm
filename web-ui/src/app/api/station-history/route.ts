import { NextRequest, NextResponse } from 'next/server';
import { format, parseISO, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { convertGMTtoPacific, PACIFIC_TIMEZONE } from '@/lib/timezone-utils';

interface WindDataPoint {
  timestamp: string;
  date: string;
  time: string;
  hour: number;
  windSpeed: number;
  gustSpeed: number;
  windDirection: number;
  temperature: number;
}

interface ProcessedHistoryData {
  chartData: Array<{
    timestamp: string;
    date: string;
    time: string;
    hour: number;
    windSpeed: number;
    gustSpeed: number;
    windDirection: number;
    windDirectionText: string;
    temperature: number;
    isDangerous: boolean;
  }>;
  summary: {
    avgWindSpeed: number;
    maxWindSpeed: number;
    avgGustSpeed: number;
    maxGustSpeed: number;
    dangerousGustCount: number;
    primaryDirection: string;
    dataPoints: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
}

const MS_TO_KNOTS = 1.94384;
const DANGEROUS_GUST_THRESHOLD = 25;

function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function parseWindData(text: string): WindDataPoint[] {
  const lines = text.split('\n');
  const data: WindDataPoint[] = [];

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

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        continue;
      }

      // Parse wind data (skip if MM - missing data)
      const windDirection = parts[5] === 'MM' ? null : parseFloat(parts[5]);
      const windSpeed = parts[6] === 'MM' ? null : parseFloat(parts[6]);
      const gustSpeed = parts[7] === 'MM' ? null : parseFloat(parts[7]);
      const temperature = parts[13] === 'MM' ? null : parseFloat(parts[13]);

      // Only include records with valid wind data
      if (windDirection !== null && windSpeed !== null) {
        // Create GMT date first
        const gmtDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

        // Format as ISO string in Pacific timezone
        const pacificTimestamp = formatInTimeZone(gmtDate, PACIFIC_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

        // Get Pacific time components for display
        const pacificDate = convertGMTtoPacific(year, month, day, hour, minute);

        // Include ALL hours - don't filter by time here, let frontend handle display filtering
        data.push({
          timestamp: pacificTimestamp,
          date: format(pacificDate, 'MMM dd'),
          time: format(pacificDate, 'HH:mm'),
          hour: pacificDate.getHours(),
          windSpeed: windSpeed * MS_TO_KNOTS,
          gustSpeed: (gustSpeed || 0) * MS_TO_KNOTS,
          windDirection: windDirection,
          temperature: temperature || 0,
        });
      }
    } catch (error) {
      continue; // Skip malformed lines
    }
  }

  return data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function aggregateHourlyData(rawData: WindDataPoint[]): WindDataPoint[] {
  const hourlyGroups = new Map<string, WindDataPoint[]>();

  // Group data by hour (YYYY-MM-DD-HH)
  rawData.forEach(point => {
    const date = new Date(point.timestamp);
    const hourKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}`;

    if (!hourlyGroups.has(hourKey)) {
      hourlyGroups.set(hourKey, []);
    }
    hourlyGroups.get(hourKey)!.push(point);
  });

  const aggregated: WindDataPoint[] = [];

  // Aggregate each hour's data
  hourlyGroups.forEach((hourPoints) => {
    if (hourPoints.length === 0) return;

    // Average wind speed
    const avgWindSpeed = hourPoints.reduce((sum, p) => sum + p.windSpeed, 0) / hourPoints.length;

    // Maximum gust speed
    const maxGustSpeed = Math.max(...hourPoints.map(p => p.gustSpeed));

    // Average wind direction (circular mean)
    const avgDirection = hourPoints.reduce((sum, p) => sum + p.windDirection, 0) / hourPoints.length;

    // Average temperature
    const avgTemp = hourPoints.reduce((sum, p) => sum + p.temperature, 0) / hourPoints.length;

    // Use the first point as the base and set time to the beginning of the hour
    const basePoint = hourPoints[0];
    const hourDate = new Date(basePoint.timestamp);
    hourDate.setMinutes(0, 0, 0); // Set to beginning of hour

    aggregated.push({
      timestamp: hourDate.toISOString(),
      date: format(hourDate, 'MMM dd'),
      time: format(hourDate, 'HH:mm'),
      hour: hourDate.getHours(),
      windSpeed: Math.round(avgWindSpeed * 10) / 10,
      gustSpeed: Math.round(maxGustSpeed * 10) / 10,
      windDirection: Math.round(avgDirection),
      temperature: Math.round(avgTemp * 10) / 10,
    });
  });

  return aggregated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function processHistoryData(rawData: WindDataPoint[]): ProcessedHistoryData {
  // Include all available data (no date filtering - let frontend handle date selection)
  const recentData = rawData;

  // Aggregate into hourly averages (all hours)
  const aggregatedData = aggregateHourlyData(recentData);

  const chartData = aggregatedData.map(point => ({
    ...point,
    windDirectionText: getWindDirectionText(point.windDirection),
    isDangerous: point.gustSpeed > DANGEROUS_GUST_THRESHOLD,
  }));

  const windSpeeds = chartData.map(d => d.windSpeed);
  const gustSpeeds = chartData.map(d => d.gustSpeed);
  const directions = chartData.map(d => d.windDirection);

  // Calculate most common direction
  const directionCounts: { [key: string]: number } = {};
  chartData.forEach(d => {
    const dir = d.windDirectionText;
    directionCounts[dir] = (directionCounts[dir] || 0) + 1;
  });
  const primaryDirection = Object.entries(directionCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N';

  const summary = {
    avgWindSpeed: windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length,
    maxWindSpeed: Math.max(...windSpeeds),
    avgGustSpeed: gustSpeeds.reduce((a, b) => a + b, 0) / gustSpeeds.length,
    maxGustSpeed: Math.max(...gustSpeeds),
    dangerousGustCount: chartData.filter(d => d.isDangerous).length,
    primaryDirection,
    dataPoints: chartData.length,
    dateRange: {
      start: chartData[0]?.date || '',
      end: chartData[chartData.length - 1]?.date || '',
    },
  };

  return { chartData, summary };
}

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching NOAA 5-day wind history data...');

    const response = await fetch('https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt', {
      headers: {
        'User-Agent': 'Wind Forecast Mobile App (contact@example.com)',
      },
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`NOAA API responded with status: ${response.status}`);
    }

    const text = await response.text();
    console.log('Raw data length:', text.length);

    const rawData = parseWindData(text);
    console.log('Parsed wind records:', rawData.length);

    if (rawData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid wind data found',
        message: 'The NOAA data file contains no parseable wind measurements',
      });
    }

    const processedData = processHistoryData(rawData);
    console.log('Processed chart data points:', processedData.chartData.length);

    const metadata = {
      lastUpdated: new Date().toLocaleString('en-US', {
        timeZone: PACIFIC_TIMEZONE,
        timeZoneName: 'short'
      }),
      station: 'AGXC1',
      location: 'Los Angeles, CA',
      rawRecords: rawData.length,
      chartPoints: processedData.chartData.length,
    };

    return NextResponse.json({
      success: true,
      data: processedData,
      metadata,
      debug: {
        samplePoints: processedData.chartData.slice(0, 3),
        summary: processedData.summary,
      }
    });

  } catch (error) {
    console.error('Error fetching station history:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch station history',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      debug: {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
        } : error
      }
    });
  }
}