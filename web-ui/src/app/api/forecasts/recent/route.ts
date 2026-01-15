import { NextResponse } from 'next/server';
import { getRecentForecasts } from '@/lib/services/forecast-storage';

/**
 * GET /api/forecasts/recent?limit=10
 *
 * Returns recent stored forecasts for verification
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const forecasts = await getRecentForecasts(limit);

    return NextResponse.json({
      success: true,
      count: forecasts.length,
      forecasts
    });

  } catch (error) {
    console.error('[API] Failed to fetch recent forecasts:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch forecasts'
    }, { status: 500 });
  }
}
