/**
 * Dummy Wind Forecast Data Generator
 *
 * Generates realistic wind forecast data for development and testing purposes.
 * Used as fallback when LLM forecast API is unavailable.
 *
 * IMPORTANT: Only used when configuration flag is enabled.
 * Production default: DISABLED
 */

import { getWindDirectionText } from '@/lib/wind-utils';

/**
 * Forecast prediction structure matching LLM API output
 */
interface ForecastPrediction {
  time: string;              // "10 AM", "11 AM", "12 PM", etc.
  windSpeed: number;         // Wind speed in knots (1 decimal)
  gustSpeed: number;         // Gust speed in knots (1 decimal)
  windDirection: number;     // Direction in degrees (0-360)
  windDirectionText: string; // Compass direction ("SW", "W", etc.)
  isEmpty: boolean;          // Always false for dummy data
}

/**
 * Generate realistic 5-day wind forecast data
 *
 * Returns 5 days of hourly predictions (10 AM - 6 PM = 9 hours per day)
 * Simulates LA coastal thermal wind patterns:
 * - Morning calm (40-50% of peak)
 * - Midday build (70-85% of peak)
 * - Afternoon maximum (95-100% of peak, typically 2-3 PM)
 * - Evening decline (50-90% of peak)
 *
 * @returns Array of 5 days, each containing 9 hourly predictions
 */
export function generateDummyForecast(): ForecastPrediction[][] {
  // Daily peak wind speeds (knots) - provides day-to-day variation
  const dailyPeaks = [
    16,  // Day 0 (Today): Moderate
    20,  // Day 1 (Tomorrow): Strong
    12,  // Day 2: Light
    14,  // Day 3: Moderate
    24   // Day 4: Very Strong
  ];

  const days: ForecastPrediction[][] = [];

  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    const dayData: ForecastPrediction[] = [];
    const peakSpeed = dailyPeaks[dayIndex];

    // Generate hourly predictions for 10 AM - 6 PM (9 hours)
    for (let hour = 10; hour <= 18; hour++) {
      // Calculate wind speed based on thermal progression
      const speedFactor = getSpeedFactor(hour);
      const windSpeed = Math.round((peakSpeed * speedFactor) * 10) / 10;
      const gustSpeed = Math.round((windSpeed * 1.35) * 10) / 10;

      // Calculate wind direction (SW to W progression throughout day)
      const direction = getWindDirection(hour, dayIndex);
      const directionText = getWindDirectionText(direction);

      // Format time string
      const time = formatTimeString(hour);

      dayData.push({
        time,
        windSpeed,
        gustSpeed,
        windDirection: direction,
        windDirectionText: directionText,
        isEmpty: false
      });
    }

    days.push(dayData);
  }

  return days;
}

/**
 * Get wind speed factor for thermal wind curve
 *
 * Simulates typical LA coastal pattern:
 * - Light winds in morning (thermal heating just starting)
 * - Progressive increase through midday
 * - Peak at 2-3 PM (maximum thermal differential)
 * - Gradual decline into evening
 *
 * @param hour - Hour of day (10-18)
 * @returns Speed factor (0.0 - 1.0) to multiply by peak speed
 */
function getSpeedFactor(hour: number): number {
  const factors: Record<number, number> = {
    10: 0.4,   // 10 AM: 40% of peak (morning calm)
    11: 0.5,   // 11 AM: 50% (warming begins)
    12: 0.7,   // 12 PM: 70% (midday build)
    13: 0.85,  // 1 PM: 85% (approaching peak)
    14: 0.95,  // 2 PM: 95% (near maximum)
    15: 1.0,   // 3 PM: 100% PEAK (maximum thermal differential)
    16: 0.9,   // 4 PM: 90% (beginning decline)
    17: 0.7,   // 5 PM: 70% (evening decrease)
    18: 0.5    // 6 PM: 50% (thermal dying)
  };

  return factors[hour] || 0.4;
}

/**
 * Calculate wind direction with daily and hourly variation
 *
 * Simulates SW to W progression:
 * - Morning: 200-220° (SSW to SW) - offshore flow beginning
 * - Afternoon: 240-260° (SW to W) - thermal peak
 * - Evening: 260-280° (W to WNW) - backing as thermal dies
 *
 * Daily variation: ±20° between days for realism
 *
 * @param hour - Hour of day (10-18)
 * @param dayIndex - Day index (0-4) for day-to-day variation
 * @returns Wind direction in degrees (0-360)
 */
function getWindDirection(hour: number, dayIndex: number): number {
  // Base direction shifts throughout day (8° per hour)
  // 10 AM: 200° → 6 PM: 264°
  const baseDirection = 200 + (hour - 10) * 8;

  // Add daily variation (±20° across 5 days)
  const dayVariation = (dayIndex - 2) * 10;  // -20, -10, 0, +10, +20

  // Clamp to valid range
  return Math.min(360, Math.max(0, baseDirection + dayVariation));
}

/**
 * Format hour number to time string
 *
 * @param hour - Hour of day (10-18)
 * @returns Formatted time string ("10 AM", "12 PM", "1 PM", etc.)
 */
function formatTimeString(hour: number): string {
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}
