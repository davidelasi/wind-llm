-- Migration: Create wind_actuals table for storing hourly wind measurements
-- Purpose: Enable forecast vs. actual comparisons
-- Date: 2025-12-13
-- Phase: 3 (Wind Actuals Storage System)

-- Create table
CREATE TABLE IF NOT EXISTS wind_actuals (
  -- Primary Key
  id SERIAL PRIMARY KEY,

  -- Temporal Identifiers
  date DATE NOT NULL,
  hour SMALLINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,

  -- Wind Measurements (knots)
  wspd_avg_kt NUMERIC(4,1) NOT NULL,
  gst_max_kt NUMERIC(4,1) NOT NULL,

  -- Direction and Environmental
  wdir_avg_deg SMALLINT NOT NULL,
  wdir_text VARCHAR(3) NOT NULL,
  temp_avg_c NUMERIC(4,1),
  pres_avg_hpa NUMERIC(6,1),

  -- Quality Metadata
  sample_count SMALLINT NOT NULL,

  -- Storage Metadata
  stored_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_date_hour UNIQUE (date, hour),
  CONSTRAINT valid_hour CHECK (hour >= 10 AND hour <= 18),
  CONSTRAINT valid_direction CHECK (wdir_avg_deg >= 0 AND wdir_avg_deg <= 360),
  CONSTRAINT valid_winds CHECK (wspd_avg_kt >= 0 AND gst_max_kt >= wspd_avg_kt)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_wind_actuals_date
  ON wind_actuals(date DESC);

CREATE INDEX IF NOT EXISTS idx_wind_actuals_stored_at
  ON wind_actuals(stored_at DESC);

CREATE INDEX IF NOT EXISTS idx_wind_actuals_timestamp
  ON wind_actuals(timestamp DESC);

-- Add comments
COMMENT ON TABLE wind_actuals IS
  'Hourly actual wind measurements (10 AM - 6 PM PST) for forecast validation';

COMMENT ON COLUMN wind_actuals.wspd_avg_kt IS
  'Average wind speed in knots (hourly average of 6-minute measurements)';

COMMENT ON COLUMN wind_actuals.gst_max_kt IS
  'Maximum gust speed in knots (peak value during hour)';

COMMENT ON COLUMN wind_actuals.sample_count IS
  'Number of raw 6-minute NOAA measurements aggregated';
