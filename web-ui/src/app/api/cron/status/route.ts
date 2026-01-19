/**
 * Cron Status API Endpoint
 *
 * GET /api/cron/status
 *   - Returns summary of recent cron job executions
 *
 * GET /api/cron/status?job=generate-forecast&limit=10
 *   - Returns detailed logs for a specific job
 *
 * @module api/cron/status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCronStatusSummary,
  getRecentCronLogs,
  formatCronLogForDisplay,
  type CronJobName,
} from '@/lib/services/cron-logging';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('job') as CronJobName | null;
    const limit = parseInt(searchParams.get('limit') || '20');

    // If specific job requested, return detailed logs
    if (jobName) {
      if (!['generate-forecast', 'store-wind-actuals'].includes(jobName)) {
        return NextResponse.json(
          { success: false, error: 'Invalid job name' },
          { status: 400 }
        );
      }

      const logs = await getRecentCronLogs({ jobName, limit });
      const formattedLogs = logs.map(log => ({
        ...formatCronLogForDisplay(log),
        runId: log.runId,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
        durationMs: log.durationMs,
        forecastGenerated: log.forecastGenerated,
        nwsIssuedAt: log.nwsIssuedAt,
        errorMessage: log.errorMessage,
        details: log.details,
      }));

      return NextResponse.json({
        success: true,
        data: {
          jobName,
          logs: formattedLogs,
          count: formattedLogs.length,
        },
      });
    }

    // Return summary of all jobs
    const summary = await getCronStatusSummary();

    if (!summary) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'Cron logging not available (local development or DB unavailable)',
          generateForecast: null,
          storeWindActuals: null,
        },
      });
    }

    // Format last run times for display
    const formatLastRun = (lastRun: typeof summary.generateForecast.lastRun) => {
      if (!lastRun) return null;

      const startDate = new Date(lastRun.startedAt);
      return {
        ...formatCronLogForDisplay(lastRun),
        runId: lastRun.runId,
        startedAt: lastRun.startedAt,
        startedAtFormatted: formatInTimeZone(startDate, PACIFIC_TIMEZONE, 'MMM d, yyyy h:mm:ss a'),
        completedAt: lastRun.completedAt,
        forecastGenerated: lastRun.forecastGenerated,
        nwsIssuedAt: lastRun.nwsIssuedAt,
        errorMessage: lastRun.errorMessage,
      };
    };

    return NextResponse.json({
      success: true,
      data: {
        generateForecast: {
          lastRun: formatLastRun(summary.generateForecast.lastRun),
          last24Hours: summary.generateForecast.last24Hours,
          scheduledTime: '9:00 AM PST daily (17:00 UTC)',
        },
        storeWindActuals: {
          lastRun: formatLastRun(summary.storeWindActuals.lastRun),
          last24Hours: summary.storeWindActuals.last24Hours,
          scheduledTime: '2:00 AM PST daily (10:00 UTC)',
        },
        timestamp: new Date().toISOString(),
        timestampFormatted: formatInTimeZone(new Date(), PACIFIC_TIMEZONE, 'MMM d, yyyy h:mm:ss a'),
      },
    });

  } catch (error) {
    console.error('[API-CRON-STATUS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
