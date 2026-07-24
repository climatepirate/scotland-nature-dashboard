# Ecosystem Pressure Map PMTiles Migration - Complete

## Migration Summary

Successfully migrated **Ecosystem Pressure Map** to PMTiles architecture using the established reference pattern from Overview and Dependency maps.

## Files Created/Modified

### New Files
- **dashboard_app/src/maps/ecosystemPressureMapPmtiles.js** (321 lines)
  - MapLibre + PMTiles implementation for Pressure map
  - 14 ecosystem pressure types with dynamic service selector
  - Follows exact lifecycle pattern: INITIALIZE → CREATE → LOAD → BIND → CLEANUP

- **dashboard_app/src/maps/ecosystemPressureMapWms.js** (511 lines)
  - WMS fallback implementation (original code extracted)
  - Preserved as exact copy of original ecosystemPressureMap.js functionality
  - Only used if PMTiles initialization fails

### Modified Files
- **dashboard_app/src/maps/ecosystemPressureMap.js** (11 lines)
  - Converted to PMTiles-first entry point with try-catch fallback
  - Calls initEcosystemPressureMapPmtiles() with error handler
  - Falls back to initEcosystemPressureMapWms() on failure

## Architecture Compliance

✅ **Follows Reference Pattern**
- Uses all shared utilities from pmtilesMaplibreRuntime.js
- No duplicate utility functions
- Unique namespaced IDs prevent collisions
- Identical lifecycle organization with clear section markers

✅ **Configuration (PAGE-SPECIFIC)**
```javascript
const PRESSURE_LEGEND_STOPS = [5 color stops]
const PRESSURE_OPTIONS = [14 services with field names]
const pressureConfigByLabel = Map(...)

function buildMapStyle() { ... }
function getLegendStopsForSelection() { ... }
function buildColorExpression() { ... }
function buildOpacityExpression() { ... }
function setSelectorOptions() { ... }
```

✅ **14 Ecosystem Pressure Services**
1. All ecosystem pressures
2. Freshwater area use
3. Land use
4. Seabed use
5. Water use
6. Biotic resource extraction
7. Abiotic resource extraction
8. Greenhouse-gas emissions
9. Non-GHG air pollutants
10. Nutrient soil and water pollutants
11. Toxic soil and water pollutants
12. Solid-waste generation
13. Introduction of invasive species
14. Disturbance: noise and light

## Unique Identifiers (Prevents Map Conflicts)

| Component | Overview | Dependency | Pressure |
|-----------|----------|-----------|----------|
| Layer ID | `overall-business-thematic-layer` | `ecosystem-dependency-thematic-layer` | `ecosystem-pressure-thematic-layer` |
| Outline ID | `overall-business-outline-layer` | `ecosystem-dependency-outline-layer` | `ecosystem-pressure-outline-layer` |
| Source ID | `overall-business-*-source` | `ecosystem-dependency-*-source` | `ecosystem-pressure-*-source` |
| Container | `_overallBusinessPmtilesMap` | `_ecosystemDependencyPmtilesMap` | `_ecosystemPressurePmtilesMap` |

## Features Implemented

✅ **Shared from pmtilesMaplibreRuntime.js**
- Asset loading (MapLibre + PMTiles CSS/JS)
- Protocol registration (singleton pattern)
- HTML escaping and value formatting
- Generic MapLibre builders (filters, legend elements)
- Legend value application

✅ **Page-Specific to Pressure Map**
- 14-service configuration with field name mapping
- Dynamic service selector with legend sync
- Pressure-specific color expressions
- Pressure legend data from pressureLegendByLayerName
- Popups with pressure score extraction

✅ **Error Handling & Fallback**
- PMTiles-first strategy in entry point
- Try-catch wrapper enables WMS fallback
- Console logging for debugging
- Graceful degradation if PMTiles protocol fails

## Data Flow

```
initEcosystemPressureMap() [Entry Point]
  ↓
  try → initEcosystemPressureMapPmtiles() [MapLibre + PMTiles]
  ↓
  catch → initEcosystemPressureMapWms() [Leaflet + WMS]
```

**PMTiles Flow (Primary):**
1. Load MapLibre + PMTiles assets (lazy-load, cached)
2. Register pmtiles:// protocol (singleton, once-only)
3. Create map instance with background layer
4. Add PMTiles sources (outline + thematic)
5. Add layers (outline + thematic)
6. Apply filters from global state
7. Set active service and populate selector
8. Bind click handlers for popups
9. Subscribe to state changes
10. Cleanup on map removal

**WMS Fallback (if PMTiles fails):**
- Identical functionality using Leaflet + WMS tiles
- Same service selector and legend UI
- Same popup behavior on click
- Global filter binding preserved

## State Management

**Global Filters** (applied to both PMTiles and WMS):
- `localAuthorityCode` - Local Authority filter
- `coarseCategory` - Coarse Category filter
- Both applied via `buildGlobalFilterExpression()`

**Pressure-Specific State:**
- `selectedPressure` - Currently active pressure service label
- Updated on service selector change

## Testing Checklist (When Deployed)

- [ ] Pressure map renders pressure hexagons from PMTiles
- [ ] Pressure map legend shows correct color ramp (5 stops)
- [ ] Service selector changes map display and legend
- [ ] All 14 pressure services display correctly
- [ ] Filters (Local Authority, Coarse Category) work
- [ ] Popups show hexagon ID, company count, average pressure
- [ ] No console errors about protocol registration
- [ ] No WMS requests made (PMTiles only)
- [ ] Repeated navigation doesn't cause memory leaks
- [ ] Service selector persists across map state changes

## Comparison: Before vs After

| Aspect | Before (WMS) | After (PMTiles) | Improvement |
|--------|-------------|-----------------|------------|
| Entry Point | 511 lines (full WMS) | 11 lines (entry only) | 98% smaller |
| PMTiles Impl | N/A | 321 lines | New feature |
| WMS Fallback | Full in main file | 511 lines (separate) | Better organization |
| Shared Utils | Duplicated | Imported from runtime | DRY principle |
| Error Handling | None | Try-catch + fallback | Robust |
| Architecture | Monolithic | Modular | Cleaner |

## Reference Pattern Status

✅ **All 3 Maps Now Follow Same Pattern:**
1. **Overview Map** - Simple thematic layer (company concentration)
2. **Dependency Map** - 26-service selector with dynamic legend
3. **Pressure Map** - 14-service selector with dynamic legend

**Pattern is proven and established** - ready for Business Vulnerability migration when approved.

## Remaining Maps (Not Yet Migrated)

- **Business Vulnerability Map** (ecosystemVulnerabilityMap.js) - PENDING USER APPROVAL
  - Currently WMS-based
  - No Business Vulnerability map yet created in structure
  - Ready to migrate using same reference pattern when approved

## Next Steps

**Immediate:**
1. Test Pressure map at localhost to verify PMTiles renders correctly
2. Confirm service selector works and legend updates
3. Confirm filters work
4. Confirm no console errors

**Future (when user approves):**
1. Migrate Business Vulnerability map using same pattern
2. Verify all 4 maps coexist without ID collisions
3. Document final architecture as template for future enhancements

## Code Quality Metrics

- **Duplication eliminated**: All utilities in shared runtime
- **Consistency achieved**: All 3 maps follow identical lifecycle
- **Maintainability improved**: Page-specific logic clearly separated
- **Error handling**: PMTiles-first with WMS fallback
- **Performance**: PMTiles reduces WMS calls, faster tile delivery
- **Scalability**: Pattern easily applied to new maps
