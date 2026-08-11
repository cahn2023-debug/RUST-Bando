---
title: frontend
description: Current live React frontend, MapLibre rendering, IPC boundary and rewrite/archive status.
createdAt: '2026-08-11T04:49:36.722Z'
updatedAt: '2026-08-11T04:50:55.254Z'
tags:
  - architecture
  - frontend
  - react
  - maplibre
  - source-aligned
---

# Frontend Architecture — Current Source-Aligned View

Canonical full summary: @doc/architecture/project-summary-current-state.

## Live entrypoint and shell

The live entrypoint is src/modules/home/main.tsx. It initializes the Tauri browser/runtime adapter, i18n, ErrorBoundary and lazy analysis/print/street-view views. The main shell is src/modules/home/App.tsx; AppBootstrap gates auth/loading and the shell coordinates project lifecycle, tabs, save/force-save, layout/palettes, providers and accessibility announcements.

Current live module areas:

- src/modules/home: shell/bootstrap/dashboard/workspace.
- src/modules/design: design/CAD UI, MapLibre map, feature selection/editing, drawing, snapping, overlays, palettes and street view.
- src/modules/implement: project management, auth/settings/layout, files/content and storage services.
- src/modules/contract and analytics: domain views/dashboard.
- src/core: basemap runtime/cache and shared stores.
- src/contracts and src/shared: IPC contracts/adapters and utilities.

## IPC rule

Components should use typed contracts and safe adapters; direct Tauri invoke calls belong behind the adapter boundary. The backend schema/commands remain the data contract.

## Map

BasemapRuntime/BasemapProvider own basemap preset/preferences and cache. MapLibreFastRenderer consumes design state, builds GeoJSON/layers/overlays, registers decoder-safe SVG images and performs viewport-first query/render.

For large projects, query_visible_features_v2 is bounded by bbox/limit and visibleFeatures remains query-authoritative. viewportQueryRevision triggers a refresh after feature events; viewportRevision represents data/render changes and must not create a query loop.

The shared feature-symbol rules are documented at @doc/learnings/learning-map-feature-symbol-normalization.

## Rewrite/archive status

The legacy frontend is live in src/. The 460-file legacy snapshot is preserved at BAK/archive/2026-08-09/frontend with a manifest. A 16-source-file replacement shell is preserved at BAK/archive/2026-08-09/replacement-frontend; its draft decision is not an accepted runtime fact.

## Verification

Use npm run check:frontend: encoding, boundaries, typecheck, lint, Vitest coverage and Vite build. See @doc/guides/development.
