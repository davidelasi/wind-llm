/**
 * Shared Wind Data Utilities
 *
 * Common functions used across pages and components for wind data processing,
 * formatting, and display logic.
 */

import type { WindDataPoint, DayData } from '@/types/wind-data';

/**
 * Convert wind direction in degrees to compass direction text
 */
export function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Get color class for wind speed visualization
 * Based on Beaufort scale adapted for ocean sports
 */
export function getWindSpeedColor(speedKnots: number): string {
  if (speedKnots < 5) return 'bg-gray-400';        // Calm
  if (speedKnots < 10) return 'bg-blue-400';       // Light air/breeze
  if (speedKnots < 15) return 'bg-green-400';      // Gentle/moderate breeze
  if (speedKnots < 20) return 'bg-yellow-400';     // Fresh breeze
  if (speedKnots < 25) return 'bg-orange-400';     // Strong breeze
  return 'bg-red-500';                              // Near gale+
}

/**
 * Get text color for wind speed (for use with colored backgrounds)
 */
export function getWindSpeedTextColor(speedKnots: number): string {
  // Use dark text for lighter colors, white text for darker colors
  if (speedKnots < 20) return 'text-gray-900';
  return 'text-white';
}

/**
 * Check if wind conditions are dangerous (for safety warnings)
 */
export function isDangerousWindCondition(gustKnots: number): boolean {
  return gustKnots > 25;
}

/**
 * Filter hourly wind data by time window
 * @param hourlyData - Array of wind data points
 * @param startHour - Start hour (0-23), inclusive
 * @param endHour - End hour (0-23), inclusive
 * @returns Filtered array of data points
 */
export function filterByTimeWindow(
  hourlyData: WindDataPoint[],
  startHour: number,
  endHour: number
): WindDataPoint[] {
  return hourlyData.filter(point => {
    const hour = point.hour;
    return hour >= startHour && hour <= endHour;
  });
}

/**
 * Get forecast time slots (11 AM - 6 PM)
 * Standard window for ocean sports forecasting
 */
export function getForecastTimeSlots(): string[] {
  return ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
}

/**
 * Get forecast hour numbers (11 AM - 6 PM)
 */
export function getForecastHours(): number[] {
  return [11, 12, 13, 14, 15, 16, 17, 18];
}

/**
 * Map hourly data to forecast time slots (11 AM - 6 PM)
 * Fills in null for missing hours
 */
export function mapToForecastWindow(hourlyData: WindDataPoint[]): (WindDataPoint | null)[] {
  const forecastHours = getForecastHours();
  const hourMap = new Map(hourlyData.map(point => [point.hour, point]));

  return forecastHours.map(hour => hourMap.get(hour) || null);
}

/**
 * Format wind speed for display
 */
export function formatWindSpeed(speedKnots: number | null | undefined): string {
  if (speedKnots === null || speedKnots === undefined) return '--';
  return `${speedKnots.toFixed(1)} kt`;
}

/**
 * Format temperature for display
 */
export function formatTemperature(tempCelsius: number | null | undefined): string {
  if (tempCelsius === null || tempCelsius === undefined || tempCelsius === 0) return '--';
  return `${tempCelsius.toFixed(1)}°C`;
}

/**
 * Format pressure for display
 */
export function formatPressure(pressureHpa: number | null | undefined): string {
  if (pressureHpa === null || pressureHpa === undefined || pressureHpa === 0) return '--';
  return `${pressureHpa.toFixed(1)} hPa`;
}

/**
 * Find day data by date key
 */
export function findDayByDate(days: DayData[], dateKey: string): DayData | undefined {
  return days.find(day => day.date === dateKey);
}

/**
 * Get wind condition description
 */
export function getWindConditionDescription(avgSpeed: number, maxGust: number): string {
  if (avgSpeed < 5) return 'Calm';
  if (avgSpeed < 10) return 'Light';
  if (avgSpeed < 15) return 'Moderate';
  if (avgSpeed < 20) return 'Fresh';
  if (maxGust > 25) return 'Dangerous';
  return 'Strong';
}

/**
 * Calculate wind consistency (how steady the wind is)
 * Returns a value between 0 (highly variable) and 1 (very steady)
 */
export function calculateWindConsistency(hourlyData: WindDataPoint[]): number {
  if (hourlyData.length < 2) return 1;

  const speeds = hourlyData.map(p => p.windSpeed);
  const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

  if (avgSpeed === 0) return 1;

  const variance = speeds.reduce((sum, speed) => sum + Math.pow(speed - avgSpeed, 2), 0) / speeds.length;
  const coefficientOfVariation = Math.sqrt(variance) / avgSpeed;

  // Convert to 0-1 scale where lower CV = higher consistency
  return Math.max(0, Math.min(1, 1 - coefficientOfVariation));
}

/**
 * Check if a day has complete data for the forecast window
 */
export function hasCompleteForecastData(dayData: DayData): boolean {
  const forecastHours = getForecastHours();
  const availableHours = new Set(dayData.hourlyData.map(p => p.hour));

  return forecastHours.every(hour => availableHours.has(hour));
}

/**
 * Get the best sailing/sports hours from a day's data
 * Returns array of hours sorted by most favorable conditions
 */
export function getBestWindHours(dayData: DayData): number[] {
  // Filter to forecast window and sort by ideal conditions
  const forecastData = filterByTimeWindow(dayData.hourlyData, 11, 18);

  // Score each hour (higher is better)
  const scored = forecastData.map(point => ({
    hour: point.hour,
    score: calculateHourScore(point)
  }));

  // Sort by score descending
  return scored
    .sort((a, b) => b.score - a.score)
    .map(item => item.hour);
}

/**
 * Calculate a score for an hour (0-100)
 * Higher score = better conditions for ocean sports
 */
function calculateHourScore(point: WindDataPoint): number {
  let score = 50; // Base score

  // Ideal wind speed is 10-18 knots
  if (point.windSpeed >= 10 && point.windSpeed <= 18) {
    score += 30;
  } else if (point.windSpeed >= 8 && point.windSpeed <= 22) {
    score += 15;
  } else if (point.windSpeed < 5 || point.windSpeed > 25) {
    score -= 20;
  }

  // Penalize dangerous gusts
  if (point.gustSpeed > 25) {
    score -= 30;
  } else if (point.gustSpeed > 22) {
    score -= 10;
  }

  // Penalize extreme gust ratio (gusty = less pleasant)
  const gustRatio = point.gustSpeed / Math.max(point.windSpeed, 1);
  if (gustRatio > 1.5) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}
