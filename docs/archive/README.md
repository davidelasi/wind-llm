# Archive - Historical Documentation

**Purpose:** This folder contains historical documentation from earlier development phases. Most issues documented here have been resolved.

---

## Contents

###  Investigation Files (web-ui/investigation/)

These files document the analysis and resolution of TOON v1.0 data degradation issues from late 2024.

**Files:**
1. `IMPLEMENTATION_PLAN.md` - Fix plan for TOON v1.0 data loss
2. `proposed_solution.md` - Proposed approach to resolve degradation
3. `training_data_degradation_analysis.md` - Root cause analysis
4. `analyze_forecast_issue.md` - Forecast parsing investigation

**Status:** ✅ RESOLVED
**Resolution:** TOON v2.0 implemented with 100% data preservation (verified Dec 2024)
**Token Savings:** 63.7% reduction vs. JSON format
**Data Loss:** ZERO - complete roundtrip conversion validated

**Kept For:** Historical reference, lessons learned

---

### Refactoring Plans

**Files:**
1. `CURRENT_DATA_ARCHITECTURE.md` - Analysis of duplicate data APIs
2. `UNIFIED_DATA_LAYER_PLAN.md` - Plan to consolidate wind data APIs
3. `TIMEZONE_REFACTOR.md` - Timezone utilities centralization plan

**Status:** 🚧 IN PROGRESS
**Current Action:** Consolidated into `docs/TECHNICAL_TODOS.md`
**Active Issues:** See TECHNICAL_TODOS.md for current status

**Implementation Details:**
- **Duplicate APIs:** `/api/five-day-wind` and `/api/station-history` fetch same data
- **Timezone Bug:** Critical issue in `llm-forecast/route.ts:233` (MUST FIX before production)
- **Consolidation Plan:** Create unified `/api/wind-history` endpoint

**Kept For:** Detailed implementation context, architectural decisions

---

## Why Archived

These documents served important purposes during development but are no longer primary references:

**Investigation Files:**
- Issues are resolved (TOON v2.0 working)
- Historical record of problem-solving process
- Lessons learned about data format design

**Refactoring Plans:**
- Key information extracted to `TECHNICAL_TODOS.md`
- Active work tracking moved to main docs
- Detailed plans preserved for implementation reference

---

## When to Reference These Files

**You should read these if:**
- Implementing the unified data layer (see UNIFIED_DATA_LAYER_PLAN.md)
- Fixing timezone bugs (see TIMEZONE_REFACTOR.md)
- Understanding data architecture decisions (see CURRENT_DATA_ARCHITECTURE.md)
- Curious about TOON format history (see investigation files)

**You probably don't need these if:**
- Just starting with the project (read `docs/PROJECT_OVERVIEW.md` instead)
- Looking for active work items (see `docs/TECHNICAL_TODOS.md`)
- Understanding current system capabilities (see `CLAUDE.md`)

---

## Archival Date

December 10, 2025

**Archived By:** Documentation consolidation effort
**Related Commit:** [To be added after commit]
