/**
 * Database Utilities
 *
 * Provides helpers for database operations with support for local development bypass.
 *
 * PHILOSOPHY: We do not maintain a local copy of the production database.
 * When running locally (localhost/development), database calls are skipped
 * and empty results are returned gracefully. This allows UI development
 * without database infrastructure.
 *
 * @module db-utils
 */

import modelConfig from '@/../config/model_config.json';

/**
 * Check if we're running in a local/development environment
 */
export function isLocalDevelopment(): boolean {
  // Check various indicators of local development
  const isDev = process.env.NODE_ENV === 'development';
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Server-side check for local development
  const isServerLocal = typeof window === 'undefined' && (
    process.env.NODE_ENV === 'development' ||
    !process.env.VERCEL ||
    process.env.VERCEL_ENV === 'development'
  );

  return isDev || isLocalhost || isServerLocal;
}

/**
 * Check if database calls should be skipped
 *
 * Returns true if:
 * 1. Running in local development AND
 * 2. skipDatabaseInDevelopment config is true
 *
 * When this returns true, services should return empty/default results
 * instead of making actual database calls.
 */
export function shouldSkipDatabase(): boolean {
  const skipConfig = (modelConfig as { skipDatabaseInDevelopment?: boolean }).skipDatabaseInDevelopment;

  // Default to true if not specified (safe default for local dev)
  const shouldSkip = skipConfig !== false;

  return isLocalDevelopment() && shouldSkip;
}

/**
 * Log a message indicating database was skipped (for debugging)
 */
export function logDatabaseSkipped(operation: string): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB-SKIP] ${operation} - skipped in local development`);
  }
}
