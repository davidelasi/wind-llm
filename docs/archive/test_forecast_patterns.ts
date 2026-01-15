/**
 * Diagnostic script to demonstrate the forecast pattern issue
 *
 * This simulates what the current code does and shows why patterns repeat
 */

interface Prediction {
  hour: number;
  windSpeed: number;
  gustSpeed: number;
  windDirection: number;
}

// Simulate a realistic single-day LLM prediction
const day0BasePrediction: Prediction[] = [
  { hour: 11, windSpeed: 8.5, gustSpeed: 11.2, windDirection: 220 },
  { hour: 12, windSpeed: 10.2, gustSpeed: 13.5, windDirection: 225 },
  { hour: 13, windSpeed: 12.8, gustSpeed: 16.4, windDirection: 230 },
  { hour: 14, windSpeed: 14.1, gustSpeed: 18.2, windDirection: 235 },
  { hour: 15, windSpeed: 13.5, gustSpeed: 17.1, windDirection: 240 },
  { hour: 16, windSpeed: 11.9, gustSpeed: 15.3, windDirection: 242 },
  { hour: 17, windSpeed: 9.8, gustSpeed: 12.9, windDirection: 245 },
  { hour: 18, windSpeed: 7.5, gustSpeed: 10.1, windDirection: 248 },
];

// This is what the CURRENT CODE does (lines 372-387)
function generateCurrentBehavior(basePredictions: Prediction[]): Prediction[][] {
  const allDays: Prediction[][] = [];

  for (let day = 0; day < 5; day++) {
    const dayPredictions = basePredictions.map(pred => ({
      ...pred,
      // Add some variation for future days
      windSpeed: parseFloat((pred.windSpeed * (1 + (day * 0.1))).toFixed(1)),
      gustSpeed: parseFloat((pred.gustSpeed * (1 + (day * 0.1))).toFixed(1)),
      windDirection: (pred.windDirection + (day * 5)) % 360,
    }));
    allDays.push(dayPredictions);
  }

  return allDays;
}

// Generate the problematic multi-day forecast
const problematicForecast = generateCurrentBehavior(day0BasePrediction);

// Print analysis
console.log('=== CURRENT BEHAVIOR ANALYSIS ===\n');

problematicForecast.forEach((day, dayIndex) => {
  console.log(`Day ${dayIndex} (scaling: ${1 + dayIndex * 0.1}x, dir offset: +${dayIndex * 5}°):`);

  const avgWind = day.reduce((sum, h) => sum + h.windSpeed, 0) / day.length;
  const maxGust = Math.max(...day.map(h => h.gustSpeed));
  const avgDir = day.reduce((sum, h) => sum + h.windDirection, 0) / day.length;

  console.log(`  Average wind: ${avgWind.toFixed(1)} kt`);
  console.log(`  Max gust: ${maxGust.toFixed(1)} kt`);
  console.log(`  Avg direction: ${avgDir.toFixed(0)}°`);

  // Show the pattern shape (normalized)
  const pattern = day.map(h => Math.round((h.windSpeed / maxGust) * 10));
  console.log(`  Pattern shape: ${pattern.join('-')}`);
  console.log('');
});

console.log('\n=== PATTERN ANALYSIS ===\n');

// Compare pattern shapes (they should be identical when normalized)
console.log('Normalized patterns (0-10 scale):');
problematicForecast.forEach((day, dayIndex) => {
  const maxWind = Math.max(...day.map(h => h.windSpeed));
  const normalized = day.map(h => Math.round((h.windSpeed / maxWind) * 10));
  console.log(`Day ${dayIndex}: ${normalized.join('-')}`);
});

console.log('\n⚠️  NOTICE: All days have IDENTICAL normalized patterns!');
console.log('This is because they are all derived from the same base prediction.\n');

console.log('\n=== WHAT REAL FORECASTS SHOULD LOOK LIKE ===\n');
console.log('Real multi-day forecasts have:');
console.log('  - Different patterns based on weather systems');
console.log('  - Fronts passing through change wind direction significantly');
console.log('  - High pressure vs low pressure create different wind profiles');
console.log('  - Thermal effects vary by day based on cloud cover, temperature');
console.log('  - Each day should have independent prediction from NWS forecast\n');

// Show how wind direction artificially progresses
console.log('\n=== WIND DIRECTION PROGRESSION ===\n');
console.log('Peak wind direction at 2 PM each day:');
problematicForecast.forEach((day, dayIndex) => {
  const peakHour = day.find(h => h.hour === 14);
  console.log(`Day ${dayIndex}: ${peakHour?.windDirection}° (base + ${dayIndex * 5}°)`);
});

console.log('\n⚠️  NOTICE: Direction shifts by exactly 5° per day!');
console.log('Real wind direction changes are based on weather systems, not arithmetic.\n');

export { generateCurrentBehavior, day0BasePrediction };
