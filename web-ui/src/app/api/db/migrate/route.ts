import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

/**
 * GET /api/db/migrate
 *
 * One-time database migration endpoint
 * Creates the forecasts table and indexes
 *
 * DELETE THIS FILE after running the migration
 */
export async function GET() {
  try {
    // Run schema creation
    await sql`
      CREATE TABLE IF NOT EXISTS forecasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        forecast_hash VARCHAR(64) UNIQUE NOT NULL,
        nws_issued_at TIMESTAMPTZ NOT NULL,
        llm_generated_at TIMESTAMPTZ NOT NULL,
        stored_at TIMESTAMPTZ DEFAULT NOW(),
        nws_forecast_text TEXT NOT NULL,
        llm_prompt TEXT NOT NULL,
        model VARCHAR(100) NOT NULL,
        temperature DECIMAL(3,2) NOT NULL,
        top_p DECIMAL(3,2) NOT NULL,
        max_tokens INTEGER NOT NULL,
        month VARCHAR(3) NOT NULL,
        forecast_number INTEGER NOT NULL CHECK (forecast_number BETWEEN 1 AND 4),
        predictions JSONB NOT NULL,
        source VARCHAR(50) NOT NULL,
        storage_notes TEXT,
        CONSTRAINT forecasts_valid_month CHECK (month IN (
          'jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'
        ))
      );
    `;

    console.log('[MIGRATE] Table created successfully');

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_forecasts_nws_issued ON forecasts(nws_issued_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_forecasts_llm_generated ON forecasts(llm_generated_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_forecasts_month_fc ON forecasts(month, forecast_number)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_forecasts_hash ON forecasts(forecast_hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_predictions_gin ON forecasts USING gin(predictions)`;

    console.log('[MIGRATE] Indexes created successfully');

    // Verify table exists
    const verifyResult = await sql`
      SELECT
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'forecasts'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({
      success: true,
      message: 'Schema created successfully',
      columns: verifyResult.rows
    });

  } catch (error) {
    console.error('[MIGRATE] Migration failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
