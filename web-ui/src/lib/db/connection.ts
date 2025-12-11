import { sql } from '@vercel/postgres';

/**
 * Get database connection
 * Uses Vercel Postgres connection pooling for serverless
 */
export function getDb() {
  return sql;
}

/**
 * Test database connection
 * Returns true if connection is healthy
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as test`;
    return result.rows.length === 1;
  } catch (error) {
    console.error('[DB] Connection test failed:', error);
    return false;
  }
}
