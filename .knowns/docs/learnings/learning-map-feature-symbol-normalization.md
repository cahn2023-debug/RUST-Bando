---
title: 'Learning: Map feature symbol normalization'
description: Reusable icon/color/size normalization pattern and review findings from task 9bp8ef.
createdAt: '2026-08-09T06:19:14.469Z'
updatedAt: '2026-08-09T06:49:47.884Z'
tags:
  - learning
  - map
  - icons
  - svg
  - maplibre
  - frontend
---

# Learning: Map feature symbol normalization

## Patterns

### Shared feature symbol contract

- **What:** Keep icon alias normalization, safe SVG color validation, geometry-specific size bounds, and default colors in one utility consumed by PropertyPanel, feature display metadata, SVG generation, and MapLibre GeoJSON/image preparation.
- **When to use:** Any feature style that must look identical in React preview, SVG/raster map images, and persisted metadata.
- **Source:** @task-9bp8ef
- **Canonical decision:** @decision/20260809-1318-canonical-feature-symbol-contract-for-icon-type-color-and-pixel-size

### Persisted size is the final bitmap size

- **What:** Treat the saved point size as the final pixel dimensions for MapLibre icon images; include canonical icon, color, size, label, and rotation in the image cache key.
- **When to use:** When custom SVG icons are rasterized before being registered with MapLibre.
- **Source:** @task-9bp8ef

## Decisions

### Remove implicit camera/intersection scaling

- **Chose:** Use the normalized persisted size directly for camera and intersection preview/map images.
- **Over:** Applying a hidden `size * 1.5` multiplier based on icon type.
- **Tag:** GOOD_CALL / TRADEOFF
- **Outcome:** UI, GeoJSON display properties, SVG dimensions, and raster image dimensions agree.
- **Recommendation:** If visual emphasis is needed, make it an explicit, separately named selected-state rule rather than changing the persisted symbol size.

## Failures

### Full-suite performance threshold was timing-sensitive

- **What went wrong:** One full frontend run failed an unrelated large-project performance assertion at 159ms against a 100ms threshold.
- **Root cause:** Test timing varies with suite/system load; the isolated test and the rerun of the complete frontend gate passed without changing production code.
- **Time lost:** About two minutes for triage and rerun.
- **Prevention:** Re-run the failing test in isolation before changing a threshold or unrelated implementation; record it as flaky when the isolated and subsequent full run pass.


## 2026-08-09 — Runtime SVG decoder compatibility

**Classification:** Runtime rendering/integration failure.

**Root cause:** The shared map SVG generator emitted optional CSS filter syntax in the serialized SVG (`style="filter: ..."` and an SVG `filter="drop-shadow(...)"` attribute). The SVG is rasterized through `createImageBitmap` before `map.addImage`; WebView SVG decoders may reject or skip this non-portable markup, leaving the MapLibre symbol image unavailable even though the GeoJSON feature and icon ID are present.

**Signal:** Map lines/overlays and labels render, but camera/intersection symbol images do not appear; targeted string tests can still pass unless they assert the standalone rasterization contract.

**Fix:** Keep generated map SVG standalone and decoder-safe: retain the `<svg>` root, normalized color/size/icon/label/rotation, and remove optional HTML/CSS filter markup. Add a regression assertion for no `<div>`, `style=`, or `filter=` in map icon SVG output.

**Verification:** Targeted map/icon suite (77 tests), typecheck, encoding, frontend boundaries, lint, coverage, and production build passed.


## 2026-08-09 — GeoJSON clustering zoom invariant

**Classification:** Runtime MapLibre rendering/integration failure.

**Root cause:** `mapLibreLayerSetup.ts` configured the GeoJSON point source with `clusterMaxZoom: 22` but omitted `maxzoom`; MapLibre GeoJSON sources default `maxzoom` to 18, so the source violated the required invariant `maxzoom > clusterMaxZoom` and the live renderer reported a `circle`-layer TypeError during repeated frames.

**Fix:** Set the source `maxzoom` to `MAP_POINT_CLUSTER_MAX_ZOOM + 1` (23) and add a regression assertion for the invariant in the renderer test.

**Verification:** Map/icon targeted suite 77 tests, typecheck, boundaries, full frontend gate and build passed. The unrelated `StaticCameraPreview` failure passed twice in isolation and was classified as flaky.
