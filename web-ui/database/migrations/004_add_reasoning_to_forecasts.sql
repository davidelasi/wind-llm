-- Add nullable reasoning column to forecasts table.
-- Existing rows will have NULL (reasoning not available for forecasts before this migration).
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS reasoning TEXT;
