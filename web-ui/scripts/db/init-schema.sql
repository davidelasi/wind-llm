-- Wind Forecasting LLM - Database Schema Initialization
-- Run this script once to create the forecasts table

-- Drop table if exists (for development - REMOVE IN PRODUCTION)
-- DROP TABLE IF EXISTS forecasts;

-- Create forecasts table
CREATE TABLE IF NOT EXISTS forecasts (
  -- Primary identifiers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_hash VARCHAR(64) UNIQUE NOT NULL,

  -- Timestamps
  nws_issued_at TIMESTAMPTZ NOT NULL,
  llm_generated_at TIMESTAMPTZ NOT NULL,
  stored_at TIMESTAMPTZ DEFAULT NOW(),

  -- Source data
  nws_forecast_text TEXT NOT NULL,
  llm_prompt TEXT NOT NULL,

  -- Model configuration
  model VARCHAR(100) NOT NULL,
  temperature DECIMAL(3,2) NOT NULL,
  top_p DECIMAL(3,2) NOT NULL,
  max_tokens INTEGER NOT NULL,

  -- Forecast metadata
  month VARCHAR(3) NOT NULL,
  forecast_number INTEGER NOT NULL,
  CHECK (forecast_number BETWEEN 1 AND 4),

  -- Predictions
  predictions JSONB NOT NULL,

  -- Quality tracking
  source VARCHAR(50) NOT NULL,
  storage_notes TEXT,

  -- Validation
  CONSTRAINT forecasts_valid_month CHECK (month IN (
    'jan','feb','mar','apr','may','jun',
    'jul','aug','sep','oct','nov','dec'
  ))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_forecasts_nws_issued ON forecasts(nws_issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecasts_llm_generated ON forecasts(llm_generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecasts_month_fc ON forecasts(month, forecast_number);
CREATE INDEX IF NOT EXISTS idx_forecasts_hash ON forecasts(forecast_hash);
CREATE INDEX IF NOT EXISTS idx_predictions_gin ON forecasts USING gin(predictions);

-- Verify table creation
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'forecasts'
ORDER BY ordinal_position;
