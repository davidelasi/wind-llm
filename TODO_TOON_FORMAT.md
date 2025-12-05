# TOON Format - Future Improvements TODO

This document tracks optional improvements and investigations related to the TOON v2.0 format.

**Status**: NICE TO HAVE - Low priority items for future consideration
**Last Updated**: December 4, 2025

---

## 🔧 Code Cleanup

### 1. Review `test_2025_forecast.py` Format Parameter
**File**: `scripts/testing/test_2025_forecast.py`
**Lines**: 129-130, 142
**Issue**: Has unused `forecast_format` parameter that accepts 'json' or 'toon' but never actually uses TOON format

**Options:**
- **Option A**: Add TOON loading capability using `load_toon_examples()` from converter
- **Option B**: Remove unused `forecast_format` parameter to avoid confusion

**Recommendation**: Option B (keep it simple, JSON is production format)

**Impact**: Low - cosmetic cleanup, no functional issues

**Estimated Effort**: 15-30 minutes

---

## 🎨 UI Review

### 2. Review Web UI TOON References
**File**: `web-ui/src/app/page.tsx`
**Lines**: 223, 889, 896-908, 943
**Issue**: Code references TOON format in various places

**Investigation Needed:**
- [ ] Determine if references are cosmetic (display text only) or functional (actually loads/processes TOON)
- [ ] If cosmetic: No changes needed
- [ ] If functional: Verify TOON v2.0 compatibility or update to use JSON

**Current Assessment**: Appears to be display-only based on context, but needs verification

**Impact**: Low - UI display only, no data processing impact expected

**Estimated Effort**: 30-60 minutes investigation

---

## 📊 Future Enhancements

### 3. TOON Format Experiments (When Applicable)

**Potential Use Cases:**
- Token-constrained training scenarios
- High-volume batch processing
- Cost optimization experiments with many examples
- A/B testing of JSON vs TOON format performance

**Prerequisites:**
- [ ] Update any code that loads training examples to support TOON
- [ ] Add format selection parameter to API endpoints (if needed)
- [ ] Verify TOON loader (`load_toon_examples()`) in production environment
- [ ] Document any performance differences

**Impact**: Medium - could provide cost savings in token-heavy scenarios

**Estimated Effort**: 2-4 hours for full implementation

---

## 🎯 Priority Summary

| Item | Priority | Effort | Impact | Recommended Action |
|------|----------|--------|--------|-------------------|
| #1: test_2025_forecast.py cleanup | Low | 15-30min | Low | Remove unused parameter when convenient |
| #2: Web UI review | Low | 30-60min | Low | Investigate when updating UI |
| #3: TOON experiments | Optional | 2-4hrs | Medium | Consider for future optimization |

---

## ✅ Completion Criteria

**Item #1** is complete when:
- Unused `forecast_format` parameter removed from `test_2025_forecast.py`
- OR TOON loading capability fully implemented and tested
- Function signature updated in documentation

**Item #2** is complete when:
- All UI TOON references reviewed and categorized
- Functional references (if any) verified compatible with TOON v2.0
- OR updated to use JSON if issues found

**Item #3** is complete when:
- Decision made on whether to pursue TOON experiments
- If yes: Full implementation completed and documented
- If no: Item marked as "Not Pursuing" with rationale

---

## 📝 Notes

- TOON v2.0 is production-ready with 100% data preservation verified
- JSON remains the official production format for all forecasting
- TOON format is available as an alternative when/if needed
- No urgency to complete these items - they are purely optional improvements
