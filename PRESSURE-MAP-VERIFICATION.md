# Pressure Map Migration - Quick Verification Guide

## Implementation Summary

**What was done:**
- Created ecosystemPressureMapPmtiles.js (321 lines) - MapLibre + PMTiles implementation
- Created ecosystemPressureMapWms.js (511 lines) - WMS fallback (extracted from original)
- Updated ecosystemPressureMap.js (11 lines) - PMTiles-first entry point with try-catch

## File Changes

```
dashboard_app/src/maps/ecosystemPressureMap.js
- OLD: 511 lines of WMS Leaflet implementation
- NEW: 11 lines - PMTiles entry point with fallback

dashboard_app/src/maps/ecosystemPressureMapPmtiles.js [NEW]
- 321 lines - MapLibre PMTiles implementation following reference pattern

dashboard_app/src/maps/ecosystemPressureMapWms.js [NEW]
- 511 lines - WMS fallback (same as original ecosystemPressureMap.js)
```

## Quick Verification Checklist

Test at `http://localhost` with Docker running:

### Basic Rendering
- [ ] Pressure map displays hexagons
- [ ] Hexagons have color gradient (light tan to dark red)
- [ ] Hexagons cover Scotland area
- [ ] Map can pan and zoom (zoom 5-12)

### Legend
- [ ] Legend appears (top-right area)
- [ ] Legend title shows current pressure type (default: "All ecosystem pressures")
- [ ] Legend bar shows color gradient
- [ ] Legend shows min/mid/max values

### Service Selector
- [ ] Dropdown shows all 14 pressure services:
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

### Selector Functionality
- [ ] Changing selector updates map hexagons
- [ ] Legend title changes with selector
- [ ] Legend color gradient changes with selector
- [ ] Legend min/mid/max values update

### Filters
- [ ] Local Authority filter (if present) affects hexagons
- [ ] Coarse Category filter (if present) affects hexagons
- [ ] Toggling filters updates map display

### Popups
- [ ] Click on hexagon shows popup
- [ ] Popup includes:
  - "Ecosystem pressure: [service name]"
  - "Hexagon ID: [id number]"
  - "Company count: [count]"
  - "Average pressure per business: [number]"

### Performance
- [ ] Map renders smoothly without lag
- [ ] Selector changes don't cause lag
- [ ] Repeated navigation doesn't cause slowness

### Console Check
- [ ] Open Browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Check for errors:
  - ❌ NO errors about "protocol already registered"
  - ❌ NO errors about undefined variables
  - ❌ NO 404 errors for tiles
  - ✅ MAY see info about PMTiles loading

### Network Check (Advanced)
- [ ] Open DevTools Network tab
- [ ] Reload page
- [ ] Check requests:
  - ✅ Should see PMTiles file requests (core_hex.pmtiles, hex_outline.pmtiles)
  - ❌ Should NOT see WMS requests to /ows endpoint

## Expected Behavior Summary

**When PMTiles loads successfully:**
- Map displays from PMTiles vector tiles (fast, local)
- No WMS requests to QGIS Server
- Service selector works with dynamic legend
- Filters work properly
- Popups show when clicking hexagons

**If PMTiles fails (fallback to WMS):**
- Map displays from WMS tiles (slower, server-based)
- Console shows: "[Pressure PMTiles] initialization failed, falling back to WMS"
- All functionality works (selector, filters, popups)
- User doesn't notice the failure

## Unique Configuration for Pressure Map

| Setting | Value | Purpose |
|---------|-------|---------|
| Container ID | `ecosystem-pressure-map` | HTML element ID |
| Selector ID | `ecosystem-pressure-service-select` | Dropdown element |
| Layer IDs | `ecosystem-pressure-*-layer` | MapLibre layer names |
| Source IDs | `ecosystem-pressure-*-source` | PMTiles source names |
| Map container ref | `_ecosystemPressurePmtilesMap` | Prevent conflicts |
| Services | 14 total | Pressure types |
| Default service | "All ecosystem pressures" | Initial display |

## Success Criteria

✅ **Map Passes If:**
- Renders hexagons from PMTiles
- Service selector works (changes map + legend)
- Filters work (if available)
- Popups work on click
- No console errors
- Smooth performance

❌ **Map Fails If:**
- Shows blank map/error
- Selector doesn't change display
- Console shows repeated errors
- Network shows only WMS requests (indicates PMTiles didn't load)

## Troubleshooting

**If map shows blank:**
1. Check console for errors (F12)
2. Check Network tab for failed requests
3. Confirm Docker with QGIS Server is running
4. Try hard refresh (Cmd+Shift+R or Ctrl+Shift+F5)

**If selector doesn't work:**
1. Check console for JavaScript errors
2. Verify HTML has `ecosystem-pressure-service-select` element
3. Check that pressureLegendByLayerName imports correctly

**If only WMS loads (no PMTiles):**
1. Check Browser console - look for PMTiles initialization errors
2. Verify core_hex.pmtiles and hex_outline.pmtiles exist in Data/tiles/
3. Check import map in index.html includes fflate module

## Files to Verify Are Correct

Before testing, confirm these files exist with correct content:

```bash
# Entry point - should have try-catch pattern (11 lines)
dashboard_app/src/maps/ecosystemPressureMap.js

# PMTiles implementation - should import from pmtilesMaplibreRuntime (321 lines)
dashboard_app/src/maps/ecosystemPressureMapPmtiles.js

# WMS fallback - should have full Leaflet/WMS code (511 lines)
dashboard_app/src/maps/ecosystemPressureMapWms.js

# Shared utilities - should have all formatting functions (190 lines)
dashboard_app/src/maps/pmtilesMaplibreRuntime.js

# Pressure legend data - should have 14 service configs
dashboard_app/src/config/pressureLegendData.js

# QGIS config - should have pressure layer names
dashboard_app/src/config/qgisServer.js
```

## Next Step

1. Test at localhost following checklist above
2. If ✅ all checks pass → Pressure map is working correctly
3. If ❌ any check fails → Report error from console for debugging
4. Once verified → Ready to migrate Business Vulnerability map
