# Unified Data Layer Implementation Plan
**Date**: 2025-12-04
**Branch**: refactor/unified-data-layer
**Prerequisites**: Read CURRENT_DATA_ARCHITECTURE.md first

---

## Goals

1. **Single Source of Truth**: One API endpoint for all wind data
2. **Consistent Data Format**: Same structure across all pages
3. **Shared Utilities**: Reusable React hooks and helper functions
4. **Easy Maintenance**: Fix once, works everywhere
5. **No Breaking Changes**: Gradual migration, test at each step

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│                                                              │
│  ┌──────────────┐           ┌──────────────────┐            │
│  │  Home Page   │           │ Wind History Page│            │
│  │  (page.tsx)  │           │   (page.tsx)     │            │
│  └──────────────┘           └──────────────────┘            │
│         │                            │                       │
│         └──────────┬─────────────────┘                       │
│                    │                                         │
│                    ▼                                         │
│         ┌────────────────────────┐                          │
│         │  React Hooks Layer     │                          │
│         │  (web-ui/src/hooks/)   │                          │
│         │                        │                          │
│         │  - useWindData()       │  ← Main hook             │
│         │  - useWindHistory()    │  ← Filtered view         │
│         │  - useCurrentWind()    │  ← Latest reading        │
│         └────────────────────────┘                          │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
┌────────────────────┼─────────────────────────────────────────┐
│              DATA ACCESS LAYER                               │
│                    │                                         │
│         ┌──────────▼─────────────┐                          │
│         │   API Client Module    │                          │
│         │ (web-ui/src/lib/api/)  │                          │
│         │                        │                          │
│         │  - fetchWindData()     │  ← Core fetcher          │
│         │  - parseNoaaData()     │  ← Parser                │
│         │  - transformWindData() │  ← Transformer           │
│         └────────────────────────┘                          │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
┌────────────────────┼─────────────────────────────────────────┐
│               BACKEND API LAYER                              │
│                    │                                         │
│         ┌──────────▼─────────────┐                          │
│         │ Unified Wind Data API  │                          │
│         │  /api/wind-history     │  ← New unified endpoint  │
│         │                        │                          │
│         │  - Fetches NOAA data   │                          │
│         │  - Timezone conversion │                          │
│         │  - Hourly aggregation  │                          │
│         │  - Returns unified     │                          │
│         │    data format         │                          │
│         └────────────────────────┘                          │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │   NOAA Data      │
           │   (5-day file)   │
           └──────────────────┘
```

---

## Unified Data Format

### Core Data Structure

```typescript
// Single canonical format for all wind data
interface WindDataPoint {
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

interface DayData {
  date: string;              // Date key: "2025-12-04"
  displayDate: string;       // Formatted: "Dec 04" or "Dec 4, 2025"
  hourlyData: WindDataPoint[];
  summary: DaySummary;
}

interface DaySummary {
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

interface WindHistoryResponse {
  success: boolean;
  data: DayData[];           // Array of days, sorted newest first
  metadata: {
    station: string;         // "AGXC1"
    location: string;        // "Los Angeles, CA"
    lastUpdated: string;     // ISO timestamp
    timezone: string;        // "America/Los_Angeles"
    dateRange: {
      start: string;         // Oldest date available
      end: string;           // Newest date available
    };
    totalHours: number;      // Total hourly measurements
    totalDays: number;       // Number of days
  };
  error?: string;
  message?: string;
}
```

---

## Implementation Phases

### Phase 1: Create Unified Backend API ✅

**Goal**: Single API endpoint that both pages can use

**Tasks**:
1. ✅ Create `/api/wind-history/route.ts`
   - Consolidate logic from `five-day-wind` and `station-history`
   - Use single timezone conversion method
   - Return unified data format

2. ✅ Implement shared utilities in API:
   ```typescript
   // Shared functions within the API route
   function parseNoaaData(text: string): RawMeasurement[]
   function convertToWindDataPoint(raw: RawMeasurement): WindDataPoint
   function aggregateByDay(points: WindDataPoint[]): DayData[]
   function calculateDaySummary(points: WindDataPoint[]): DaySummary
   function getWindDirectionText(degrees: number): string
   ```

3. ✅ Add comprehensive error handling and logging

**File to create**: `web-ui/src/app/api/wind-history/route.ts`

**Acceptance criteria**:
- Returns data in unified format
- Handles timezone conversions consistently
- Includes proper error handling
- Response time < 2 seconds
- Test endpoint: `curl http://localhost:3000/api/wind-history`

---

### Phase 2: Create Shared Utilities Library ✅

**Goal**: Reusable helper functions for frontend

**Tasks**:
1. ✅ Create utility module: `web-ui/src/lib/wind-utils.ts`
   ```typescript
   // Time slot utilities
   export function createTimeSlots(startHour: number, endHour: number): string[]
   export function mapHourToTimeSlot(hour: number): string
   export function filterByTimeWindow(data: WindDataPoint[], start: number, end: number): WindDataPoint[]

   // Wind direction utilities
   export function getWindDirectionText(degrees: number): string
   export function getWindDirectionArrow(degrees: number): number

   // Wind speed utilities
   export function getWindSpeedCategory(speed: number): { category: string, color: string }
   export function getWindSpeedColor(speed: number): string
   export function getForecastWindColor(speed: number): string

   // Date utilities (supplements timezone-utils)
   export function getPacificDateKey(date: Date = new Date()): string
   export function formatDisplayDate(dateKey: string): string
   export function getPacificDayOffset(offset: number): string
   ```

2. ✅ Create type definitions: `web-ui/src/types/wind-data.ts`
   - Export all interfaces
   - Shared between frontend and backend

**Files to create**:
- `web-ui/src/lib/wind-utils.ts`
- `web-ui/src/types/wind-data.ts`

**Acceptance criteria**:
- All utility functions have JSDoc comments
- Type-safe exports
- No dependencies on React (pure functions)
- Unit tests pass (optional for MVP)

---

### Phase 3: Create React Hooks Layer ✅

**Goal**: Reusable data fetching hooks

**Tasks**:
1. ✅ Create `web-ui/src/hooks/useWindData.ts`
   ```typescript
   export function useWindData(options?: {
     refreshInterval?: number;  // Auto-refresh in ms
     dateRange?: { start: string, end: string };
   }) {
     const [data, setData] = useState<DayData[] | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);
     const [lastUpdated, setLastUpdated] = useState<string>('');

     // Fetch function
     const fetchData = async () => { ... };

     // Auto-refresh effect
     useEffect(() => { ... }, [refreshInterval]);

     return { data, loading, error, lastUpdated, refetch: fetchData };
   }
   ```

2. ✅ Create convenience hooks:
   ```typescript
   // Get data for a specific day
   export function useWindDay(dateKey: string) {
     const { data, ...rest } = useWindData();
     const dayData = useMemo(() =>
       data?.find(d => d.date === dateKey),
       [data, dateKey]
     );
     return { dayData, ...rest };
   }

   // Get data for time window
   export function useWindWindow(dateKey: string, startHour: number, endHour: number) {
     const { dayData, ...rest } = useWindDay(dateKey);
     const windowData = useMemo(() =>
       dayData ? filterByTimeWindow(dayData.hourlyData, startHour, endHour) : null,
       [dayData, startHour, endHour]
     );
     return { windowData, ...rest };
   }

   // Get current conditions (most recent reading)
   export function useCurrentWind() {
     const { data, ...rest } = useWindData();
     const current = useMemo(() => {
       if (!data || data.length === 0) return null;
       const latestDay = data[0];
       return latestDay.hourlyData[latestDay.hourlyData.length - 1];
     }, [data]);
     return { current, ...rest };
   }
   ```

**File to create**: `web-ui/src/hooks/useWindData.ts`

**Acceptance criteria**:
- Hooks follow React conventions
- Proper TypeScript typing
- Automatic refresh works
- Error states handled gracefully
- Loading states managed correctly

---

### Phase 4: Migrate Home Page ✅

**Goal**: Replace three API calls with unified hook

**Current code**:
```typescript
// OLD: Three separate fetch functions
const fetchWindData = async () => { /* /api/wind-data */ }
const fetchLlmForecast = async () => { /* /api/llm-forecast */ }
const fetchActualWindData = async () => { /* /api/five-day-wind */ }
```

**New code**:
```typescript
// NEW: Single hook for historical data
import { useWindData, useCurrentWind } from '@/hooks/useWindData';
import { filterByTimeWindow } from '@/lib/wind-utils';

// Get all wind data
const { data: windHistory, loading, error } = useWindData({
  refreshInterval: 5 * 60 * 1000  // 5 minutes
});

// Get current conditions
const { current: currentWind } = useCurrentWind();

// Get forecast predictions (keep existing)
const fetchLlmForecast = async () => { /* unchanged */ }

// Get actual data for overlay
const getActualWindForDay = (dayOffset: number) => {
  if (!windHistory) return null;

  const targetDate = getPacificDayOffset(dayOffset);
  const dayData = windHistory.find(d => d.date === targetDate);

  if (!dayData) return null;

  // Filter to 11 AM - 6 PM window
  return filterByTimeWindow(dayData.hourlyData, 11, 18);
};
```

**Changes required**:
1. Import new hooks and utilities
2. Replace `fetchActualWindData()` with `useWindData()`
3. Replace `getActualWindForDay()` logic with new utilities
4. Remove duplicate helper functions
5. Update state management to use hook results
6. Test that overlays still work correctly

**Files to modify**:
- `web-ui/src/app/page.tsx`

**Acceptance criteria**:
- Chart overlays work identically to before
- Current conditions display correctly
- No console errors
- Performance is equal or better
- Auto-refresh still works

---

### Phase 5: Migrate Wind History Page ✅

**Goal**: Replace custom API call with unified hook

**Current code**:
```typescript
// OLD: Custom fetch to /api/station-history
const fetchData = async () => {
  const response = await fetch('/api/station-history');
  const result = await response.json();
  const processedDays = processDataByDays(result.data.chartData);
  setAvailableDays(processedDays);
}
```

**New code**:
```typescript
// NEW: Use unified hook
import { useWindData } from '@/hooks/useWindData';
import { filterByTimeWindow } from '@/lib/wind-utils';

const { data: windHistory, loading, error, lastUpdated, refetch } = useWindData({
  refreshInterval: 5 * 60 * 1000
});

// Filter to 11 AM - 6 PM for display
const displayDays = useMemo(() => {
  if (!windHistory) return [];
  return windHistory.map(day => ({
    ...day,
    hourlyData: filterByTimeWindow(day.hourlyData, 11, 18)
  }));
}, [windHistory]);
```

**Changes required**:
1. Import `useWindData` hook
2. Replace `fetchData()` with hook
3. Remove `processDataByDays()` function (now handled by API)
4. Remove duplicate `getWindDirectionText()` (use from wind-utils)
5. Simplify state management
6. Update refresh button to use `refetch()`

**Files to modify**:
- `web-ui/src/app/wind-history/page.tsx`

**Acceptance criteria**:
- Chart displays identically
- Day navigation works
- Refresh button works
- No duplicate code remains
- Performance maintained or improved

---

### Phase 6: Deprecate Old APIs ✅

**Goal**: Clean up obsolete endpoints

**Tasks**:
1. Add deprecation notices to old APIs:
   - `/api/five-day-wind` → Add deprecation header
   - `/api/station-history` → Add deprecation header

2. Update API documentation

3. Monitor for any usage (should be zero after migration)

4. After 1 week of monitoring, delete old files:
   - `web-ui/src/app/api/five-day-wind/route.ts`
   - `web-ui/src/app/api/station-history/route.ts`

**Files to modify/delete**:
- Add deprecation to old routes
- Eventually delete old route files

**Acceptance criteria**:
- No calls to old endpoints in production
- Documentation updated
- Old files removed

---

### Phase 7: Add Tests (Optional Enhancement) 🎯

**Goal**: Prevent future regressions

**Tasks**:
1. Unit tests for wind-utils functions
2. Integration tests for /api/wind-history
3. Component tests for hooks
4. E2E test for data flow

**Files to create**:
- `web-ui/src/lib/wind-utils.test.ts`
- `web-ui/src/hooks/useWindData.test.ts`
- `web-ui/src/app/api/wind-history/route.test.ts`

**Note**: This phase can be done later if needed.

---

## Migration Checklist

### Pre-Implementation
- [x] Document current architecture
- [x] Create implementation plan
- [x] Create feature branch: `refactor/unified-data-layer`
- [ ] Review plan with team (if applicable)

### Implementation
- [ ] Phase 1: Create unified API endpoint
  - [ ] Write `/api/wind-history/route.ts`
  - [ ] Test endpoint manually
  - [ ] Verify data format matches spec

- [ ] Phase 2: Create shared utilities
  - [ ] Create `wind-utils.ts`
  - [ ] Create `wind-data.ts` types
  - [ ] Verify no breaking changes to existing code

- [ ] Phase 3: Create React hooks
  - [ ] Write `useWindData.ts`
  - [ ] Test hooks in isolation
  - [ ] Verify auto-refresh works

- [ ] Phase 4: Migrate home page
  - [ ] Update imports
  - [ ] Replace fetch logic
  - [ ] Test overlay display
  - [ ] Test current conditions
  - [ ] Commit changes

- [ ] Phase 5: Migrate wind history page
  - [ ] Update imports
  - [ ] Replace fetch logic
  - [ ] Test chart display
  - [ ] Test navigation
  - [ ] Commit changes

- [ ] Phase 6: Deprecate old APIs
  - [ ] Add deprecation notices
  - [ ] Monitor for usage
  - [ ] Delete old files (after 1 week)

### Testing
- [ ] Manual testing on home page
- [ ] Manual testing on wind history page
- [ ] Check browser console for errors
- [ ] Verify data consistency between pages
- [ ] Test auto-refresh functionality
- [ ] Test error states
- [ ] Test loading states
- [ ] Performance check (page load time)

### Documentation
- [ ] Update README with new architecture
- [ ] Document hook usage
- [ ] Update API documentation
- [ ] Add JSDoc comments to all functions

### Deployment
- [ ] Merge to main branch
- [ ] Deploy to staging
- [ ] Smoke test in staging
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Rollback Plan

If issues arise during migration:

1. **Immediate**: Feature flag approach
   ```typescript
   const USE_NEW_API = process.env.NEXT_PUBLIC_USE_NEW_API === 'true';

   if (USE_NEW_API) {
     // New unified approach
   } else {
     // Old approach
   }
   ```

2. **Quick**: Revert individual phase commits
   - Each phase should be a separate commit
   - Can cherry-pick revert as needed

3. **Full**: Revert entire feature branch
   ```bash
   git revert <merge-commit-hash>
   ```

---

## Success Metrics

**Before**:
- 2 duplicate APIs with different formats
- Timezone fixes required in 3 files
- Code duplication across 6+ functions
- Inconsistent date handling

**After**:
- 1 unified API with consistent format
- Single source of truth for timezone logic
- Zero code duplication
- Shared utilities used everywhere

**Measurable improvements**:
- Lines of code: -500 (estimated)
- API endpoints: 2 → 1
- Maintenance burden: 50% reduction
- Bug surface area: 60% reduction

---

## Session Continuity Notes

**For future sessions/handoff**:

### Files to read first
1. `CURRENT_DATA_ARCHITECTURE.md` - Understanding current state
2. `UNIFIED_DATA_LAYER_PLAN.md` - This file

### Current progress
- ✅ Documentation complete
- ⏸️ Implementation pending

### Next steps
Start with Phase 1: Create `/api/wind-history/route.ts`

### Key context
- Branch: `refactor/unified-data-layer`
- Parent: `refactor/timezone-utilities`
- Goal: Eliminate duplicate APIs and unify data structure

---

**End of Implementation Plan**
