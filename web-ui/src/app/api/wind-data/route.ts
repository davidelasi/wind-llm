import { NextRequest, NextResponse } from 'next/server';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';
import { formatInTimeZone } from 'date-fns-tz';
import { fileCache, createEtagCache } from '../../../../lib/cache/file-cache';

interface WindData {
  datetime: string;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

export async function GET(request: NextRequest) {
  try {
    // Create cache key based on current minute for fresh wind data each minute
    const now = new Date();
    const minuteKey = formatInTimeZone(now, PACIFIC_TIMEZONE, 'yyyy-MM-dd-HH-mm');
    const cacheKey = `wind-data-${minuteKey}`;

    console.log('[WIND-DATA] Cache key:', cacheKey);

    // Try ETag cache first for HTTP conditional requests
    try {
      const { data, etag, cached } = await createEtagCache<any>(
        fileCache,
        cacheKey,
        5 * 60 * 1000 // 5 minutes cache (less than wind-history which is hourly)
      )(
        request,
        async () => {
          console.log('[WIND-DATA] Cache miss, fetching fresh current wind data...');

          let debugInfo: any = {};
          const startTime = Date.now();

          // Fetch from NOAA...
          let response: Response | null = null;
          let isTabularFormat = false;
          let rawData: string = '';

          try {
            const tabularResponse = await fetch('https://www.ndbc.noaa.gov/data/realtime2/AGXC1.txt', {
              headers: { 'User-Agent': 'Wind-Forecast-App/1.0' }
            });

            if (tabularResponse.ok) {
              const testData = await tabularResponse.text();
              const lines = testData.trim().split('\n');
              const lastLine = lines[lines.length - 1];

              if (lines.length > 1 && lastLine.split(/\s+/).length > 10) {
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

          // Fallback to 5-day data
          if (!isTabularFormat) {
            response = await fetch('https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt', {
              headers: { 'User-Agent': 'Wind-Forecast-App/1.0' }
            });
            debugInfo.dataSource = 'five-day-fallback';

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            rawData = await response.text();
          }

          // Parse the data (same logic as before)
          const lines = rawData.trim().split('\n');
          if (lines.length < 2) {
            throw new Error(`Not enough data lines. Expected at least 2, got ${lines.length}`);
          }

          let windData: WindData;
          const dataLine = isTabularFormat ? lines[lines.length - 1] : lines[1];
          const parts = dataLine.split(/\s+/);

          // Parse tabular format
          if (isTabularFormat && parts.length >= 13) {
            windData = {
              datetime: `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}T${parts[3].padStart(2, '0')}:${parts[4].padStart(2, '0')}:00Z`,
              windDirection: parseFloat(parts[5]) || 0,
              windSpeed: Math.round(parseFloat(parts[6]) * 1.94384 * 10) / 10 || 0,
              gustSpeed: Math.round(parseFloat(parts[7]) * 1.94384 * 10) / 10 || 0,
              pressure: parseFloat(parts[12]) || 0,
              airTemp: parseFloat(parts[13]) ? Math.round((parseFloat(parts[13]) * 9/5 + 32) * 10) / 10 : 0,
              waterTemp: parseFloat(parts[14]) ? Math.round((parseFloat(parts[14]) * 9/5 + 32) * 10) / 10 : 0
            };
          } else {
            throw new Error('Could not parse wind data');
          }

          // Handle invalid data
          if (windData.windDirection === 99 || windData.windDirection >= 999) windData.windDirection = 0;
          if (windData.windSpeed >= 99) windData.windSpeed = 0;
          if (windData.gustSpeed >= 99) windData.gustSpeed = 0;
          if (windData.pressure >= 9999) windData.pressure = 0;
          if (windData.airTemp >= 999) windData.airTemp = 0;
          if (windData.waterTemp >= 999) windData.waterTemp = 0;

          console.log('[WIND-DATA] Fresh data processed in', Date.now() - startTime, 'ms');

          // Calculate data age and convert to PST
          const dataTimestamp = new Date(windData.datetime);
          const nowPST = new Date();
          const dataAgeMins = Math.floor((nowPST.getTime() - dataTimestamp.getTime()) / (1000 * 60));

          const dataPST = new Date(dataTimestamp.getTime() - (8 * 60 * 60 * 1000));
          const formattedTimePST = dataPST.toLocaleString('en-US', {
            timeZone: PACIFIC_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }) + ' PST';

          const dataAge = {
            minutes: dataAgeMins,
            isOld: dataAgeMins > 12,
            warning: dataAgeMins > 12 ? `WARNING: Latest station reading ${dataAgeMins} min ago` : null,
            timestamp: formattedTimePST
          };

          return {
            success: true,
            data: { ...windData, datetime: formattedTimePST },
            dataAge,
            station: 'AGXC1',
            location: 'Los Angeles, CA',
            lastUpdated: new Date().toISOString(),
            debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
          };
        }
      );

      // Return cached or fresh data with ETag header
      console.log(`[WIND-DATA] ${cached ? 'CACHED' : 'FRESH'} data served`);

      return NextResponse.json(data, {
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=30', // Browser cache for 30 seconds
        },
      });

    } catch (etagError: any) {
      // Handle conditional request - return 304 Not Modified
      if (etagError.status === 304) {
        console.log('[WIND-DATA] Conditionally cached via ETag');
        return new Response(null, {
          status: 304,
          headers: { 'ETag': etagError.etag },
        });
      }
      throw etagError;
    }

  } catch (error) {
    console.error('[WIND-DATA] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch wind data',
        message: error instanceof Error ? error.message : 'Unknown error',
        debug: {
          errorStack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}
