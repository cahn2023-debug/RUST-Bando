# Implementation Plan: Word Design Report Export

**Branch**: `[002-word-report-export]` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-word-report-export/spec.md`

## Summary

Improve the existing Word report export flow by adding an editable report title, section-specific map capture scope, route-only capture filtering, and explicit site photo warnings while reusing the current report dialog, report model, map capture handler, renderer, and DOCX builder.

## Technical Context

**Language/Version**: TypeScript with React 19  
**Primary Dependencies**: Tauri event bridge, docx, MapLibre, existing media asset service  
**Storage**: Existing feature metadata and media assets; no migration  
**Testing**: Vitest and React Testing Library  
**Target Platform**: Tauri desktop app  
**Project Type**: Desktop application  
**Performance Goals**: Capture each selected report section without permanently changing map state; keep export responsive with progress status  
**Constraints**: Preserve normal map rendering after any capture failure; do not block export for missing site photos  
**Scale/Scope**: Existing report export flow for selected regions, groups, and features

## Constitution Check

Project constitution is still the default placeholder, so no enforceable gates are defined. The implementation follows the repository's existing test-first and surgical-change guidance from AGENTS/CLAUDE instructions.

## Project Structure

```text
src/modules/design/features/reports/word/
├── ReportExportDialog.tsx
├── reportModel.ts
├── reportDocx.ts
├── reportModel.test.ts
└── reportDocx.test.ts

src/modules/design/features/map/
├── MapLibreFastRenderer.tsx
├── mapLibreFastAdapter.ts
├── mapLibreFastTypes.ts
└── MapLayerComponents/MapCaptureHandler.tsx
```

**Structure Decision**: Extend the existing report and map capture modules in place; no new backend API or schema migration is required.

## Complexity Tracking

No constitution violations or additional architectural complexity required.
