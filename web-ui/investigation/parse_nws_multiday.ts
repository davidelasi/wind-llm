/**
 * Example parser for multi-day NWS forecasts
 *
 * This shows how to extract individual day forecasts from the NWS coastal forecast text
 */

interface DayForecast {
  day: number;        // 0 = today, 1 = tomorrow, etc.
  period: string;     // "TODAY", "TONIGHT", "SATURDAY", etc.
  text: string;       // The forecast text for this period
}

/**
 * Parse NWS coastal forecast into individual day/period forecasts
 */
function parseMultiDayForecast(forecastText: string): DayForecast[] {
  const forecasts: DayForecast[] = [];

  // NWS forecasts use periods like:
  // .TODAY...
  // .TONIGHT...
  // .SATURDAY...
  // .SATURDAY NIGHT...
  // .SUNDAY...
  // etc.

  // Split by periods (lines starting with .)
  const periodRegex = /\.(TODAY|TONIGHT|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)([^.]*?)(?=\.|$)/gi;

  let match;
  let currentDay = 0;
  let lastDayPeriod = '';

  while ((match = periodRegex.exec(forecastText)) !== null) {
    const period = match[1].toUpperCase();
    const text = match[2].trim();

    // Determine which day this is
    if (period === 'TODAY') {
      currentDay = 0;
      lastDayPeriod = period;
    } else if (period === 'TONIGHT') {
      currentDay = 0; // Night of day 0
    } else {
      // For named days (SATURDAY, SUNDAY, etc.)
      // Check if we've seen this day before (means we moved to next day)
      if (period !== lastDayPeriod && !period.includes('NIGHT')) {
        currentDay++;
        lastDayPeriod = period;
      }
    }

    forecasts.push({
      day: currentDay,
      period: period,
      text: text
    });
  }

  return forecasts;
}

/**
 * Combine day and night forecasts for a single day
 */
function combineDayNightForecasts(forecasts: DayForecast[], day: number): string {
  const dayForecasts = forecasts.filter(f => f.day === day);

  if (dayForecasts.length === 0) {
    return '';
  }

  // Combine day and night forecasts with context
  return dayForecasts.map(f => `${f.period}: ${f.text}`).join('\n');
}

// Example usage
const exampleNWSForecast = `
INNER WATERS FROM POINT MUGU TO SAN MATEO POINT CA INCLUDING
SANTA CATALINA AND ANACAPA ISLANDS

.TODAY...SW winds 10 to 15 kt. Seas 3 to 5 ft. Slight chance of rain.

.TONIGHT...SW winds 5 to 10 kt. Seas 2 to 4 ft.

.SATURDAY...W winds 15 to 20 kt becoming NW in the afternoon. Seas 4 to 6 ft. Small Craft Advisory in effect.

.SATURDAY NIGHT...NW winds 10 to 15 kt. Seas 3 to 5 ft.

.SUNDAY...NW winds 8 to 12 kt becoming variable in the afternoon. Seas 2 to 4 ft.

.MONDAY...Variable winds 5 to 10 kt becoming SW in the afternoon. Seas 2 to 3 ft.

.TUESDAY...SW winds 12 to 18 kt. Seas 3 to 5 ft.
`;

console.log('=== NWS Multi-Day Forecast Parser Demo ===\n');

const parsed = parseMultiDayForecast(exampleNWSForecast);

console.log('Parsed Periods:');
parsed.forEach(p => {
  console.log(`  Day ${p.day} - ${p.period}: ${p.text.substring(0, 50)}...`);
});

console.log('\n=== Combined Day Forecasts ===\n');

for (let day = 0; day < 5; day++) {
  const combined = combineDayNightForecasts(parsed, day);
  if (combined) {
    console.log(`Day ${day}:`);
    console.log(combined);
    console.log('');
  }
}

console.log('\n=== How This Should Be Used ===\n');
console.log('1. Parse NWS forecast into individual days');
console.log('2. For each day (0-4):');
console.log('   a. Extract that day\'s forecast text');
console.log('   b. Create LLM prompt with Day 0 training examples');
console.log('   c. Ask LLM to predict that specific day');
console.log('   d. Collect prediction');
console.log('3. Combine all 5 day predictions');
console.log('4. Return to frontend');
console.log('\nThis gives each day an independent, weather-based prediction!');

export { parseMultiDayForecast, combineDayNightForecasts };
