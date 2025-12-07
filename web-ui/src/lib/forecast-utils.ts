/**
 * Shared forecast processing utilities
 * Used by both area-forecast and llm-forecast APIs
 */

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
 */
export function convertPeriodsToRelative(text: string, forecastTime: Date): string {
  const forecastDate = forecastTime.getDate();
  const forecastMonth = forecastTime.getMonth();
  const forecastYear = forecastTime.getFullYear();

  // Calculate period mappings
  const periodMappings = calculatePeriodDates(forecastTime);

  let processedText = text;

  // Convert periods to relative format
  for (const [period, dayOffset] of Object.entries(periodMappings)) {
    const relativeDay = `D${dayOffset}`;

    // Handle night periods
    if (period.includes('NIGHT')) {
      const dayPart = period.replace(' NIGHT', '');
      processedText = processedText.replace(
        new RegExp(`\\.${period}\\b`, 'gi'),
        `.${relativeDay}_NIGHT`
      );
    } else {
      // Handle day periods
      if (period === 'TODAY') {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_DAY`
        );
      } else if (period === 'TONIGHT') {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_NIGHT`
        );
      } else {
        processedText = processedText.replace(
          new RegExp(`\\.${period}\\b`, 'gi'),
          `.${relativeDay}_DAY`
        );
      }
    }
  }

  return processedText;
}

/**
 * Calculate mapping of day-of-week periods to relative day numbers
 */
export function calculatePeriodDates(forecastTime: Date): Record<string, number> {
  const mappings: Record<string, number> = {};
  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // D0 is always the forecast issuance date
  mappings['TODAY'] = 0;
  mappings['TONIGHT'] = 0;

  // Calculate next 5 days and their weekday names
  // Limited to 5 days to match NWS forecast horizon and prevent weekday name collisions
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
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
 * Format processed forecast for LLM consumption
 * Converts .D0_NIGHT... format to "Day 0 Night:" format to match training examples
 */
export function formatForecastForLLM(processedForecast: string): string {
  // Simple string replacements - no regex parsing, no period extraction
  return processedForecast
    .replace(/\.D0_NIGHT\.\.\./g, 'Day 0 Night:')
    .replace(/\.D0_DAY\.\.\./g, 'Day 0 Day:')
    .replace(/\.D1_NIGHT\.\.\./g, 'Day 1 Night:')
    .replace(/\.D1_DAY\.\.\./g, 'Day 1 Day:')
    .replace(/\.D2_NIGHT\.\.\./g, 'Day 2 Night:')
    .replace(/\.D2_DAY\.\.\./g, 'Day 2 Day:')
    .replace(/\.D3_NIGHT\.\.\./g, 'Day 3 Night:')
    .replace(/\.D3_DAY\.\.\./g, 'Day 3 Day:')
    .replace(/\.D4_NIGHT\.\.\./g, 'Day 4 Night:')
    .replace(/\.D4_DAY\.\.\./g, 'Day 4 Day:')
    .replace(/\.D5_NIGHT\.\.\./g, 'Day 5 Night:')
    .replace(/\.D5_DAY\.\.\./g, 'Day 5 Day:');
}
