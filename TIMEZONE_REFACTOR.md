# Timezone Utilities Refactoring

**Branch:** `refactor/timezone-utilities`
**Created:** 2025-12-03
**Status:** IN PROGRESS

## Objective

Consolidate and standardize all timezone conversions across the wind-llm web application to use a single, robust, DST-aware approach.

## Critical Issues Identified

### 🔴 HIGH PRIORITY - Critical Bug
**File:** `web-ui/src/app/api/llm-forecast/route.ts:233`
**Issue:** Uses `toLocaleDateString()` without timezone parameter
**Impact:** Will use server's timezone instead of Pacific time, causing incorrect month/forecast selection in production
**Fix Status:** PENDING

### 🟡 MEDIUM PRIORITY
1. **Duplicate Code:** `convertGMTtoPacific()` function duplicated in:
   - `/api/station-history/route.ts` (lines 53-79)
   - `/api/five-day-wind/route.ts` (lines 53-75)

2. **Dead Code:** `/api/station-history/route.ts` lines 56-58 (unused temp variables)

3. **No Centralization:** Timezone string `'America/Los_Angeles'` hardcoded in 8+ locations

### 🟢 LOW PRIORITY
- Inconsistent approaches across codebase
- Missing timezone in display-only code

---

## Current State Analysis

### Timezone Approaches by File

| File | Approach | DST-Aware | Issue |
|------|----------|-----------|-------|
| `api/station-history/route.ts` | `Intl.DateTimeFormat` manual parsing | ✅ | Duplicate code |
| `api/five-day-wind/route.ts` | `Intl.DateTimeFormat` manual parsing | ✅ | Duplicate code |
| `api/llm-forecast/route.ts:233` | `toLocaleDateString()` NO TZ | ❌ | **CRITICAL BUG** |
| `api/sausage-mode/route.ts` | String constant only | N/A | No conversion |
| `wind-history/page.tsx` | `date-fns-tz` library | ✅ | Good |
| `page.tsx` | `toLocaleDateString()` with TZ | ✅ | Works but inconsistent |
| `sausage-mode/page.tsx` | `toLocaleString()` NO TZ | ⚠️ | Inconsistent display |

---

## Solution Design

### New Shared Module: `lib/timezone-utils.ts`

**Location:** `web-ui/src/lib/timezone-utils.ts` (new file)

**Dependencies:** `date-fns-tz` (already installed)

**Exports:**

```typescript
// Constants
export const PACIFIC_TIMEZONE = 'America/Los_Angeles';

// Core conversion functions
export function convertGMTtoPacific(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date;

export function getCurrentPacificDate(): Date;

export function formatPacificDate(
  date: Date,
  formatString: string
): string;

export function getPacificTimezoneAbbr(): 'PST' | 'PDT';

// Helper functions
export function getPacificDateString(date: Date): string; // YYYY-MM-DD
export function getPacificMonthShort(date?: Date): string; // 'jan', 'feb', etc.
```

---

## Implementation Plan

### Phase 1: Setup & Documentation ✅
- [x] Create branch `refactor/timezone-utilities`
- [x] Create this documentation file
- [ ] Create shared utilities module
- [ ] Add unit tests for utilities

### Phase 2: Critical Bug Fix (FIRST PRIORITY)
- [ ] Fix `llm-forecast/route.ts:233` to use proper Pacific timezone
- [ ] Test LLM forecast functionality
- [ ] Commit fix with message: "Fix: Use Pacific timezone for month selection in llm-forecast"

### Phase 3: Migrate API Routes
- [ ] Update `five-day-wind/route.ts` - Remove duplicate `convertGMTtoPacific`
- [ ] Test five-day-wind API endpoint
- [ ] Commit with message: "Refactor: Migrate five-day-wind to shared timezone utilities"
- [ ] Update `station-history/route.ts` - Remove duplicate & dead code
- [ ] Test station-history API endpoint
- [ ] Commit with message: "Refactor: Migrate station-history to shared timezone utilities"
- [ ] Update `sausage-mode/route.ts` - Add proper timezone to displays
- [ ] Test sausage-mode page
- [ ] Commit with message: "Refactor: Add timezone handling to sausage-mode"

### Phase 4: Migrate Frontend
- [ ] Update `page.tsx` - Use shared utilities
- [ ] Test main forecast page
- [ ] Commit with message: "Refactor: Migrate main page to shared timezone utilities"
- [ ] Update `sausage-mode/page.tsx` - Add timezone to displays
- [ ] Test sausage-mode page display
- [ ] Commit with message: "Refactor: Add timezone to sausage-mode displays"
- [ ] Note: `wind-history/page.tsx` already uses `date-fns-tz` correctly - no changes needed

### Phase 5: Final Cleanup & Testing
- [ ] Search for remaining hardcoded `'America/Los_Angeles'` strings
- [ ] Replace with `PACIFIC_TIMEZONE` constant
- [ ] Run full end-to-end tests on all pages
- [ ] Verify forecast data overlay still works
- [ ] Verify wind history page still works
- [ ] Document any remaining issues

### Phase 6: Merge Preparation
- [ ] Review all commits
- [ ] Squash if necessary
- [ ] Final testing on branch
- [ ] Create pull request / merge plan
- [ ] Merge to main

---

## Testing Checklist

After each phase, verify:

- [ ] Home page loads and displays forecast
- [ ] Actual wind data overlay works correctly
- [ ] Wind history page shows correct dates
- [ ] Sausage mode page displays correctly
- [ ] Debug panel shows correct dates
- [ ] All APIs return data in Pacific timezone
- [ ] Console has no timezone-related errors

### Specific Tests per Component

**Five-Day-Wind API:**
```bash
# Should return data with correct Pacific dates
curl http://localhost:3000/api/five-day-wind | jq '.data[0].date'
```

**Station-History API:**
```bash
# Should return data with Pacific timezone timestamps
curl http://localhost:3000/api/station-history | jq '.data.chartData[0].timestamp'
```

**LLM-Forecast API:**
```bash
# Should use correct month for current Pacific time
curl http://localhost:3000/api/llm-forecast | jq '.data.format'
```

---

## Rollback Plan

If issues arise:

1. **Immediate rollback:**
   ```bash
   git checkout main
   ```

2. **Partial rollback (keep branch, undo last commit):**
   ```bash
   git reset --soft HEAD~1
   ```

3. **Fix-forward approach:** If small issue, fix on branch and continue

---

## Files to Modify

### New Files:
- `web-ui/src/lib/timezone-utils.ts` (create)

### Modified Files:
- `web-ui/src/app/api/llm-forecast/route.ts` (critical fix)
- `web-ui/src/app/api/five-day-wind/route.ts` (remove duplicate)
- `web-ui/src/app/api/station-history/route.ts` (remove duplicate + dead code)
- `web-ui/src/app/api/sausage-mode/route.ts` (add timezone)
- `web-ui/src/app/page.tsx` (use shared utilities)
- `web-ui/src/app/sausage-mode/page.tsx` (add timezone)

### Files NOT Modified:
- `web-ui/src/app/wind-history/page.tsx` (already correct)
- `web-ui/src/app/api/noaa-observations/route.ts` (not timezone-related)
- `web-ui/src/app/api/wind-data/route.ts` (not timezone-related)

---

## Code Patterns

### BEFORE (Problematic):
```typescript
// ❌ Uses server timezone!
const month = currentDate.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
```

### AFTER (Correct):
```typescript
// ✅ Uses Pacific timezone
import { getPacificMonthShort } from '@/lib/timezone-utils';
const month = getPacificMonthShort();
```

---

## Session Recovery Instructions

If this session crashes, continue from:

1. **Check current branch:**
   ```bash
   git branch
   ```
   Should show: `* refactor/timezone-utilities`

2. **Check progress:** Look at checkboxes in "Implementation Plan" above

3. **Resume work:** Start from first unchecked item in current phase

4. **Test before continuing:** Always test previous changes work before proceeding

---

## Notes & Observations

- All timezone conversions should account for DST (Daylight Saving Time)
- Pacific time is PST (UTC-8) in winter, PDT (UTC-7) in summer
- `date-fns-tz` library handles this correctly and is already installed
- `Intl.DateTimeFormat` also handles DST correctly but requires manual parsing
- Plain `toLocaleDateString()` without timezone uses **server's timezone** - AVOID

---

## Completion Criteria

This refactoring is complete when:

1. ✅ All timezone conversions use shared utilities from `lib/timezone-utils.ts`
2. ✅ Critical bug in `llm-forecast/route.ts` is fixed
3. ✅ No duplicate `convertGMTtoPacific` functions exist
4. ✅ All hardcoded `'America/Los_Angeles'` strings use constant
5. ✅ All tests pass
6. ✅ All pages display correct Pacific time dates
7. ✅ Code review completed
8. ✅ Branch merged to main

---

**Last Updated:** 2025-12-03
**Next Steps:** Create `lib/timezone-utils.ts` and fix critical bug in `llm-forecast`
