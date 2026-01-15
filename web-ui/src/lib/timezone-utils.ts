/**
 * Timezone Utilities for Wind Forecasting Application
 *
 * Centralized module for all timezone conversions and date formatting.
 * All functions are DST-aware using date-fns-tz library.
 *
 * @module timezone-utils
 */

import { format } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Pacific timezone identifier (handles both PST and PDT automatically)
 */
export const PACIFIC_TIMEZONE = 'America/Los_Angeles';

/**
 * Converts GMT/UTC time components to a Pacific timezone Date object
 *
 * This function handles DST transitions automatically:
 * - PST (UTC-8) in winter
 * - PDT (UTC-7) in summer
 *
 * @param year - Year in GMT
 * @param month - Month in GMT (1-12)
 * @param day - Day in GMT
 * @param hour - Hour in GMT (0-23)
 * @param minute - Minute in GMT (0-59)
 * @returns Date object representing the Pacific time
 *
 * @example
 * // Convert GMT timestamp to Pacific time
 * const pacificDate = convertGMTtoPacific(2024, 3, 15, 20, 30);
 * // Returns Date object for March 15, 2024, 1:30 PM PDT
 */
export function convertGMTtoPacific(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  // Create UTC date
  const gmtDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Use Intl.DateTimeFormat to get actual Pacific time (handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: PACIFIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(gmtDate);
  const pacificYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const pacificMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
  const pacificDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const pacificHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const pacificMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

  return new Date(pacificYear, pacificMonth - 1, pacificDay, pacificHour, pacificMinute);
}

/**
 * Gets the current date/time in Pacific timezone
 *
 * @returns Date object representing current Pacific time
 *
 * @example
 * const now = getCurrentPacificDate();
 */
export function getCurrentPacificDate(): Date {
  return toZonedTime(new Date(), PACIFIC_TIMEZONE);
}

/**
 * Formats a date in Pacific timezone using a format string
 *
 * Uses date-fns format tokens:
 * - yyyy: 4-digit year
 * - MM: 2-digit month
 * - dd: 2-digit day
 * - HH: 2-digit hour (24h)
 * - mm: 2-digit minute
 * - ss: 2-digit second
 *
 * @param date - Date to format
 * @param formatString - Format string using date-fns tokens
 * @returns Formatted date string in Pacific timezone
 *
 * @example
 * const formatted = formatPacificDate(new Date(), 'yyyy-MM-dd HH:mm:ss');
 * // Returns: "2024-03-15 13:30:00"
 */
export function formatPacificDate(
  date: Date,
  formatString: string
): string {
  return formatInTimeZone(date, PACIFIC_TIMEZONE, formatString);
}

/**
 * Gets the current Pacific timezone abbreviation
 *
 * @returns 'PST' in winter, 'PDT' in summer
 *
 * @example
 * const abbr = getPacificTimezoneAbbr();
 * // Returns: "PST" or "PDT"
 */
export function getPacificTimezoneAbbr(): 'PST' | 'PDT' {
  const now = new Date();
  const formatted = formatInTimeZone(now, PACIFIC_TIMEZONE, 'zzz');
  return formatted === 'PDT' ? 'PDT' : 'PST';
}

/**
 * Converts a Date to YYYY-MM-DD string in Pacific timezone
 *
 * @param date - Date to convert (defaults to current date)
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * const dateStr = getPacificDateString();
 * // Returns: "2024-03-15"
 */
export function getPacificDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Gets the 3-letter lowercase month abbreviation in Pacific timezone
 *
 * @param date - Date to get month from (defaults to current date)
 * @returns Month abbreviation: 'jan', 'feb', 'mar', etc.
 *
 * @example
 * const month = getPacificMonthShort();
 * // Returns: "mar"
 */
export function getPacificMonthShort(date: Date = new Date()): string {
  return formatInTimeZone(date, PACIFIC_TIMEZONE, 'MMM').toLowerCase();
}

/**
 * Converts a Date to ISO 8601 string with Pacific timezone offset
 *
 * Format: YYYY-MM-DDTHH:mm:ss-08:00 (PST) or -07:00 (PDT)
 *
 * @param date - Date to convert
 * @returns ISO 8601 string with Pacific timezone offset
 *
 * @example
 * const isoStr = getPacificISOString(new Date());
 * // Returns: "2024-03-15T13:30:00-07:00"
 */
export function getPacificISOString(date: Date): string {
  const formatted = formatInTimeZone(date, PACIFIC_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return formatted;
}

/**
 * Gets the Pacific timezone offset in hours for a given date
 *
 * @param date - Date to get offset for (defaults to current date)
 * @returns Offset in hours (-8 for PST, -7 for PDT)
 *
 * @example
 * const offset = getPacificTimezoneOffset();
 * // Returns: -8 or -7
 */
export function getPacificTimezoneOffset(date: Date = new Date()): number {
  const offsetStr = formatInTimeZone(date, PACIFIC_TIMEZONE, 'XXX');
  // Parse offset like "-08:00" or "-07:00"
  const hours = parseInt(offsetStr.split(':')[0]);
  return hours;
}

/**
 * Formats a timestamp string for display with timezone indicator
 *
 * @param date - Date to format
 * @param includeSeconds - Whether to include seconds (default: false)
 * @returns Formatted string like "Mar 15, 2024 1:30 PM PST"
 *
 * @example
 * const display = formatPacificDateTime(new Date());
 * // Returns: "Mar 15, 2024 1:30 PM PDT"
 */
export function formatPacificDateTime(date: Date, includeSeconds: boolean = false): string {
  const timeFormat = includeSeconds ? 'h:mm:ss a' : 'h:mm a';
  const formatted = formatInTimeZone(date, PACIFIC_TIMEZONE, `MMM dd, yyyy ${timeFormat}`);
  const tz = getPacificTimezoneAbbr();
  return `${formatted} ${tz}`;
}

/**
 * Checks if a date is currently in PDT (Pacific Daylight Time)
 *
 * @param date - Date to check (defaults to current date)
 * @returns true if PDT, false if PST
 *
 * @example
 * const isDaylight = isPacificDaylightTime();
 * // Returns: true (if in summer) or false (if in winter)
 */
export function isPacificDaylightTime(date: Date = new Date()): boolean {
  return getPacificTimezoneAbbr() === 'PDT';
}
