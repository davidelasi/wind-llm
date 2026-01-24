import { NextRequest, NextResponse } from 'next/server';
import { getPacificISOString, formatPacificDateTime } from '@/lib/timezone-utils';
import { logCronStart, logCronComplete } from '@/lib/services/cron-logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max 60 seconds

/**
 * Vercel Cron Job: Generate LLM Wind Forecast
 *
 * Schedule: 9:00 AM PST daily (0 17 * * * UTC)
 * Purpose: Automatically generate wind forecasts based on latest NWS coastal forecast
 *
 * Authentication: Vercel sends Authorization: Bearer ${CRON_SECRET} for cron jobs
 */
export async function GET(request: NextRequest) {
  const startTime = new Date();
  const cronRunId = `cron-${Date.now()}`;

  // Log cron start to database
  await logCronStart('generate-forecast', cronRunId);

  // Log cron execution start with detailed timestamp info
  console.log(`[CRON-FORECAST] ========== CRON JOB STARTED ==========`);
  console.log(`[CRON-FORECAST] Run ID: ${cronRunId}`);
  console.log(`[CRON-FORECAST] UTC Time: ${startTime.toISOString()}`);
  console.log(`[CRON-FORECAST] Pacific Time: ${formatPacificDateTime(startTime)}`);
  console.log(`[CRON-FORECAST] Expected Schedule: 9:00 AM PST (17:00 UTC)`);

  try {
    // Verify this is a legitimate Vercel cron request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error(`[CRON-FORECAST] [${cronRunId}] Unauthorized cron request`);
      await logCronComplete(cronRunId, 'error', {
        errorMessage: 'Unauthorized cron request',
        startTime,
      });
      return NextResponse.json(
        { success: false, error: 'Unauthorized', runId: cronRunId },
        { status: 401 }
      );
    }

    console.log(`[CRON-FORECAST] [${cronRunId}] Authorization verified, starting forecast generation`);

    // Call the LLM forecast endpoint with force flag
    // Priority: VERCEL_PROJECT_PRODUCTION_URL > explicit BASE_URL > VERCEL_URL > localhost
    // Note: VERCEL_URL can return deployment-specific URLs, not the production domain
    let baseUrl: string;
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = 'http://localhost:3000';
    }

    console.log(`[CRON-FORECAST] [${cronRunId}] Using baseUrl: ${baseUrl}`);

    const fetchUrl = `${baseUrl}/api/llm-forecast?force=true&cron=true`;
    console.log(`[CRON-FORECAST] [${cronRunId}] Fetching: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'x-admin-key': process.env.ADMIN_SECRET || ''
      }
    });

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type');
    console.log(`[CRON-FORECAST] [${cronRunId}] Response status: ${response.status}, content-type: ${contentType}`);

    if (!contentType || !contentType.includes('application/json')) {
      // Response is not JSON (likely an HTML error page)
      const textBody = await response.text();
      const preview = textBody.substring(0, 200);
      console.error(`[CRON-FORECAST] [${cronRunId}] Non-JSON response: ${preview}...`);

      await logCronComplete(cronRunId, 'error', {
        errorMessage: `API returned non-JSON response (${response.status}): ${preview}`,
        startTime,
        details: {
          httpStatus: response.status,
          contentType,
          baseUrl,
          responsePreview: preview,
        },
      });

      return NextResponse.json({
        success: false,
        error: `LLM forecast API returned non-JSON response (HTTP ${response.status})`,
        runId: cronRunId,
        details: {
          contentType,
          responsePreview: preview,
        }
      }, { status: 502 });
    }

    const data = await response.json();

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    if (data.success) {
      console.log(`[CRON-FORECAST] [${cronRunId}] ========== SUCCESS ==========`);
      console.log(`[CRON-FORECAST] [${cronRunId}] Source: ${data.data?.source}`);
      console.log(`[CRON-FORECAST] [${cronRunId}] NWS Forecast Time: ${data.data?.nwsForecastTime}`);
      console.log(`[CRON-FORECAST] [${cronRunId}] Last Updated: ${data.data?.lastUpdated}`);
      console.log(`[CRON-FORECAST] [${cronRunId}] Duration: ${durationMs}ms`);
      console.log(`[CRON-FORECAST] [${cronRunId}] Completed at: ${formatPacificDateTime(endTime)}`);

      // Log success to database
      const source = data.data?.source;
      const forecastGenerated = source === 'fresh_llm';
      await logCronComplete(cronRunId, 'success', {
        outcome: source === 'fresh_llm' ? 'New forecast generated' :
                 source === 'db_current' ? 'NWS unchanged, used cached' :
                 source,
        nwsIssuedAt: data.data?.nwsForecastTime,
        forecastGenerated,
        startTime,
        details: {
          source,
          lastUpdated: data.data?.lastUpdated,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Forecast generated successfully',
        runId: cronRunId,
        duration: durationMs,
        completedAt: getPacificISOString(endTime),
        data: {
          source: data.data?.source,
          lastUpdated: data.data?.lastUpdated,
          nwsForecastTime: data.data?.nwsForecastTime
        }
      });
    } else {
      console.error(`[CRON-FORECAST] [${cronRunId}] ========== FAILED ==========`);
      console.error(`[CRON-FORECAST] [${cronRunId}] Error: ${data.error}`);
      console.error(`[CRON-FORECAST] [${cronRunId}] Rate Limit Info:`, data.rateLimitInfo);
      console.error(`[CRON-FORECAST] [${cronRunId}] Duration: ${durationMs}ms`);

      // Log error to database
      await logCronComplete(cronRunId, 'error', {
        errorMessage: data.error,
        startTime,
        details: {
          rateLimitInfo: data.rateLimitInfo,
          httpStatus: response.status,
        },
      });

      return NextResponse.json({
        success: false,
        error: data.error,
        runId: cronRunId,
        duration: durationMs,
        rateLimitInfo: data.rateLimitInfo
      }, { status: response.status });
    }

  } catch (error) {
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    console.error(`[CRON-FORECAST] [${cronRunId}] ========== EXCEPTION ==========`);
    console.error(`[CRON-FORECAST] [${cronRunId}] Error:`, error);
    console.error(`[CRON-FORECAST] [${cronRunId}] Duration: ${durationMs}ms`);

    // Log exception to database
    await logCronComplete(cronRunId, 'error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      startTime,
      details: {
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      runId: cronRunId,
      duration: durationMs
    }, { status: 500 });
  }
}
