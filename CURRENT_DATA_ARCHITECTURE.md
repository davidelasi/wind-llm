# Current Data Architecture Analysis
**Date**: 2025-12-04
**Branch**: refactor/unified-data-layer
**Purpose**: Document existing wind data architecture before refactoring

---

## Executive Summary

The wind forecasting application currently has **duplicate data fetching logic** across multiple pages and API endpoints. This leads to:
- ❌ Inconsistent data formats
- ❌ Duplicate timezone conversion code (requires fixes in multiple places)
- ❌ Different behaviors between pages
- ❌ Difficult debugging and maintenance

**Root Issue Discovered**: At 8 AM PST, home page appeared to show future wind data (3-5 PM) because:
1. Wind data was available for early morning hours (0-8 AM)
2. Home page only displays 11 AM - 6 PM forecast window
3. No data available for that window yet → empty overlay

This revealed that **two separate APIs** serve similar wind data with different structures.

---

## Current Architecture Map

### API Endpoints

#### 1. `/api/five-day-wind`
**Used by**: Home page (main forecast chart)
**Source file**: `web-ui/src/app/api/five-day-wind/route.ts`
**Data source**: NOAA 5-day data (https://www.ndbc.noaa.gov/data/5day2/AGXC1_5day.txt)

**Data Structure**:
```typescript
{
  success: boolean,
  data: DailyWindData[],  // Array of days
  metadata: {
    lastUpdated: string,
    recordCount: number,
    dateRange: { oldest: string, newest: string }
  }
}

interface DailyWindData {
  date: string,              // YYYY-MM-DD format
  hourlyData: HourlyWindData[],
  dailySummary: {
    avgWindSpeedKt: number,
    maxGustKt: number,
    avgDirection: number,
    avgPressure: number,
    avgAirTemp: number
  }
}

interface HourlyWindData {
  hour: string,              // "HH:00" format (e.g., "13:00")
  datetimePST: string,       // ISO 8601 with Pacific offset
  windSpeedAvgKt: number,    // Average wind speed in knots
  gustSpeedMaxKt: number,    // Maximum gust in knots
  windDirection: number,     // Degrees
  pressure: number,          // hPa
  airTemp: number,           // Celsius
  sampleCount: number        // Number of 6-min measurements
}
```

**Processing Logic**:
1. Parse raw NOAA data (6-minute measurements in GMT)
2. Convert GMT to Pacific timezone using `formatInTimeZone()`
3. Group measurements by Pacific date (YYYY-MM-DD)
4. Aggregate into hourly averages:
   - Wind speed: arithmetic mean
   - Gust speed: maximum value per hour
   - Direction: circular mean
5. Return all hours (0-23) for all available days

**Timezone Handling**:
- Uses `formatInTimeZone()` from date-fns-tz (FIXED in recent commit)
- Date keys in Pacific timezone: YYYY-MM-DD
- Handles DST transitions automatically

---

#### 2. `/api/station-history`
**Used by**: Wind history page (`/wind-history`)
**Source file**: `web-ui/src/app/api/station-history/route.ts`
**Data source**: NOAA 5-day data (same URL as above)

**Data Structure**:
```typescript
{
  success: boolean,
  data: {
    chartData: WindDataPoint[],  // Flat array of hourly points
    summary: {
      avgWindSpeed: number,
      maxWindSpeed: number,
      avgGustSpeed: number,
      maxGustSpeed: number,
      dangerousGustCount: number,
      primaryDirection: string,
      dataPoints: number,
      dateRange: { start: string, end: string }
    }
  },
  metadata: {
    lastUpdated: string,
    station: string,
    location: string,
    rawRecords: number,
    chartPoints: number
  }
}

interface WindDataPoint {
  timestamp: string,         // ISO 8601 string
  date: string,              // "MMM dd" format (e.g., "Dec 04")
  time: string,              // "HH:mm" format
  hour: number,              // 0-23
  windSpeed: number,         // Knots
  gustSpeed: number,         // Knots
  windDirection: number,     // Degrees
  windDirectionText: string, // "N", "NE", etc.
  temperature: number,       // Celsius
  isDangerous: boolean       // gust > 25kt
}
```

**Processing Logic**:
1. Parse raw NOAA data (identical to five-day-wind)
2. Convert GMT to Pacific timezone using `convertGMTtoPacific()`
3. Aggregate into hourly data
4. Return **flat array** of all hourly measurements
5. Calculate summary statistics

**Timezone Handling**:
- Uses `convertGMTtoPacific()` from timezone-utils
- Uses `formatInTimeZone()` for timestamp strings
- Timezone offset in ISO strings: "-08:00" (PST) or "-07:00" (PDT)

---

#### 3. `/api/wind-data`
**Used by**: Home page (current conditions only - not for historical overlay)
**Source file**: `web-ui/src/app/api/wind-data/route.ts`
**Data source**: NOAA realtime and 5-day fallback

**Data Structure**:
```typescript
{
  success: boolean,
  data: {
    datetime: string,        // Formatted PST string
    windDirection: number,
    windSpeed: number,       // Knots
    gustSpeed: number,       // Knots
    pressure: number,
    airTemp: number,
    waterTemp: number
  },
  dataAge: {
    minutes: number,
    isOld: boolean,
    warning: string | null,
    timestamp: string
  }
}
```

**Not used for historical overlays** - only shows current conditions banner.

---

#### 4. `/api/noaa-observations`
**Used by**: Not currently used in main UI
**Source file**: `web-ui/src/app/api/noaa-observations/route.ts`
**Data source**: NOAA JSON API (latest observation)

**Status**: Appears to be experimental/alternative data source.

---

### Frontend Data Consumption

#### Home Page (`web-ui/src/app/page.tsx`)

**Data Sources Used**:
1. `/api/wind-data` - Current conditions (line 135)
2. `/api/llm-forecast` - LLM predictions (line 207)
3. `/api/five-day-wind` - Historical wind data for overlay (line 247)

**Key Functions**:
```typescript
// Fetches actual wind data for overlay
fetchActualWindData() {
  fetch('/api/five-day-wind')
  // Stores in: actualWindData state
}

// Maps today's data to forecast time slots (11 AM - 6 PM)
getActualWindForDay() {
  // 1. Calculate Pacific date for selected forecast day
  // 2. Find matching day in actualWindData by date key
  // 3. Map hourly data to time slots: 11 AM - 6 PM
  // 4. Returns array with actualWindSpeed, actualGustSpeed
}

// Merges forecast and actual data for chart
mergedChartData = currentForecastData.map((forecast, index) => {
  const actual = actualWindForDay?.[index];
  return {
    ...forecast,
    actualWindSpeed: actual?.actualWindSpeed || null,
    actualGustSpeed: actual?.actualGustSpeed || null
  };
});
```

**Display Logic**:
- Shows forecast bars (colored by wind speed)
- Overlays actual wind data as **lines** (dark gray)
- Only shows 11 AM - 6 PM window
- Updates every 5 minutes

**Current Bug/Limitation**:
- Early in the day (8 AM), actual data exists for hours 0-8, but home page only displays 11-18
- Result: No overlay visible until 11 AM, even though wind history page shows early data

---

#### Wind History Page (`web-ui/src/app/wind-history/page.tsx`)

**Data Sources Used**:
1. `/api/station-history` - All historical wind data (line 91)

**Key Functions**:
```typescript
// Process flat array into daily buckets
processDataByDays(chartData: WindDataPoint[]): DayData[] {
  // Groups by date string
  // Creates time slots for 11 AM - 6 PM
  // Returns array of {date, displayDate, data[]}
}

// Get wind direction from degrees
getWindDirectionText(degrees: number): string {
  // Converts 0-360 to N, NNE, NE, etc.
}
```

**Display Logic**:
- Shows line chart for selected day
- Displays 11 AM - 6 PM window
- Day selector to navigate through available dates
- Shows all hours in data, not just forecast window

---

## Code Duplication Analysis

### Duplicated Logic Across Files

| Functionality | Location 1 | Location 2 | Notes |
|--------------|-----------|-----------|-------|
| **Parse NOAA data** | `five-day-wind/route.ts` parseWindData() | `station-history/route.ts` parseWindData() | Nearly identical |
| **GMT → Pacific conversion** | `five-day-wind/route.ts` uses formatInTimeZone | `station-history/route.ts` uses convertGMTtoPacific | Different methods! |
| **Hourly aggregation** | `five-day-wind/route.ts` aggregateHourlyData() | `station-history/route.ts` aggregateHourlyData() | Similar logic, different outputs |
| **Wind direction text** | `page.tsx` getWindDirectionText() | `wind-history/page.tsx` getWindDirectionText() | Exact duplicate |
| **Date grouping** | `five-day-wind` groups by date | `station-history` groups by date | Different date key formats |
| **Unit conversions** | Both files | Both files | m/s → knots (1.94384) |

### Timezone Conversion Inconsistencies

**Recent fixes required changes in**:
1. `five-day-wind/route.ts` - Fixed date key generation (line 119)
2. `page.tsx` - Fixed date lookup logic (lines 495-502, 963-968)
3. `station-history/route.ts` - **NOT YET UPDATED** (still uses old method)

**This proves the maintenance burden**: Same bug required 2-3 separate fixes.

---

## Data Flow Diagrams

### Home Page Data Flow
```
┌─────────────────────────────────────────────────────────┐
│                     HOME PAGE                            │
│                   (page.tsx)                             │
└─────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌──────────┐    ┌─────────────┐  ┌──────────────┐
   │ wind-data│    │llm-forecast │  │five-day-wind │
   │   API    │    │     API     │  │     API      │
   └──────────┘    └─────────────┘  └──────────────┘
          │                │                │
          │                │                │
          ▼                ▼                ▼
   Current only    Predictions      Historical actual
   (not overlaid)  (bars)           (line overlay)
                                    ⚠️ Only 11 AM-6 PM shown
```

### Wind History Page Data Flow
```
┌─────────────────────────────────────────────────────────┐
│                 WIND HISTORY PAGE                        │
│              (wind-history/page.tsx)                     │
└─────────────────────────────────────────────────────────┘
                           │
                           │
                           ▼
                  ┌──────────────────┐
                  │ station-history  │
                  │       API        │
                  └──────────────────┘
                           │
                           │
                           ▼
                    All hourly data
                  (flat array format)
                  ✅ Shows all hours
```

---

## Problems Summary

### 1. **Data Duplication**
- Two APIs fetch from same NOAA source
- Parse same raw data format
- Perform identical timezone conversions
- Different output structures for same data

### 2. **Timezone Bugs**
- Required fixes in 3 separate files
- Easy to miss one location
- Inconsistent date key generation methods
- No single source of truth

### 3. **Format Inconsistencies**
| Aspect | five-day-wind | station-history |
|--------|--------------|-----------------|
| Structure | Nested (days → hours) | Flat array |
| Date format | YYYY-MM-DD | "MMM dd" |
| Hour format | "HH:00" | number (0-23) |
| Timestamp | ISO with offset | ISO string |

### 4. **Display Window Limitation**
- Both pages show 11 AM - 6 PM only
- Early morning data (0-10 AM) exists but not shown on home page
- Creates confusion: "Why does history page show data but home page doesn't?"

### 5. **No Shared Utilities**
- `getWindDirectionText()` duplicated
- Wind speed color calculations duplicated
- Time slot mapping duplicated

---

## Current Git State

**Branch**: `refactor/unified-data-layer`
**Based on**: `refactor/timezone-utilities`
**Parent commit**: `684b701` (Fix timezone date key generation bug)

**Recent commits** (timezone refactoring):
- `684b701` - Fix timezone date key generation bug in five-day-wind API and home page
- `c0d4069` - Replace hardcoded timezone strings in frontend and remaining APIs
- `abc9f3a` - Refactor: Create shared timezone utilities and migrate APIs

**Unstaged changes** (not part of this refactoring):
- `scripts/variance_test.py`
- `web-ui/package.json`
- `web-ui/src/app/api/llm-forecast/route.ts`
- `web-ui/src/app/api/python-variance-test/route.ts`
- `web-ui/src/app/api/validation-variance/route.ts`
- `web-ui/src/app/globals.css`
- `web-ui/src/app/validation-test/page.tsx`

---

## Next Steps

See **UNIFIED_DATA_LAYER_PLAN.md** for detailed implementation strategy.

---

**End of Current Architecture Documentation**
