/**
 * Migration Script: Create wind_actuals table
 *
 * Runs the database migration programmatically using @vercel/postgres
 */

import * as fs from 'fs';
import * as path from 'path';

// Manually load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
    process.env[key] = value;
  }
});

import { sql } from '@vercel/postgres';

async function runMigration() {
  try {
    console.log('[MIGRATION] Starting database migration...');

    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'database/migrations/003_create_wind_actuals.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('[MIGRATION] Executing SQL...');

    // Execute the migration
    await sql.query(migrationSQL);

    console.log('[MIGRATION] ✅ Migration completed successfully!');

    // Verify table was created
    const verification = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wind_actuals'
      ORDER BY ordinal_position
    `;

    console.log('\n[MIGRATION] Table structure:');
    verification.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

    console.log('\n[MIGRATION] Migration complete! 🎉');
    process.exit(0);

  } catch (error) {
    console.error('[MIGRATION] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
