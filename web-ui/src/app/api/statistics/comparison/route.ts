/**
 * Statistics Comparison API Endpoint
 *
 * GET /api/statistics/comparison
 *   - Returns list of available forecasts for dropdown
 *
 * GET /api/statistics/comparison?forecastId=xxx
 *   - Returns comparison data for a specific forecast
 *
 * @module api/statistics/comparison
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  compareForecastToActuals,
  getAvailableForecasts,
} from '@/lib/services/forecast-comparison';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forecastId = searchParams.get('forecastId');

    // If no forecastId, return list of available forecasts
    if (!forecastId) {
      const limit = parseInt(searchParams.get('limit') || '20');
      const forecasts = await getAvailableForecasts(limit);

      return NextResponse.json({
        success: true,
        data: {
          forecasts,
          count: forecasts.length,
        },
      });
    }

    // Compare specific forecast to actuals
    const comparison = await compareForecastToActuals(forecastId);

    if (!comparison) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forecast not found',
          forecastId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comparison,
    });

  } catch (error) {
    console.error('[API-STATISTICS] Error in comparison endpoint:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
