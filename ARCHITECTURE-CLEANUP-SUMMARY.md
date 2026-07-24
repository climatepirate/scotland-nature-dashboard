# PMTiles Architecture Cleanup - Completion Summary

## Overview
Successfully refactored both PMTiles implementations (Overview and Dependency maps) to eliminate code duplication and establish a consistent, maintainable architecture baseline for future map migrations.

## Refactoring Results

### Code Reduction
- **pmtilesMaplibreRuntime.js**: 40 → 190 lines
  - Added shared utilities: formatting, filtering, legend creation, MapLibre builders
  - All functions include purpose comments
  - No page-specific logic present

- **overallBusinessMapPmtiles.js**: ~392 → 264 lines (-33% reduction)
  - All utility functions removed (now imported from runtime)
  - Clean lifecycle sections with clear markers
  - Page-specific: Legend stops, layer IDs, thematic expressions

- **ecosystemDependencyMapPmtiles.js**: 764 (with duplicates) → 316 lines (-59% reduction)
  - Eliminated all duplicate utility functions
  - Clean lifecycle sections with clear markers  
  - Page-specific: 26 ecosystem services, service selector logic

### Shared Runtime (pmtilesMaplibreRuntime.js)

**Asset Management:**
- `loadMapLibrePmtilesAssets()` - Lazy-loads MapLibre + PMTiles JS/CSS (promise-cached)
- `ensurePmtilesProtocolRegistered()` - Registers pmtiles:// protocol exactly once

**Utilities (truly generic, used by both maps):**
- `escapeHtml()` - HTML entity escaping for popup content
- `firstDefinedValue()` - Finds first non-null value across property keys
- `formatNumericValue()` - Formats numbers for display (integers vs decimals)
- `rgba255ToCss()` - Converts RGBA 0-255 to CSS rgba() format
- `parseRangeLabel()` - Extracts min/max from legend range labels
- `formatLegendNumber()` - Formats numbers for legend display

**MapLibre Builders (generic, map-agnostic):**
- `buildGlobalFilterExpression()` - Creates MapLibre filter from Local Authority + Coarse Category
- `createLegendElement()` - Creates DOM structure for legend
- `applyLegendValues()` - Updates legend title, gradient, and min/mid/max labels

## Lifecycle Pattern (Both Maps Follow)

Each PMTiles implementation now follows this consistent lifecycle:

```javascript
// PAGE-SPECIFIC CONFIGURATION
const PAGE_LEGEND_STOPS = [...]
const PAGE_LAYER_ID = "..."
const PAGE_OUTLINE_ID = "..."
function buildMapStyle() { ... }
function buildColorExpression() { ... }  // Page-specific thematic logic
function buildOpacityExpression() { ... }

// PAGE-SPECIFIC: Optional selector logic (Dependency only)
function getSelectorOptions() { ... }
function setActive...() { ... }

export async function initMapPmtiles() {
  // INITIALIZE: Clean old map, load assets, register protocol
  // CREATE: Map instance and legend element
  // LOAD: Add PMTiles sources
  // CREATE: Add outline and thematic layers
  // BIND: Apply filters, popups, selectors, state subscriptions
  // CLEANUP: Remove listeners on map removal
}
```

## Key Architecture Decisions

### 1. Unique ID Strategy (Prevents Collisions)
- **Overview**: `overall-business-*` IDs, `_overallBusinessPmtilesMap` container property
- **Dependency**: `ecosystem-dependency-*` IDs, `_ecosystemDependencyPmtilesMap` container property
- Both maps can exist and render independently without conflicts

### 2. Error Handling & Fallback
- Entry point in each map module (overallBusinessMap.js, ecosystemDependencyMap.js) uses try-catch
- PMTiles-first with automatic fallback to WMS on failure
- Ensures graceful degradation if PMTiles protocol fails

### 3. State Management
- Global state via state.js with subscribe/updateState pattern
- Local Authority + Coarse Category filters applied via `buildGlobalFilterExpression()`
- Service-specific state (Dependency only): `selectedDependency` service label
- Map-specific state (Overview only): `overallMapMetric` (company concentration)

### 4. No Protocol Duplication
- `ensurePmtilesProtocolRegistered()` uses singleton pattern with `pmtilesProtocolRegistered` flag
- Protocol registered exactly once, even if multiple maps initialize
- Prevents duplicate registration errors

### 5. Proper Cleanup
- All event listeners removed when map destroyed
- State subscriptions unsubscribed
- Container references cleared to prevent memory leaks
- Handler references on DOM elements deleted

## Shared Utilities vs. Page-Specific Logic

### ✅ In pmtilesMaplibreRuntime.js (Truly Generic)
- Asset loading and protocol registration
- HTML escaping, number formatting, color conversion
- Range label parsing
- Global filter expression building (using passed-in constants)
- Legend DOM creation and value application
- No knowledge of specific services, layers, or thematic data

### ✅ In Each Map Module (Page-Specific)
- Legend color stops and configuration
- Unique layer/source IDs and container properties
- MapLibre style definition
- Thematic expression logic (color/opacity based on property names)
- Service selector options and handlers (Dependency only)
- State subscription logic (if map-specific)
- Popups and feature interaction patterns

## Validation Checklist

✅ Both maps render correctly from PMTiles
✅ Both maps apply filters (Local Authority, Coarse Category) correctly
✅ Both maps show popups on click
✅ Dependency map service selector works
✅ No duplicate protocol registration errors
✅ No ID collisions between maps
✅ No memory leaks on repeated navigation
✅ Maps coexist without conflicts
✅ WMS fallback works when tested
✅ All deprecated/dead code removed
✅ Lifecycle sections clearly marked in both implementations

## Reference Implementation Status

✅ **Overview Map (overallBusinessMapPmtiles.js)** - Reference implementation for simple thematic layers
✅ **Dependency Map (ecosystemDependencyMapPmtiles.js)** - Reference implementation for complex multi-option layers with selectors

## Recommended Pattern for Future Migrations

When migrating Pressure or Vulnerability maps to PMTiles, follow this template:

1. **Create page-specific config section** at top of new file
   - Import constants from config files
   - Define LAYER_IDs, SOURCE_IDs, LEGEND_STOPS
   - Define buildMapStyle() and page-specific expressions

2. **Import from shared runtime**
   - Only import utility functions you actually need
   - Include entry point pattern from either Overview or Dependency as template

3. **Implement export function** with lifecycle sections
   - Copy INITIALIZE through CLEANUP section pattern
   - Replace service-selector logic only if needed (like Dependency)
   - Keep cleanup comprehensive (unsubscribe, remove handlers, clear refs)

4. **No duplicate utilities**
   - All formatting, escaping, filtering done via pmtilesMaplibreRuntime.js
   - Only page-specific logic and thematic expressions in the new module

## Code Statistics

| Module | Original | Refactored | Reduction |
|--------|----------|------------|-----------|
| pmtilesMaplibreRuntime.js | 40 | 190 | +150 (intentional expansion) |
| overallBusinessMapPmtiles.js | ~392 | 264 | -128 lines (-33%) |
| ecosystemDependencyMapPmtiles.js | 764* | 316 | -448 lines (-59%) |
| **Total** | ~1,196 | **770** | **-426 lines (-36%)** |

*Dependency included duplicates (764 vs actual ~430 without duplicates)

## Next Steps

Ready for:
1. ✅ Migration of Pressure Map to PMTiles (using this reference)
2. ✅ Migration of Vulnerability Map to PMTiles (using this reference)
3. ✅ Additional shared utilities can be added to runtime as patterns emerge
4. ✅ Performance optimization based on actual usage patterns

**NOTE:** User explicitly requested no further migrations until completion of current architecture work. Pressure and Vulnerability maps remain on WMS until explicitly approved for migration.
