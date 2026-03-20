/**
 * Shared forecast processing utilities
 * Used by both area-forecast and llm-forecast APIs
 */

import { formatInTimeZone } from 'date-fns-tz';
import { PACIFIC_TIMEZONE } from './timezone-utils';

export interface ProcessedForecast {
  processed: string;
  original: string;
  issuedTime: string;
  warnings: string[];
}

/**
 * Extract Inner Waters forecast section from NWS raw data
 */
export function extractInnerWatersForecast(content: string): string | null {
  // Split content by forecast delimiter
  const forecastBlocks = content.split('$$');

  // Find the block containing Inner Waters forecast
  for (let i = 0; i < forecastBlocks.length; i++) {
    const block = forecastBlocks[i];
    if (block.includes('Inner waters from Point Mugu to San Mateo Pt. CA including Santa')) {
      // Add back the $$ delimiter (except for the last block)
      return i < forecastBlocks.length - 1 ? block + '$$' : block;
    }
  }

  return null;
}

/**
 * Extract weather warnings from forecast text
 */
export function extractWarnings(text: string): string[] {
  const warnings: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();

    // Skip overly long lines or header codes to avoid pulling entire forecasts into warnings
    if (trimmedLine.length > 120) continue;
    if (trimmedLine.startsWith('PZZ')) continue;

    // Check for various warning types
    if (trimmedLine.includes('SMALL CRAFT ADVISORY') ||
        trimmedLine.includes('GALE WARNING') ||
        trimmedLine.includes('STORM WARNING') ||
        trimmedLine.includes('HURRICANE WARNING') ||
        trimmedLine.includes('DENSE FOG ADVISORY') ||
        trimmedLine.includes('HIGH SURF ADVISORY')) {
      warnings.push(line.trim());
    }
  }

  return warnings;
}

/**
 * Convert day-of-week periods to relative day format (D0_DAY, D1_NIGHT, etc.)
 *
 * This function processes NWS forecast periods sequentially, converting day-of-week
 * labels (e.g., .SAT..., .SUN NIGHT...) to relative day format (e.g., .D1_DAY..., .D2_NIGHT...).
 * Parses all periods up to 10 days out (safety cap), but content is typically truncated at D4 later.
 */
export function convertPeriodsToRelative(text: string, forecastTime: Date): string {
  // Regex pattern to match NWS period markers like .TONIGHT..., .SAT..., .SUN NIGHT...
  // Handles 2-3 dots after period name (NWS format varies)
  const periodPattern = /\.(TONIGHT|TODAY|REST OF TONIGHT|REST OF TODAY|THIS AFTERNOON|(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY)?(?:\s+NIGHT)?)\s*\.{2,3}/gi;

  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const forecastWeekday = forecastTime.getDay();

  let currentDayOffset = 0;
  let expectingNight = false; // Track whether next period should be NIGHT

  // Determine initial expectation based on issuance time
  const forecastHour = forecastTime.getHours();
  if (forecastHour < 6) {
    // Early morning (before 6 AM): typically starts with REST OF TONIGHT or DAY
    expectingNight = false; // Will be determined by actual first period
  } else if (forecastHour >= 18) {
    // Evening (after 6 PM): starts with TONIGHT
    expectingNight = true;
  } else {
    // Daytime: starts with TODAY or THIS AFTERNOON
    expectingNight = false;
  }

  let processedText = text.replace(periodPattern, (match, periodName) => {
    // Normalize period name to uppercase and trim
    const normalizedPeriod = periodName.toUpperCase().trim();

    let isNightPeriod = false;
    let dayName = normalizedPeriod;

    // Determine if this is a night period
    if (normalizedPeriod === 'TONIGHT' || normalizedPeriod === 'REST OF TONIGHT') {
      isNightPeriod = true;
      dayName = 'TONIGHT';
    } else if (normalizedPeriod.includes(' NIGHT')) {
      isNightPeriod = true;
      dayName = normalizedPeriod.replace(' NIGHT', '').trim();
    } else if (normalizedPeriod === 'TODAY' || normalizedPeriod === 'REST OF TODAY' || normalizedPeriod === 'THIS AFTERNOON') {
      isNightPeriod = false;
      dayName = 'TODAY';
    }

    // Calculate day offset for named weekdays (MON, TUE, etc.)
    if (!['TODAY', 'TONIGHT'].includes(dayName)) {
      // Remove "DAY" suffix if present (e.g., "MONDAY" -> "MON")
      let weekdayAbbr = dayName.replace(/DAY$/, '');

      // Find which future day this weekday corresponds to (up to 10 days out as safety cap)
      let found = false;
      for (let offset = 1; offset <= 10; offset++) {
        const futureDate = new Date(forecastTime);
        futureDate.setDate(forecastTime.getDate() + offset);
        const futureWeekdayName = weekdays[futureDate.getDay()];

        if (weekdayAbbr === futureWeekdayName || weekdayAbbr === futureWeekdayName + 'DAY') {
          currentDayOffset = offset;
          found = true;
          break;
        }
      }

      if (!found) {
        // Weekday is beyond 10 days or not found - skip this period
        console.warn(`[convertPeriodsToRelative] Skipping period "${normalizedPeriod}" - beyond 10-day cap or not found`);
        return match; // Return unchanged
      }
    }

    // Build the replacement string (no cap check - we'll truncate later)
    const suffix = isNightPeriod ? '_NIGHT' : '_DAY';
    const replacement = `.D${currentDayOffset}${suffix}...`;

    // Advance day offset after processing NIGHT periods
    if (isNightPeriod) {
      expectingNight = false;
      // Don't increment yet - wait for next DAY period
    } else {
      expectingNight = true;
      // DAY period processed, next should be NIGHT (or skip to next DAY)
    }

    return replacement;
  });

  return processedText;
}

/**
 * Truncate forecast text to only include periods up to and including maxDay
 * (e.g., maxDay=4 keeps D0-D4, removes D5+)
 */
export function truncateForecastAtDay(text: string, maxDay: number): string {
  // Split into lines
  const lines = text.split('\n');
  const result: string[] = [];

  // Regex to match .DX_DAY... or .DX_NIGHT... patterns
  const dayPattern = /\.D(\d+)_(DAY|NIGHT)\.\.\./;

  for (const line of lines) {
    const match = line.match(dayPattern);
    if (match) {
      const dayNum = parseInt(match[1], 10);
      if (dayNum > maxDay) {
        // Stop including lines once we exceed maxDay
        break;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Calculate mapping of day-of-week periods to relative day numbers
 * Maps up to 10 days out (safety cap), but typically truncated at D4 for LLM usage
 */
export function calculatePeriodDates(forecastTime: Date): Record<string, number> {
  const mappings: Record<string, number> = {};
  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // D0 is always the forecast issuance date
  mappings['TODAY'] = 0;
  mappings['TONIGHT'] = 0;

  // Calculate next 10 days and their weekday names (safety cap)
  // Typically truncated at D4 for LLM consumption
  for (let dayOffset = 1; dayOffset <= 10; dayOffset++) {
    const futureDate = new Date(forecastTime);
    futureDate.setDate(forecastTime.getDate() + dayOffset);
    const weekdayName = weekdays[futureDate.getDay()];

    // Only set mapping if not already set (first occurrence wins)
    if (!mappings[weekdayName]) {
      mappings[weekdayName] = dayOffset;
      mappings[`${weekdayName} NIGHT`] = dayOffset;
    }
  }

  return mappings;
}

/**
 * Generate a day mapping instruction for the LLM prompt.
 * This is used when convertForecastDaysToRelative is false.
 * Instead of converting weekday names in the forecast text, we tell the LLM
 * how to map TODAY/TONIGHT and weekday names to day_0, day_1, etc.
 *
 * @param forecastTime - The NWS forecast issuance time
 * @returns A string instruction to prepend to the forecast in the prompt
 */
export function generateDayMappingInstruction(forecastTime: Date): string {
  // Format the forecast date for clarity
  const dateStr = forecastTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  });

  // Build the mapping table with explicit day/night separation
  // This matches the training data format: "Day X Day:" and "Day X Night:"
  const mappings: string[] = [];

  // Day 0 mappings (split into day and night)
  mappings.push('- TODAY / THIS AFTERNOON / REST OF TODAY → Day 0 Day (day_0 daytime)');
  mappings.push('- TONIGHT / REST OF TONIGHT → Day 0 Night (day_0 overnight)');

  // Generate mappings for the next 4 days (day_1 through day_4)
  // Use Pacific timezone for date arithmetic to avoid UTC timezone issues on Vercel
  for (let offset = 1; offset <= 4; offset++) {
    // Add offset days in milliseconds
    const futureDateUTC = new Date(forecastTime.getTime() + offset * 24 * 60 * 60 * 1000);

    // Get abbreviated and full day-of-week names in Pacific timezone
    const abbr = formatInTimeZone(futureDateUTC, PACIFIC_TIMEZONE, 'EEE').toUpperCase(); // 'SUN', 'MON', etc.
    const full = formatInTimeZone(futureDateUTC, PACIFIC_TIMEZONE, 'EEEE').toUpperCase(); // 'SUNDAY', 'MONDAY', etc.

    // Daytime mapping
    mappings.push(`- ${abbr} / ${full} → Day ${offset} Day (day_${offset} daytime)`);
    // Nighttime mapping
    mappings.push(`- ${abbr} NIGHT / ${full} NIGHT → Day ${offset} Night (day_${offset} overnight)`);
  }

  return `=== DAY MAPPING INSTRUCTION ===
The forecast below was issued on ${dateStr} (this is day_0).
Map forecast periods to training data format as follows:

${mappings.join('\n')}

Your predictions should use day_0, day_1, day_2, day_3, day_4 for the 10 AM - 6 PM daytime hours.
=== END DAY MAPPING ===

`;
}

/**
 * Format forecast for LLM consumption WITHOUT day conversion.
 * Used when convertForecastDaysToRelative is false.
 * - Strips headers/$$/station lines
 * - Normalizes escaped newlines
 * - Converts NWS period markers (.TONIGHT..., .SAT...) to readable format
 * - Collapses excess blank lines
 * - Keeps original weekday names (LLM will use day mapping instruction)
 */
export function formatForecastWithoutDayConversion(rawForecast: string): string {
  let cleaned = rawForecast.replace(/\r/g, '').replace(/\\n/g, '\n');

  // Drop station headers/$$/blank lines
  const lines = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line === '$$') return false;
      if (/^PZZ\d+/i.test(line)) return false;
      if (/Inner waters from Point Mugu/i.test(line)) return false;
      if (/Catalina and Anacapa Islands/i.test(line)) return false;
      if (/San Mateo Pt\.?/i.test(line)) return false;
      if (/-$/.test(line) && /Catalina|Anacapa|Inner waters/i.test(line)) return false;
      if (/^\d{1,3}\s*(AM|PM)\s*PST/i.test(line)) return false;
      return true;
    });

  cleaned = lines.join('\n');

  // Convert NWS period markers to readable format while KEEPING weekday names
  // Pattern matches: .TONIGHT..., .SAT..., .SUN NIGHT..., .TODAY..., etc.
  cleaned = cleaned.replace(
    /\.(TONIGHT|TODAY|REST OF TONIGHT|REST OF TODAY|THIS AFTERNOON|(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY)?(?:\s+NIGHT)?)\s*\.{2,3}/gi,
    (match, periodName) => {
      // Convert to readable format: ".SAT..." -> "SAT:"
      return `${periodName.toUpperCase()}:`;
    }
  );

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{2,}/g, '\n');

  return cleaned.trim();
}

/**
 * Format processed forecast for LLM consumption
 * - Strips headers/$$/station lines
 * - Normalizes escaped newlines
 * - Truncates forecast at D4 (D0-D4 only, 5 days total)
 * - Converts .D0_NIGHT... format to "Day 0 Night:" format to match training examples
 * - Collapses excess blank lines
 */
export function formatForecastForLLM(processedForecast: string): string {
  let cleaned = processedForecast.replace(/\r/g, '').replace(/\\n/g, '\n');

  // Drop station headers/$$/blank lines
  const lines = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line === '$$') return false;
      if (/^PZZ\d+/i.test(line)) return false;
      if (/Inner waters from Point Mugu/i.test(line)) return false;
      if (/Catalina and Anacapa Islands/i.test(line)) return false;
      if (/San Mateo Pt\.?/i.test(line)) return false;
      if (/-$/.test(line) && /Catalina|Anacapa|Inner waters/i.test(line)) return false;
      if (/^\d{1,3}\s*(AM|PM)\s*PST/i.test(line)) return false;
      return true;
    });

  cleaned = lines.join('\n');

  // Truncate forecast at D4 (keeps D0-D4, removes D5+)
  cleaned = truncateForecastAtDay(cleaned, 4);

  // Normalize D# tokens (D0-D4 for LLM training compatibility)
  // D5+ tokens won't appear here due to truncation above
  cleaned = cleaned
    .replace(/\.D0_NIGHT\.\.\./gi, 'Day 0 Night:')
    .replace(/\.D0_DAY\.\.\./gi, 'Day 0 Day:')
    .replace(/\.D1_NIGHT\.\.\./gi, 'Day 1 Night:')
    .replace(/\.D1_DAY\.\.\./gi, 'Day 1 Day:')
    .replace(/\.D2_NIGHT\.\.\./gi, 'Day 2 Night:')
    .replace(/\.D2_DAY\.\.\./gi, 'Day 2 Day:')
    .replace(/\.D3_NIGHT\.\.\./gi, 'Day 3 Night:')
    .replace(/\.D3_DAY\.\.\./gi, 'Day 3 Day:')
    .replace(/\.D4_NIGHT\.\.\./gi, 'Day 4 Night:')
    .replace(/\.D4_DAY\.\.\./gi, 'Day 4 Day:');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{2,}/g, '\n');

  return cleaned.trim();
}
