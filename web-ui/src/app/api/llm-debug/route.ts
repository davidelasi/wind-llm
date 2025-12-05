import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    paths: {},
    files: {},
    errors: []
  };

  try {
    // 1. Check environment variables
    debugInfo.environment = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
      cwd: process.cwd()
    };

    // 2. Check training file paths
    const currentDate = new Date();
    const month = currentDate.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
    const hour = currentDate.getHours();
    let forecastNumber = 1;
    if (hour >= 6 && hour < 14) forecastNumber = 1;
    else if (hour >= 14 && hour < 20) forecastNumber = 2;
    else forecastNumber = 3;

    debugInfo.paths = {
      month,
      hour,
      forecastNumber,
      expectedFileName: `${month}_fc${forecastNumber}_examples.json`
    };

    // 3. Try different path resolutions
    const pathsToTry = [
      path.join(process.cwd(), '..', 'data', 'training', 'few_shot_examples', `${month}_fc${forecastNumber}_examples.json`),
      path.join(process.cwd(), '..', '..', 'data', 'training', 'few_shot_examples', `${month}_fc${forecastNumber}_examples.json`),
      path.join('/Users/davidelasi/Documents/Wind_Model/wind-forecast-llm/data/training/few_shot_examples', `${month}_fc${forecastNumber}_examples.json`)
    ];

    debugInfo.files = {};

    for (let i = 0; i < pathsToTry.length; i++) {
      const testPath = pathsToTry[i];
      try {
        await fs.access(testPath);
        debugInfo.files[`path_${i}`] = { path: testPath, exists: true };

        // Try to read the file
        const content = await fs.readFile(testPath, 'utf-8');
        const parsed = JSON.parse(content);
        debugInfo.files[`path_${i}`].size = content.length;
        debugInfo.files[`path_${i}`].examples = Array.isArray(parsed) ? parsed.length : 'not_array';
      } catch (error) {
        debugInfo.files[`path_${i}`] = {
          path: testPath,
          exists: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // 4. Test NWS API (without actually calling it)
    debugInfo.nws = {
      url: 'https://api.weather.gov/products/types/CWF/locations/LOX',
      note: 'Not actually called in debug mode'
    };

    // 5. Test Anthropic import
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      debugInfo.anthropic = {
        imported: true,
        hasApiKey: !!process.env.ANTHROPIC_API_KEY
      };
    } catch (error) {
      debugInfo.anthropic = {
        imported: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    return NextResponse.json({
      success: true,
      debug: debugInfo
    });

  } catch (error) {
    debugInfo.errors.push({
      type: 'unexpected',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json({
      success: false,
      debug: debugInfo
    }, { status: 500 });
  }
}