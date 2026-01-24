/**
 * Shared LLM Prompt Construction
 * Used by both llm-forecast API and sausage-mode API
 */

export interface TrainingExample {
  forecast: {
    day_0_day?: string;
    day_0_night?: string;
    day_1_day?: string;
    day_1_night?: string;
    day_2_day?: string;
    day_2_night?: string;
    day_3_day?: string;
    day_3_night?: string;
    day_4_day?: string;
  };
  actual: {
    day_0?: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
    day_1?: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
    day_2?: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
    day_3?: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
    day_4?: {
      date: string;
      hourly: Array<{
        hour: string;
        wspd_avg_kt: number;
        gst_max_kt: number;
      }>;
    };
  };
  issued?: string;
  issuance_time?: string;
  issuanceTime?: string;
}

/**
 * Create few-shot prompt for LLM wind forecasting
 * This is the exact prompt format used in production
 */
export function createFewShotPrompt(
  formattedForecast: string,
  warnings: string[],
  examples: TrainingExample[],
  dayMappingInstruction?: string,
  geographicContext?: string
): string {
  const systemPrompt = `You are an expert wind forecasting system for ocean sports at AGXC1 station (Los Angeles area).

Your task is to predict hourly wind speed (WSPD), gust speed (GST), and wind direction for 10 AM - 6 PM PST for the next 5 days based on NWS coastal forecasts.

Key requirements:
- Predict for exactly 8 hours per day: 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 3 PM, 4 PM, 5 PM (each bucket represents the hour ending 11 AM through 6 PM PST)
- Return wind speeds in knots (kt) with 1 decimal place
- Return wind direction in degrees (0-360) as integer
- Consider that this time window is critical for sailing/surfing activities
- Account for typical thermal wind patterns in the LA area
- Pay attention to weather warnings and advisories

Here are ${examples.length} examples showing how NWS multi-day forecasts translate to actual conditions:

`;

  let examplesText = '';
  examples.slice(0, 15).forEach((example, index) => {
    // Skip examples without proper structure
    if (!example.forecast || !example.actual || !example.actual.day_0) {
      return;
    }

    examplesText += `=== EXAMPLE ${index + 1} ===\n`;

    // Add issuance context if available
    const issuedDate = example.issued || example.issuance_time || example.issuanceTime;
    if (issuedDate) {
      examplesText += `Forecast issued on ${issuedDate} (Day 0)\n`;
    }

    examplesText += `FORECAST:\n`;

    // Include ALL forecast periods (day_0_night through day_4_day)
    const forecastPeriods: [keyof TrainingExample['forecast'], string][] = [
      ['day_0_night', 'Day 0 Night'],
      ['day_1_day', 'Day 1 Day'],
      ['day_1_night', 'Day 1 Night'],
      ['day_2_day', 'Day 2 Day'],
      ['day_2_night', 'Day 2 Night'],
      ['day_3_day', 'Day 3 Day'],
      ['day_3_night', 'Day 3 Night'],
      ['day_4_day', 'Day 4 Day']
    ];

    forecastPeriods.forEach(([key, label]) => {
      const text = example.forecast[key];
      if (text) {
        examplesText += `${label}: ${text}\n`;
      }
    });

    examplesText += `\nACTUAL WIND CONDITIONS:\n`;

    // Include multi-day actual data (day_0 through day_4 when available)
    (['day_0', 'day_1', 'day_2', 'day_3', 'day_4'] as const).forEach(dayKey => {
      const dayData = example.actual[dayKey];
      if (dayData && dayData.hourly && Array.isArray(dayData.hourly)) {
        const date = dayData.date || 'Unknown';
        examplesText += `${dayKey} (${date}):\n`;

        dayData.hourly.forEach((hourlyData) => {
          if (!hourlyData || typeof hourlyData !== 'object') return;

          // Parse the hour range (e.g., "10:00-11:00" -> "10 AM")
          const hourRange = hourlyData.hour || '';
          const startHour = hourRange.split(':')[0];
          const hour = parseInt(startHour);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

          examplesText += `  ${displayHour} ${ampm}: WSPD ${hourlyData.wspd_avg_kt || 'N/A'}kt, GST ${hourlyData.gst_max_kt || 'N/A'}kt\n`;
        });
        examplesText += '\n';
      }
    });

    examplesText += '\n';
  });

  let currentForecastPrompt = `
========================================
NOW PREDICT based on the following NWS forecast:
========================================

`;

  // Add warnings if present
  if (warnings.length > 0) {
    currentForecastPrompt += `WARNINGS/ADVISORIES: ${warnings.join(', ')}\n\n`;
  }

  // Add geographic context if provided (helps LLM interpret sub-area mentions)
  if (geographicContext) {
    currentForecastPrompt += geographicContext;
  }

  // Add day mapping instruction if provided (used when convertForecastDaysToRelative is false)
  if (dayMappingInstruction) {
    currentForecastPrompt += dayMappingInstruction;
  }

  // Add formatted forecast
  currentForecastPrompt += `FORECAST:\n${formattedForecast}\n`;

  currentForecastPrompt += `
========================================
CRITICAL: Return your prediction in JSON format.
Return predictions for ALL 5 days in this EXACT JSON structure. Replace EVERY null with your predicted numbers; do not leave nulls or placeholders:
{
  "day_0": [
    {"hour": 10, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 11, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 12, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 13, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 14, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 15, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 16, "wspd_kt": null, "gst_kt": null, "wdir_deg": null},
    {"hour": 17, "wspd_kt": null, "gst_kt": null, "wdir_deg": null}
  ],
  "day_1": [
    ... (8 entries for day 1, same keys as day_0)
  ],
  "day_2": [
    ... (8 entries for day 2, same keys as day_0)
  ],
  "day_3": [
    ... (8 entries for day 3, same keys as day_0)
  ],
  "day_4": [
    ... (8 entries for day 4, same keys as day_0)
  ]
}

========================================
CRITICAL REMINDER:
- Training examples above were in JSON format
- Your OUTPUT must also be in JSON format (curly braces and quotes)
- Respond with ONLY the JSON object, no explanations, no narrative text
========================================`;

  return systemPrompt + examplesText + currentForecastPrompt;
}
