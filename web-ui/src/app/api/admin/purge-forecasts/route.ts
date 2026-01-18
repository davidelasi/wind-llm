/**
 * Admin Endpoint: Purge Forecasts Database
 *
 * DELETE /api/admin/purge-forecasts
 *
 * Truncates all records from the forecasts table.
 * Use this to start fresh with consistent timestamp formats.
 *
 * Authentication: Requires ADMIN_SECRET in x-admin-key header
 *
 * @module admin/purge-forecasts
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { shouldSkipDatabase, logDatabaseSkipped } from '@/lib/db/db-utils';

export async function DELETE(request: NextRequest) {
  // Skip database in local development
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('DELETE /api/admin/purge-forecasts');
    return NextResponse.json({
      success: true,
      message: 'Database operations skipped in local development',
      recordsDeleted: 0,
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Verify admin authorization
    const adminKey = request.headers.get('x-admin-key');
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret || adminKey !== adminSecret) {
      console.warn('[ADMIN] Unauthorized purge attempt');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[ADMIN] Starting forecasts table purge...');

    // Get count before purge
    const countBefore = await sql`SELECT COUNT(*) as count FROM forecasts`;
    const recordCount = parseInt(countBefore.rows[0].count, 10);

    console.log(`[ADMIN] Found ${recordCount} records to delete`);

    // Truncate the table (faster than DELETE for full table clear)
    await sql`TRUNCATE TABLE forecasts RESTART IDENTITY`;

    console.log('[ADMIN] Forecasts table purged successfully');

    return NextResponse.json({
      success: true,
      message: 'Forecasts table purged successfully',
      recordsDeleted: recordCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ADMIN] Purge failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Also support GET to check status (no auth required)
export async function GET() {
  // Skip database in local development
  if (shouldSkipDatabase()) {
    logDatabaseSkipped('GET /api/admin/purge-forecasts');
    return NextResponse.json({
      success: true,
      stats: {
        totalRecords: 0,
        freshLlmRecords: 0,
        oldestRecord: null,
        newestRecord: null
      },
      note: 'Database operations skipped in local development'
    });
  }

  try {
    const result = await sql`
      SELECT
        COUNT(*) as total_count,
        MIN(stored_at) as oldest_record,
        MAX(stored_at) as newest_record,
        COUNT(CASE WHEN source = 'fresh_llm' THEN 1 END) as fresh_llm_count
      FROM forecasts
    `;

    const stats = result.rows[0];

    return NextResponse.json({
      success: true,
      stats: {
        totalRecords: parseInt(stats.total_count, 10),
        freshLlmRecords: parseInt(stats.fresh_llm_count, 10),
        oldestRecord: stats.oldest_record,
        newestRecord: stats.newest_record
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
