# Technical TODOs and Known Issues

**Last Updated:** December 10, 2025
**Purpose:** Track active development work, critical bugs, and known gaps

---

## 🔴 CRITICAL BUGS (Must Fix Before Production)

### 1. Timezone Bug in LLM Forecast Route

**Priority:** HIGH - BLOCKING DEPLOYMENT
**File:** `web-ui/src/app/api/llm-forecast/route.ts:233`

**Issue:**
```typescript
// ❌ WRONG: Uses server timezone instead of Pacific
const month = currentDate.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
```

**Impact:**
- In production (Vercel serverless), this will use the server's timezone (likely UTC)
- Causes incorrect month selection for training examples
- Wrong examples → degraded forecast accuracy
- Example: At 11 PM PST (7 AM UTC next day), would select next month's examples

**Correct Fix:**
```typescript
// ✅ CORRECT: Use Pacific timezone explicitly
import { getPacificMonthShort } from '@/lib/timezone-utils';
const month = getPacificMonthShort();
```

**Status:** PENDING FIX
**Related:** See `TIMEZONE_REFACTOR.md` (to be archived) for full timezone refactoring plan

---

## 🟡 REFACTORING IN PROGRESS

### 2. Unified Data Layer

**Priority:** MEDIUM
**Branch:** `refactor/unified-data-layer`
**Status:** PLANNING PHASE

**Problem:**
- Two APIs fetch identical NOAA data: `/api/five-day-wind` and `/api/station-history`
- Duplicate parsing logic, timezone conversions, aggregation code
- Different output formats for same underlying data
- Bug fixes require changes in multiple files

**Impact:**
- Maintenance burden (duplicate code)
- Inconsistent data formats confuse developers
- 8 AM PST display bug revealed architectural issue

**Solution:**
Consolidate into single `/api/wind-history` endpoint:
- Unified data format across all pages
- Shared React hooks (`useWindData`)
- Single source of truth for wind data
- Reusable utilities library

**Implementation Plan:** See archived `UNIFIED_DATA_LAYER_PLAN.md`

**Estimated Effort:** 4-6 hours
**Blockers:** None
**Next Step:** Implement Phase 1 (create unified API endpoint)

### 3. Timezone Utilities Centralization

**Priority:** MEDIUM (overlaps with Critical Bug #1)
**Branch:** `refactor/timezone-utilities`
**Status:** PARTIALLY COMPLETE

**Problem:**
- `convertGMTtoPacific()` function duplicated in:
  - `/api/station-history/route.ts` (lines 53-79)
  - `/api/five-day-wind/route.ts` (lines 53-75)
- Hardcoded `'America/Los_Angeles'` string in 8+ locations
- Inconsistent approaches to timezone handling

**Solution:**
Create shared `lib/timezone-utils.ts` module:
```typescript
export const PACIFIC_TIMEZONE = 'America/Los_Angeles';
export function convertGMTtoPacific(...): Date;
export function getPacificMonthShort(): string;
export function getCurrentPacificDate(): Date;
// ... more utilities
```

**Progress:**
- ✅ Documentation created
- ✅ Branch created
- ⏸️ Implementation pending

**Implementation Plan:** See archived `TIMEZONE_REFACTOR.md`

**Estimated Effort:** 3-4 hours
**Blockers:** None
**Next Step:** Create timezone-utils module and fix critical bug first

---

## 📋 MISSING FEATURES (Documented but Not Implemented)

### 4. Human-Readable Forecast Summaries

**Priority:** LOW (nice-to-have)
**Documented In:** `CLAUDE.md` (lines 46-49)

**What's Documented:**
```
> "Alright, listen up! Tomorrow's looking proper - we're talking 15-18 knots
> with gusts to 22 by 2 PM. Best window: 1-4 PM. Don't sleep in! 💨"

Tone configurable via parameter (Grok / technical / friendly / surfer_dude)
```

---

## 🐞 RECURRING BUG TO DIAGNOSE (DO NOT PATCH YET)

### 5. Forecast period misclassification (weekday → D# mapping)

**Symptom:** Forecast periods like `.SAT` remain unmapped and later periods get shifted (e.g., `.SAT` stays literal, subsequent periods become `D1` instead of `D2`). Example from 2025-12-12 9:19 PM PST bulletin in `Inner waters...` block: `.SAT...` should map to `D1` but stayed `.SAT`; following lines were mapped as `D1`/`D1_NIGHT` instead of `D2`.

**Likely cause:** `convertPeriodsToRelative` uses `new Date()` (server clock) as the base when called from `llm-forecast`/`area-forecast`. When the API runs the next day (or after UTC rolls over), the base day is wrong, so weekday names (SAT/SUN/...) no longer align with issuance time and get skipped. The mapping loop only covers weekdays derived from the (incorrect) base date and first-match-wins, so late/old bulletins mis-map.

**Risks:** Regressing correct mappings for same-day forecasts; double-replacing already-converted tokens (`D0_DAY` → `D0_DAY_DAY` if run twice) if we’re not careful.

**Proposed direction:** Anchor relative-day mapping to the NWS issuance timestamp, not `new Date()`. Prefer the `issuanceTime` from the `@graph` metadata; if missing, parse the bulletin header line (`919 PM PST Fri Dec 12 2025`). Pass that `Date` into `convertPeriodsToRelative`. Add a guard that logs/flags any period tokens left unmapped (e.g., `/\.[A-Z]{3}(?: NIGHT)?\.\.\./`) so we catch future cases. Keep the replacement idempotent (skip already `D#_*` tokens).

**Test plan (before changing code):**
- Unit-test `convertPeriodsToRelative` with a fixed issuance time of Fri Dec 12 2025 21:19 PST and the provided sample text; assert outputs match the expected `D0/D1/D2...` labels.
- Cover edge cases: forecast requested after midnight PST, after UTC rollover, and with already-converted tokens present.
- Validate no regressions for same-day forecasts (Today/Tonight) and for 5-day horizon limits.

### LLM prompt missing day_3/day_4 actuals (DO NOT PATCH YET)

**Symptom:** Few-shot prompt includes forecast periods for Day 0–4, but “ACTUAL WIND CONDITIONS” only lists day_0, day_1, day_2. Day 3/4 actuals exist in training JSON (e.g., `data/training/few_shot_examples_json/*`) but are omitted from the prompt, so Day 3/4 predictions are guided only by forecast text.

**Source:** In `web-ui/src/app/api/llm-forecast/route.ts`, `createFewShotPrompt` hardcodes `['day_0','day_1','day_2']` when emitting actuals.

**Risk:** Reduced quality for Day 3/4 forecasts (model guesses beyond Day 2).

**Proposed direction:** Extend the actuals loop to include day_3 and day_4 when present (guarded to avoid missing-key crashes). If token budget is a concern, consider summarizing day_3/4 (e.g., condensed hourly list or stats) or reducing example count to stay within limits.

**Test plan:** Unit-test `createFewShotPrompt` with a mock example containing day_3/day_4 actuals; assert the prompt includes those blocks. Check prompt length against Anthropic token budget. Verify existing day_0–2 content is unchanged.

**Current Reality:**
- LLM returns only structured JSON predictions
- No human-readable summary generation
- No tone configuration implemented

**Implementation Notes:**
- Could add as optional LLM output
- Would increase token usage (~100-200 tokens)
- Requires prompt modification
- UI would need summary display component

**Estimated Effort:** 2-3 hours
**Blocker:** None, but low priority

### 5. Wind Direction Predictions

**Priority:** MEDIUM
**Documented In:** `CLAUDE.md` line 54, 62

**What's Documented:**
- MVP includes: "WSPD + GST predictions (not direction yet)"
- Future enhancement: "Wind direction modeling"

**Current Reality:**
- Wind direction is tracked in actual data
- Direction arrows displayed on forecast charts
- LLM currently does NOT predict wind direction
- Training examples contain direction data

**Why Not Implemented:**
- Initial focus on speed/gust accuracy
- Direction is available in NWS forecast text
- Less critical for user decision-making
- Would increase prompt complexity

**Implementation Notes:**
- Training data already includes direction
- Would require prompt modification
- LLM output format change needed
- Validation needed for circular mean calculations

**Estimated Effort:** 4-6 hours (includes validation)
**Blocker:** None

### 6. Statistics / Performance Monitoring Page

**Priority:** MEDIUM
**Status:** PLACEHOLDER ONLY

**Current State:**
- `/statistics` page exists with "Coming soon..." text
- No actual statistics tracked
- No performance metrics stored
- No forecast accuracy dashboard

**What Should Be Implemented:**
- Historical forecast accuracy (predicted vs. actual)
- Accuracy by wind speed range
- Accuracy by month/season
- Model variance statistics
- Error distribution charts
- Accuracy trends over time

**Implementation Notes:**
- Requires database or persistent storage
- Cannot use filesystem (Vercel read-only)
- Could use:
  - Vercel KV (Redis)
  - External database (PostgreSQL, MongoDB)
  - Static JSON generation (periodic updates)

**Estimated Effort:** 8-12 hours
**Blocker:** Need to decide on storage solution

### 7. Automated NWS Forecast Fetching

**Priority:** MEDIUM-HIGH
**Documented In:** `CLAUDE.md` line 7

**What's Documented:**
> "The NWS coastal forecast is issued three times a day; each time a new
> forecast is issued, the model should run update the wind prediction at AGXC1"

**Current Reality:**
- Forecasts fetched on-demand (user request triggers API call)
- 3-hour cache prevents excessive refetching
- No scheduled/automated fetching
- No background updates

**Why Not Automated:**
- Serverless functions are request-triggered (no cron)
- Vercel Cron requires Pro plan or external service
- Current caching strategy works for low traffic

**Implementation Options:**
1. **Vercel Cron Jobs** (Pro plan, $20/month)
   - Native integration
   - Reliable execution
   - Requires paid plan upgrade

2. **External Cron Service** (GitHub Actions, cron-job.org)
   - Free option
   - Call API endpoint 3x daily
   - Less reliable than native

3. **Keep Current Approach**
   - On-demand fetching works
   - Cache reduces API calls
   - Sufficient for MVP

**Estimated Effort:** 2-3 hours (if using Vercel Cron)
**Blocker:** Budget decision (need Pro plan for Vercel Cron)

---

## 🐛 ISSUES FOUND DURING DOCUMENTATION AUDIT

### 8. Documentation Inconsistency: Forecast Horizon

**File:** `CLAUDE.md` line 55
**Issue:** Documents "3-day horizon (D+0, D+1, D+2)"
**Reality:** System forecasts 5 days (D+0 through D+4)

**Impact:** Confusing for new developers
**Fix:** Update CLAUDE.md to reflect actual 5-day capability

### 9. Documentation Inconsistency: Area Forecast

**File:** `CLAUDE.md` lines 53, 61
**Issue:**
- MVP section says: "Coastal Waters Forecast only (not Area Forecast)"
- Future enhancements: "Area Forecast integration"

**Reality:** Area Forecast IS implemented and displayed on home page

**Impact:** Misleading documentation
**Fix:** Update CLAUDE.md to mark Area Forecast as ✅ complete

### 10. Duplicate Data Fetching Logic

**Identified In:** `CURRENT_DATA_ARCHITECTURE.md`
**Status:** Documented in detail, planned for refactor (see issue #2)

**Files Affected:**
- `web-ui/src/app/api/five-day-wind/route.ts`
- `web-ui/src/app/api/station-history/route.ts`
- `web-ui/src/app/page.tsx`
- `web-ui/src/app/wind-history/page.tsx`

**Impact:**
- Maintenance: Bug required fixes in 3 separate locations
- Consistency: Different date key formats
- Performance: Duplicate parsing of same NOAA data

**Resolution:** Unified data layer refactoring (see issue #2)

---

## 📊 TESTING GAPS

### 11. Incomplete 2025 Test Data

**Status:** Data collection in progress
**Coverage:** January through September 2025 (9 months)
**Gap:** Need October-December 2025 for full year validation

**Impact:**
- Cannot validate Q4 accuracy
- Missing late-year pattern testing
- Annual variance cannot be calculated

**Resolution:** Wait for data accumulation (passive)

### 12. No Automated Regression Testing

**Current State:**
- Manual testing only
- No CI/CD test suite
- No automated API testing

**Risk:**
- Refactoring could introduce bugs
- No safety net for changes
- Hard to validate cross-browser compatibility

**Recommendation:**
Implement basic test suite:
- API endpoint smoke tests
- Critical user flow tests (E2E)
- Data processing unit tests

**Estimated Effort:** 12-16 hours
**Priority:** MEDIUM (for long-term maintainability)

### 13. No Production Monitoring

**Current State:**
- No error tracking service
- No performance monitoring
- No uptime alerting
- No API usage metrics

**Risk:**
- Silent failures in production
- Performance degradation undetected
- No data for optimization

**Recommendation:**
Add monitoring service:
- Sentry (error tracking)
- Vercel Analytics (built-in)
- Custom logging to external service

**Estimated Effort:** 4-6 hours setup
**Priority:** MEDIUM (recommended before Jan 1 deployment)

---

## 🚀 DEPLOYMENT TASKS (Before Jan 1, 2026)

### 14. Vercel Production Configuration

**Status:** NOT STARTED

**Tasks:**
- [ ] Set up production Vercel project
- [ ] Configure environment variables:
  - `ANTHROPIC_API_KEY`
  - `NODE_ENV=production`
  - `NEXT_PUBLIC_USE_NEW_API` (if feature-flagging)
- [ ] Set up custom domain (if applicable)
- [ ] Configure caching headers
- [ ] Test deployment in staging environment

**Estimated Effort:** 2-3 hours
**Blocker:** Need Anthropic API production key

### 15. Production Data Bundling

**Status:** PARTIAL

**Current State:**
- Training examples bundled in `web-ui/data/training/`
- Model config bundled in `web-ui/config/`
- All paths relative to `web-ui/` (correct for Vercel)

**Verification Needed:**
- [ ] Confirm all file paths work in production
- [ ] Test `/tmp` caching in Vercel environment
- [ ] Verify file size limits (deployment bundle < 50 MB)

**Estimated Effort:** 1-2 hours testing
**Priority:** HIGH

### 16. Environment Variables Documentation

**Status:** NOT STARTED

**Required:**
Create `.env.example` with:
```bash
# Required for LLM forecasting
ANTHROPIC_API_KEY=sk-ant-...

# Optional
NODE_ENV=production
NEXT_PUBLIC_DEBUG_MODE=false
```

**Estimated Effort:** 30 minutes
**Priority:** MEDIUM

---

## 📝 NICE-TO-HAVE IMPROVEMENTS (Low Priority)

### 17. Consolidate Testing Documentation

**Current State:**
- `scripts/testing/README.md` (comprehensive)
- `scripts/testing/SETUP_COMPLETE.md` (completion report)

**Suggestion:** Merge SETUP_COMPLETE.md content into README.md

**Benefit:** Single source for testing documentation
**Effort:** 30 minutes

### 18. API Documentation (OpenAPI/Swagger)

**Current State:** No formal API documentation

**Suggestion:** Generate OpenAPI spec for all API routes
- Documents request/response formats
- Enables API testing tools
- Provides interactive documentation

**Effort:** 4-6 hours
**Priority:** LOW (internal project, no external API consumers)

### 19. Create Deployment Runbook

**Current State:** Deployment steps not documented

**Suggestion:** Create step-by-step deployment guide
- Pre-deployment checklist
- Deployment commands
- Post-deployment verification
- Rollback procedure
- Emergency contacts

**Effort:** 2-3 hours
**Priority:** MEDIUM (useful for Jan 1 deployment)

### 20. User Guide for Non-Technical Users

**Current State:** No user documentation

**Suggestion:** Create simple guide explaining:
- What the forecast means
- How to interpret wind speeds
- When to check forecasts
- Understanding warnings/advisories

**Effort:** 2-3 hours
**Priority:** LOW (target users are ocean sports enthusiasts, generally tech-savvy)

---

## 📅 PRIORITY MATRIX

### Before Jan 1, 2026 Deployment (CRITICAL PATH):

1. **Fix timezone bug (#1)** - 1-2 hours
2. **Vercel production config (#14)** - 2-3 hours
3. **Production data bundling verification (#15)** - 1-2 hours
4. **Basic monitoring setup (#13)** - 4-6 hours
5. **Update CLAUDE.md inconsistencies (#8, #9)** - 30 minutes

**Total:** ~10-14 hours

### Post-Deployment (Can wait):

- Unified data layer refactoring (#2)
- Timezone utilities centralization (#3)
- Wind direction predictions (#5)
- Statistics page (#6)
- Automated fetching (#7)
- Regression testing (#12)

---

## 🏁 COMPLETION CRITERIA

### Definition of "Production Ready":

- [x] LLM forecasting works reliably
- [x] Web UI functional on all pages
- [x] Data processing pipeline validated
- [x] Caching strategy implemented
- [ ] Critical timezone bug fixed (#1)
- [ ] Production Vercel deployment configured (#14)
- [ ] Basic error monitoring in place (#13)
- [ ] Documentation reflects actual capabilities (#8, #9)
- [ ] No known critical bugs

### Definition of "Maintenance Mode":

- [ ] All critical bugs resolved
- [ ] Refactoring complete (unified data layer, timezone utils)
- [ ] Automated testing in place
- [ ] Monitoring and alerting configured
- [ ] Performance optimizations complete
- [ ] Documentation fully up-to-date

---

## 📞 ESCALATION & NOTES

**Critical Bug Contact:** Fix immediately, block deployment if needed
**Refactoring Work:** Schedule for post-deployment (non-blocking)
**Feature Requests:** Document but defer (focus on stability first)

**Last Review:** December 10, 2025
**Next Review:** After Jan 1, 2026 deployment

---

**Related Files:**
- `docs/PROJECT_OVERVIEW.md` - High-level system description
- `docs/archive/CURRENT_DATA_ARCHITECTURE.md` - Detailed architecture analysis
- `docs/archive/UNIFIED_DATA_LAYER_PLAN.md` - Refactoring implementation plan
- `docs/archive/TIMEZONE_REFACTOR.md` - Timezone fix implementation plan
- `CLAUDE.md` - Master reference document
