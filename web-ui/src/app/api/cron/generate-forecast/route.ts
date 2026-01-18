import { NextRequest, NextResponse } from 'next/server';
import { getPacificISOString, formatPacificDateTime } from '@/lib/timezone-utils';

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
      return NextResponse.json(
        { success: false, error: 'Unauthorized', runId: cronRunId },
        { status: 401 }
      );
    }

    console.log(`[CRON-FORECAST] [${cronRunId}] Authorization verified, starting forecast generation`);

    // Call the LLM forecast endpoint with force flag
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/llm-forecast?force=true&cron=true`, {
      method: 'GET',
      headers: {
        'x-admin-key': process.env.ADMIN_SECRET || ''
      }
    });

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

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      runId: cronRunId,
      duration: durationMs
    }, { status: 500 });
  }
}
