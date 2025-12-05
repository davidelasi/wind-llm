/**
 * Unified Wind Data Types
 *
 * These types are shared between backend APIs and frontend components
 * to ensure data consistency across the application.
 *
 * @module wind-data
 */

/**
 * Single wind data point representing one hour of measurements
 */
export interface WindDataPoint {
  // Timestamp information (always Pacific timezone)
  timestamp: string;         // ISO 8601 with Pacific offset: "2025-12-04T13:00:00-08:00"
  date: string;              // Date key: "2025-12-04"
  time: string;              // Time string: "13:00"
  hour: number;              // Hour (0-23)

  // Wind measurements
  windSpeed: number;         // Average wind speed (knots)
  gustSpeed: number;         // Maximum gust speed (knots)
  windDirection: number;     // Direction in degrees (0-360)
  windDirectionText: string; // Compass direction: "N", "NE", etc.

  // Additional measurements
  temperature: number;       // Air temperature (Celsius)
  pressure: number;          // Atmospheric pressure (hPa)

  // Metadata
  sampleCount: number;       // Number of source measurements in this hour
  isDangerous: boolean;      // Flag for dangerous conditions (gust > 25kt)
}

/**
 * Summary statistics for a single day
 */
export interface DaySummary {
  avgWindSpeed: number;
  maxWindSpeed: number;
  avgGustSpeed: number;
  maxGustSpeed: number;
  avgDirection: number;
  primaryDirectionText: string;
  avgTemperature: number;
  avgPressure: number;
  dangerousHours: number;    // Count of hours with dangerous conditions
  dataPoints: number;        // Total hourly measurements
}

/**
 * Complete data for a single day
 */
export interface DayData {
  date: string;              // Date key: "2025-12-04"
  displayDate: string;       // Formatted: "Dec 04, 2025"
  hourlyData: WindDataPoint[];
  summary: DaySummary;
}

/**
 * Response from wind history API
 */
export interface WindHistoryResponse {
  success: boolean;
  data: DayData[];           // Array of days, sorted newest first
  metadata: {
    station: string;         // "AGXC1"
    location: string;        // "Los Angeles, CA"
    lastUpdated: string;     // ISO timestamp
    timezone: string;        // "America/Los_Angeles"
    dateRange: {
      start: string;         // Oldest date available (YYYY-MM-DD)
      end: string;           // Newest date available (YYYY-MM-DD)
    };
    totalHours: number;      // Total hourly measurements
    totalDays: number;       // Number of days
  };
  error?: string;
  message?: string;
}

/**
 * Raw measurement data from NOAA (internal use)
 */
export interface RawWindMeasurement {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  windDirection: number | null;
  windSpeed: number | null;      // m/s
  gustSpeed: number | null;      // m/s
  pressure: number | null;       // hPa
  airTemp: number | null;        // Celsius
  waterTemp: number | null;      // Celsius
}
