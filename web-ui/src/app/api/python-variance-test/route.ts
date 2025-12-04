import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Python Variance Test API
 *
 * Runs the Python variance test script (no expensive production API calls)
 * Returns saved results from variance_test_results.json
 */

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const numRuns = Math.min(parseInt(url.searchParams.get('runs') || '5'), 10);
    const forceRun = url.searchParams.get('force') === 'true';

    console.log(`[PYTHON-VARIANCE] Request for ${numRuns} runs (force: ${forceRun})`);

    // Check if we have cached results
    const resultsPath = path.join(process.cwd(), 'data', 'variance_test_results.json');
    let existingResults = null;

    try {
      const content = await fs.readFile(resultsPath, 'utf-8');
      existingResults = JSON.parse(content);

      // Return cached results if they match the requested number of runs and not forcing
      if (!forceRun && existingResults.num_runs === numRuns) {
        console.log('[PYTHON-VARIANCE] Returning cached results');
        return NextResponse.json({
          success: true,
          data: existingResults,
          cached: true
        });
      }
    } catch (e) {
      // No cached results or error reading them
      console.log('[PYTHON-VARIANCE] No cached results found');
    }

    // Run the Python script
    console.log('[PYTHON-VARIANCE] Running Python variance test...');

    const scriptPath = path.join(process.cwd(), '..', 'scripts', 'variance_test.py');
    const command = `python3 "${scriptPath}" ${numRuns}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        env: {
          ...process.env,
          PYTHONPATH: path.join(process.cwd(), '..', 'scripts')
        },
        timeout: 300000 // 5 minute timeout
      });

      console.log('[PYTHON-VARIANCE] Script completed');
      if (stderr) {
        console.warn('[PYTHON-VARIANCE] stderr:', stderr);
      }

      // Read the results file
      const content = await fs.readFile(resultsPath, 'utf-8');
      const results = JSON.parse(content);

      return NextResponse.json({
        success: true,
        data: results,
        cached: false
      });

    } catch (error: any) {
      console.error('[PYTHON-VARIANCE] Script execution error:', error);

      return NextResponse.json({
        success: false,
        error: 'Failed to run Python variance test',
        details: error.message,
        stderr: error.stderr,
        stdout: error.stdout
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[PYTHON-VARIANCE] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
