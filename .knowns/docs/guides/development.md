---
title: development
description: Current development commands, quality gates and source-of-truth rules.
createdAt: '2026-08-11T04:49:37.141Z'
updatedAt: '2026-08-11T04:50:54.663Z'
tags:
  - guide
  - development
  - quality
  - source-aligned
---

# Development & Quality Guidelines — Current

Canonical full summary: @doc/architecture/project-summary-current-state.

## Development

- npm run dev: Vite frontend.
- npm run tauri dev: full desktop app with Tauri/Rust.
- npm run build: frontend build.
- npm run build:msi: Windows MSI package.

## Required quality gate

Before handoff run:

- npm run check:frontend
- npm run check:backend
- npm run check

Also run git diff --check and inspect the diff scope.

Frontend checks include encoding, Tauri boundaries, TypeScript typecheck, ESLint, Vitest coverage and Vite build. Backend checks include cargo fmt, workspace/all-targets check, workspace tests and clippy with warnings denied.

## Source-of-truth rules

- Use schema.rs, v2.rs, v2_bridge.rs and worker_storage.rs as the storage/IPC contract.
- Do not trust old Leaflet, old crate-layout or historical rewrite documents without source verification.
- Do not let React components access SQLite directly; keep IPC behind contracts/adapters.
- Preserve dirty worktree changes and BAK archives unless the task explicitly owns them.
- For broad work, use docs/context-pack/DOCUMENT_STATUS.md to classify older docs.
- For map work, preserve viewport-bounded queries, revision separation, SVG rasterization safety and the maxzoom > clusterMaxZoom invariant.

## Safety

Do not hardcode secrets. Use SQL parameterization. Keep encoding and boundary checks green. Treat draft System Decisions as non-authoritative until reviewed/accepted.
