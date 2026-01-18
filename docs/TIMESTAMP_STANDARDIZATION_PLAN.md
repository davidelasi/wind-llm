# Timestamp Standardization Plan

**Status**: ✅ COMPLETED
**Created**: 2026-01-15
**Implemented**: 2026-01-16
**Priority**: High (affects correctness during PDT months)

## Summary

Standardize all timestamps to **ISO 8601 with Pacific offset** and fix critical DST bugs that cause incorrect behavior during Pacific Daylight Time (March-November).

## Implementation Summary (Completed 2026-01-16)

| File | Change | Lines |
|------|--------|-------|
| `web-ui/src/lib/timezone-utils.ts` | Added `getPacificDateHour()` and `getPacificYesterday()` | End of file |
| `web-ui/src/app/api/wind-data/route.ts` | Fixed hardcoded 8-hour offset with `formatPacificDateTime()` | ~164-173 |
| `web-ui/src/app/api/cron/store-wind-actuals/route.ts` | Fixed fragile string parsing with `getPacificYesterday()` | ~49-55 |
| `web-ui/src/app/api/wind-actuals/store/route.ts` | Fixed fragile string parsing with `getPacificYesterday()` | ~43-51 |
| `web-ui/src/app/api/llm-forecast/route.ts` | Fixed UTC storage with `getPacificISOString()` | ~1058 |
| `CLAUDE.md` | Added "Timestamp Storage Standard" documentation | New section |

**Bugs Fixed:**
1. ✅ Hardcoded 8-hour offset (was wrong during PDT)
2. ✅ Fragile string parsing in cron jobs (unreliable Date construction)
3. ✅ UTC storage for `llm_generated_at` (inconsistent with other Pacific timestamps)

## User Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage format | Pacific with offset | Matches user context (LA wind), minimal display conversions |
| Field naming | Keep existing names | Avoid DB migration and API breaking changes |
| Comparisons | By Pacific date+hour | Extract Pacific date and hour from both forecast and actuals |

---

## Critical Bugs to Fix

### Bug 1: Hardcoded 8-hour offset (WRONG during PDT)

**Impact**: During PDT (March-November), timestamps display 1 hour off.

**File**: `web-ui/src/app/api/wind-data/route.ts:164`

```typescript
// CURRENT (broken - also double-converts!)
const dataPST = new Date(dataTimestamp.getTime() - (8 * 60 * 60 * 1000));
const formattedTimePST = dataPST.toLocaleString('en-US', { timeZone: PACIFIC_TIMEZONE, ... });

// FIX: Use formatPacificDateTime() directly (already available)
const formattedTimePST = formatPacificDateTime(dataTimestamp);
```

### Bug 2: Fragile string parsing (unreliable Date construction)

**Impact**: `new Date()` parsing of locale strings is undefined behavior.

**Files**:
- `web-ui/src/app/api/cron/store-wind-actuals/route.ts:49-55`
- `web-ui/src/app/api/wind-actuals/store/route.ts:43-51`

```typescript
// CURRENT (unreliable Date parsing)
const nowPST = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
const yesterday = new Date(nowPST);  // BUG: parsing locale string is undefined behavior

// FIX: Use new getPacificYesterday() helper
const targetDate = getPacificYesterday();
```

### Bug 3: Inconsistent UTC storage for llm_generated_at

**Impact**: `llm_generated_at` uses UTC while other timestamps use Pacific, causing confusion.

**File**: `web-ui/src/app/api/llm-forecast/route.ts:1058`

```typescript
// CURRENT (returns UTC)
llmGeneratedAt: now.toISOString(),

// FIX: Use Pacific ISO for consistency
llmGeneratedAt: getPacificISOString(now),
```

---

## Implementation Steps

### Step 1: Add helper functions to timezone-utils.ts

**File**: `web-ui/src/lib/timezone-utils.ts`

Add two new functions at the end of the file:

```typescript
/**
 * Extract Pacific date and hour from any timestamp
 * For comparing forecast predictions with actual wind data
 *
 * @param date - Date to extract from
 * @returns Object with pacificDate (YYYY-MM-DD) and pacificHour (0-23)
 */
export function getPacificDateHour(date: Date): { pacificDate: string; pacificHour: number } {
  const pacificDate = formatInTimeZone(date, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
  const pacificHour = parseInt(formatInTimeZone(date, PACIFIC_TIMEZONE, 'HH'), 10);
  return { pacificDate, pacificHour };
}

/**
 * Get yesterday's date in Pacific timezone as YYYY-MM-DD (DST-safe)
 *
 * @returns Yesterday's date string in YYYY-MM-DD format
 */
export function getPacificYesterday(): string {
  const now = new Date();
  // Subtract 24 hours then format in Pacific timezone
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return formatInTimeZone(yesterday, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
}
```

### Step 2: Fix wind-data route

**File**: `web-ui/src/app/api/wind-data/route.ts`

1. Add import at top:
   ```typescript
   import { formatPacificDateTime } from '@/lib/timezone-utils';
   ```

2. Replace lines 164-173:
   ```typescript
   // OLD CODE (remove):
   const dataPST = new Date(dataTimestamp.getTime() - (8 * 60 * 60 * 1000));
   const formattedTimePST = dataPST.toLocaleString('en-US', {
     timeZone: PACIFIC_TIMEZONE,
     year: 'numeric',
     month: '2-digit',
     day: '2-digit',
     hour: '2-digit',
     minute: '2-digit',
     hour12: true
   }) + ' PST';

   // NEW CODE (replace with):
   const formattedTimePST = formatPacificDateTime(dataTimestamp);
   ```

### Step 3: Fix cron store-wind-actuals route

**File**: `web-ui/src/app/api/cron/store-wind-actuals/route.ts`

1. Add import at top:
   ```typescript
   import { getPacificYesterday } from '@/lib/timezone-utils';
   ```

2. Replace lines 49-55:
   ```typescript
   // OLD CODE (remove):
   const nowPST = new Date().toLocaleString('en-US', {
     timeZone: 'America/Los_Angeles'
   });
   const yesterday = new Date(nowPST);
   yesterday.setDate(yesterday.getDate() - 1);
   const targetDate = yesterday.toISOString().split('T')[0];

   // NEW CODE (replace with):
   const targetDate = getPacificYesterday();
   ```

### Step 4: Fix wind-actuals store route

**File**: `web-ui/src/app/api/wind-actuals/store/route.ts`

1. Add import at top:
   ```typescript
   import { getPacificYesterday } from '@/lib/timezone-utils';
   ```

2. Replace lines 43-51 else block:
   ```typescript
   // OLD CODE (remove):
   } else {
     const nowPST = new Date().toLocaleString('en-US', {
       timeZone: 'America/Los_Angeles'
     });
     const yesterday = new Date(nowPST);
     yesterday.setDate(yesterday.getDate() - 1);
     targetDate = yesterday.toISOString().split('T')[0];
   }

   // NEW CODE (replace with):
   } else {
     targetDate = getPacificYesterday();
   }
   ```

### Step 5: Fix llm-forecast route

**File**: `web-ui/src/app/api/llm-forecast/route.ts`

1. Add import (if not already present):
   ```typescript
   import { getPacificISOString } from '@/lib/timezone-utils';
   ```

2. Find line ~1058 (search for `llmGeneratedAt: now.toISOString()`) and change:
   ```typescript
   // OLD:
   llmGeneratedAt: now.toISOString(),

   // NEW:
   llmGeneratedAt: getPacificISOString(now),
   ```

### Step 6: Update CLAUDE.md documentation

**File**: `CLAUDE.md`

Add this section under "## TECHNICAL DETAILS":

```markdown
### Timestamp Storage Standard

**Format**: All timestamps use ISO 8601 with Pacific offset
- PST (winter): `2025-01-15T10:23:00-08:00`
- PDT (summer): `2025-07-15T10:23:00-07:00`

**Key Rules**:
1. **Never hardcode timezone offsets** (-8 or -7 hours) - use library functions
2. **Always use timezone-utils.ts** - centralized DST-aware utilities
3. **Use getPacificDateHour()** for forecast vs actuals comparisons

**Available Utilities** (`web-ui/src/lib/timezone-utils.ts`):
| Function | Purpose |
|----------|---------|
| `getPacificISOString(date)` | ISO string with Pacific offset |
| `formatPacificDateTime(date)` | Human-readable with PST/PDT indicator |
| `getPacificDateString(date)` | YYYY-MM-DD in Pacific timezone |
| `getPacificDateHour(date)` | Extract date+hour for forecast comparisons |
| `getPacificYesterday()` | Yesterday's date in Pacific (DST-safe) |
```

---

## Files to Modify (Summary)

| File | Changes | Lines |
|------|---------|-------|
| `web-ui/src/lib/timezone-utils.ts` | Add `getPacificDateHour()`, `getPacificYesterday()` | End of file |
| `web-ui/src/app/api/wind-data/route.ts` | Fix hardcoded offset | ~164-173 |
| `web-ui/src/app/api/cron/store-wind-actuals/route.ts` | Fix fragile parsing | ~49-55 |
| `web-ui/src/app/api/wind-actuals/store/route.ts` | Fix fragile parsing | ~43-51 |
| `web-ui/src/app/api/llm-forecast/route.ts` | Fix UTC storage | ~1058 |
| `CLAUDE.md` | Add timestamp documentation | New section |

---

## Verification Steps

After implementation:

1. **Unit test new functions**:
   ```typescript
   // In a test file or console
   import { getPacificYesterday, getPacificDateHour } from '@/lib/timezone-utils';
   console.log(getPacificYesterday()); // Should be yesterday's date
   console.log(getPacificDateHour(new Date())); // Should show current Pacific date/hour
   ```

2. **API test**:
   ```bash
   curl http://localhost:3000/api/wind-data | jq '.data.datetime'
   # Should show: "Jan 15, 2026 10:23 AM PST" (with correct PST/PDT)
   ```

3. **Cron test**:
   ```bash
   # Trigger cron endpoint (requires auth in production)
   curl http://localhost:3000/api/cron/store-wind-actuals?manual=true
   # Check database for correct date storage
   ```

4. **Database verification**:
   ```sql
   SELECT llm_generated_at FROM forecasts ORDER BY stored_at DESC LIMIT 1;
   -- Should show Pacific offset like: 2026-01-15T10:23:00-08:00
   ```

---

## Out of Scope (Future Work)

These items are lower priority and can be addressed later:

1. **Python script hardcoded offset** (`scripts/processing/process_wind_data.py:40`)
   - Only affects offline data processing
   - Fix: Use `zoneinfo.ZoneInfo('America/Los_Angeles')`

2. **forecast-utils.ts Date.setDate() issues** (lines 118-120, 197-199, 242-244)
   - More complex refactor needed
   - Lower impact since it only affects day-of-week mapping

3. **Field naming changes**
   - User chose to keep existing names
   - Future enhancement: add `_pst` suffix to new fields only

---

## Related Documentation

- Current timezone utilities: `web-ui/src/lib/timezone-utils.ts`
- Database schema: `web-ui/database/migrations/`
- Existing refactor notes: `docs/archive/TIMEZONE_REFACTOR.md`
