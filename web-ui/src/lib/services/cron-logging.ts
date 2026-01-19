/**
 * Cron Job Logging Service
 *
 * Logs cron job executions to database for monitoring and debugging.
 * Since Vercel free plan doesn't retain function logs, this provides
 * persistent visibility into cron job behavior.
 *
 * @module cron-logging
 */

import { shouldSkipDatabase, logDatabaseSkipped } from '@/lib/db/db-utils';
import { formatInTimeZone } from 'date-fns-tz';
import { parseISO } from 'date-fns';

// Dynamic import to avoid errors when DATABASE_URL is not set
async function getSql() {
  if (shouldSkipDatabase()) {
    return null;
  }
  const { sql } = await import('@vercel/postgres');
  return sql;
}

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

/**
 * Cron job execution status
 */
export type CronStatus = 'started' | 'success' | 'error' | 'skipped';

/**
 * Cron job names in the system
 */
export type CronJobName = 'generate-forecast' | 'store-wind-actuals';

/**
 * Cron log entry interface
 */
export interface CronLogEntry {
  id?: number;
  jobName: CronJobName;
  runId: string;
  status: CronStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  outcome?: string;
  nwsIssuedAt?: string;
  forecastGenerated?: boolean;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

/**
 * Initialize the cron_logs table if it doesn't exist
 */
export async function initCronLogsTable(): Promise<boolean> {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('initCronLogsTable');
    return false;
  }

  const sql = await getSql();
  if (!sql) return false;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cron_logs (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(50) NOT NULL,
        run_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE,
        duration_ms INTEGER,
        outcome VARCHAR(100),
        nws_issued_at TIMESTAMP WITH TIME ZONE,
        forecast_generated BOOLEAN DEFAULT FALSE,
        error_message TEXT,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create index for efficient queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_cron_logs_job_name_started
      ON cron_logs (job_name, started_at DESC)
    `;

    console.log('[CRON-LOGGING] cron_logs table initialized');
    return true;
  } catch (error) {
    console.error('[CRON-LOGGING] Failed to initialize cron_logs table:', error);
    return false;
  }
}

/**
 * Log the start of a cron job execution
 */
export async function logCronStart(
  jobName: CronJobName,
  runId: string
): Promise<boolean> {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('logCronStart');
    return false;
  }

  try {
    // Ensure table exists
    await initCronLogsTable();

    const sql = await getSql();
    if (!sql) return false;

    const now = new Date().toISOString();

    await sql`
      INSERT INTO cron_logs (
        job_name, run_id, status, started_at
      ) VALUES (
        ${jobName}, ${runId}, 'started', ${now}
      )
    `;

    console.log(`[CRON-LOGGING] Logged start: ${jobName} (${runId})`);
    return true;
  } catch (error) {
    console.error('[CRON-LOGGING] Failed to log cron start:', error);
    return false;
  }
}

/**
 * Log the completion of a cron job execution
 */
export async function logCronComplete(
  runId: string,
  status: 'success' | 'error' | 'skipped',
  options: {
    outcome?: string;
    nwsIssuedAt?: string;
    forecastGenerated?: boolean;
    errorMessage?: string;
    details?: Record<string, unknown>;
    startTime?: Date;
  } = {}
): Promise<boolean> {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('logCronComplete');
    return false;
  }

  const sql = await getSql();
  if (!sql) return false;

  try {
    const completedAt = new Date();
    const durationMs = options.startTime
      ? completedAt.getTime() - options.startTime.getTime()
      : null;

    await sql`
      UPDATE cron_logs
      SET
        status = ${status},
        completed_at = ${completedAt.toISOString()},
        duration_ms = ${durationMs},
        outcome = ${options.outcome || null},
        nws_issued_at = ${options.nwsIssuedAt || null},
        forecast_generated = ${options.forecastGenerated || false},
        error_message = ${options.errorMessage || null},
        details = ${options.details ? JSON.stringify(options.details) : null}
      WHERE run_id = ${runId}
    `;

    console.log(`[CRON-LOGGING] Logged complete: ${runId} (${status})`);
    return true;
  } catch (error) {
    console.error('[CRON-LOGGING] Failed to log cron completion:', error);
    return false;
  }
}

/**
 * Get recent cron logs for a specific job or all jobs
 */
export async function getRecentCronLogs(
  options: {
    jobName?: CronJobName;
    limit?: number;
    since?: Date;
  } = {}
): Promise<CronLogEntry[]> {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('getRecentCronLogs');
    return [];
  }

  const sql = await getSql();
  if (!sql) return [];

  const { jobName, limit = 20, since } = options;

  try {
    let result;

    if (jobName && since) {
      result = await sql`
        SELECT * FROM cron_logs
        WHERE job_name = ${jobName}
          AND started_at >= ${since.toISOString()}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `;
    } else if (jobName) {
      result = await sql`
        SELECT * FROM cron_logs
        WHERE job_name = ${jobName}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `;
    } else if (since) {
      result = await sql`
        SELECT * FROM cron_logs
        WHERE started_at >= ${since.toISOString()}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `;
    } else {
      result = await sql`
        SELECT * FROM cron_logs
        ORDER BY started_at DESC
        LIMIT ${limit}
      `;
    }

    return result.rows.map(row => ({
      id: row.id,
      jobName: row.job_name as CronJobName,
      runId: row.run_id,
      status: row.status as CronStatus,
      startedAt: row.started_at instanceof Date
        ? row.started_at.toISOString()
        : row.started_at,
      completedAt: row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at,
      durationMs: row.duration_ms,
      outcome: row.outcome,
      nwsIssuedAt: row.nws_issued_at instanceof Date
        ? row.nws_issued_at.toISOString()
        : row.nws_issued_at,
      forecastGenerated: row.forecast_generated,
      errorMessage: row.error_message,
      details: row.details,
    }));
  } catch (error) {
    console.error('[CRON-LOGGING] Failed to get recent logs:', error);
    return [];
  }
}

/**
 * Get cron job status summary
 */
export async function getCronStatusSummary(): Promise<{
  generateForecast: {
    lastRun?: CronLogEntry;
    last24Hours: {
      total: number;
      success: number;
      error: number;
      skipped: number;
    };
  };
  storeWindActuals: {
    lastRun?: CronLogEntry;
    last24Hours: {
      total: number;
      success: number;
      error: number;
      skipped: number;
    };
  };
} | null> {
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('getCronStatusSummary');
    return null;
  }

  const sql = await getSql();
  if (!sql) return null;

  try {
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Get last run for each job
    const lastForecastRun = await sql`
      SELECT * FROM cron_logs
      WHERE job_name = 'generate-forecast'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    const lastActualsRun = await sql`
      SELECT * FROM cron_logs
      WHERE job_name = 'store-wind-actuals'
      ORDER BY started_at DESC
      LIMIT 1
    `;

    // Get counts for last 24 hours
    const forecastCounts = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as error,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped
      FROM cron_logs
      WHERE job_name = 'generate-forecast'
        AND started_at >= ${oneDayAgo.toISOString()}
    `;

    const actualsCounts = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as error,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped
      FROM cron_logs
      WHERE job_name = 'store-wind-actuals'
        AND started_at >= ${oneDayAgo.toISOString()}
    `;

    const mapRow = (row: any): CronLogEntry | undefined => {
      if (!row) return undefined;
      return {
        id: row.id,
        jobName: row.job_name as CronJobName,
        runId: row.run_id,
        status: row.status as CronStatus,
        startedAt: row.started_at instanceof Date
          ? row.started_at.toISOString()
          : row.started_at,
        completedAt: row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : row.completed_at,
        durationMs: row.duration_ms,
        outcome: row.outcome,
        nwsIssuedAt: row.nws_issued_at instanceof Date
          ? row.nws_issued_at.toISOString()
          : row.nws_issued_at,
        forecastGenerated: row.forecast_generated,
        errorMessage: row.error_message,
        details: row.details,
      };
    };

    return {
      generateForecast: {
        lastRun: lastForecastRun.rows[0] ? mapRow(lastForecastRun.rows[0]) : undefined,
        last24Hours: {
          total: parseInt(forecastCounts.rows[0]?.total || '0'),
          success: parseInt(forecastCounts.rows[0]?.success || '0'),
          error: parseInt(forecastCounts.rows[0]?.error || '0'),
          skipped: parseInt(forecastCounts.rows[0]?.skipped || '0'),
        },
      },
      storeWindActuals: {
        lastRun: lastActualsRun.rows[0] ? mapRow(lastActualsRun.rows[0]) : undefined,
        last24Hours: {
          total: parseInt(actualsCounts.rows[0]?.total || '0'),
          success: parseInt(actualsCounts.rows[0]?.success || '0'),
          error: parseInt(actualsCounts.rows[0]?.error || '0'),
          skipped: parseInt(actualsCounts.rows[0]?.skipped || '0'),
        },
      },
    };
  } catch (error) {
    console.error('[CRON-LOGGING] Failed to get status summary:', error);
    return null;
  }
}

/**
 * Format a cron log entry for display
 */
export function formatCronLogForDisplay(log: CronLogEntry): {
  time: string;
  status: string;
  duration: string;
  outcome: string;
} {
  const startDate = parseISO(log.startedAt);
  const time = formatInTimeZone(startDate, PACIFIC_TIMEZONE, 'MMM d, h:mm a');

  const duration = log.durationMs
    ? `${(log.durationMs / 1000).toFixed(1)}s`
    : '-';

  const outcome = log.forecastGenerated
    ? 'New forecast generated'
    : log.outcome || '-';

  return {
    time,
    status: log.status,
    duration,
    outcome,
  };
}
