import { NextRequest, NextResponse } from 'next/server';

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
  try {
    // Verify this is a legitimate Vercel cron request
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[CRON-FORECAST] Unauthorized cron request');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[CRON-FORECAST] Starting scheduled forecast generation');

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

    if (data.success) {
      console.log('[CRON-FORECAST] Successfully generated forecast', {
        source: data.data?.source,
        nwsForecastTime: data.data?.nwsForecastTime,
        lastUpdated: data.data?.lastUpdated
      });

      return NextResponse.json({
        success: true,
        message: 'Forecast generated successfully',
        data: {
          source: data.data?.source,
          lastUpdated: data.data?.lastUpdated,
          nwsForecastTime: data.data?.nwsForecastTime
        }
      });
    } else {
      console.error('[CRON-FORECAST] Failed to generate forecast:', data.error);

      return NextResponse.json({
        success: false,
        error: data.error,
        rateLimitInfo: data.rateLimitInfo
      }, { status: response.status });
    }

  } catch (error) {
    console.error('[CRON-FORECAST] Unexpected error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
