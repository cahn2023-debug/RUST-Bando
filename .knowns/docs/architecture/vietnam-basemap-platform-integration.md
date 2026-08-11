---
title: Vietnam Basemap Platform Integration
description: Current-client integration and operational boundary for the standalone Vietnam Basemap Platform.
createdAt: '2026-08-11T07:22:25.298Z'
updatedAt: '2026-08-11T07:34:54.125Z'
tags:
  - architecture
  - basemap
  - integration
  - offline
  - release
---

## Purpose

The Vietnam Basemap Platform is integrated into the current MapLibre runtime through a typed adapter. The existing default basemap path remains unchanged until a provider is explicitly configured.

## Client Boundary

- Adapter: `src/core/basemap/vietnamBasemapClient.ts`
- Runtime boundary: `BasemapRuntimeConfig.vietnamBasemap`
- Export surface: `src/core/basemap/index.ts`
- Business features and project data remain outside the basemap package.

The adapter accepts the approved manifest contract and resolves the same style, tile, glyph, sprite, and asset semantics for both modes:

- Online: service endpoints under `/api/v1/basemap`, `/tiles`, `/fonts`, and `/sprites`.
- Offline: package-relative paths under an application-owned base URL or local protocol such as `basemap://release/1.0.0`.

The package styles use internal `{basemap-tiles}`, `{basemap-glyphs}`, and `{basemap-sprite}` placeholders. The adapter fetches the selected style through the online service or local package and resolves those placeholders before passing the typed style document to MapLibre. Callers do not read release files or provider storage directly.

## Configuration Shape

A client provides a validated manifest and an adapter-created provider:

```typescript
const client = createVietnamBasemapClient({
  mode: 'online',
  baseUrl: 'http://basemap.local',
  manifest
});

const runtimeConfig = {
  ...existingConfig,
  vietnamBasemap: {
    client,
    styleId: manifest.defaultStyle,
    sourceId: 'vn-basemap'
  }
};
```

The provider path loads the resolved manifest style and skips the legacy external tile prefetch/cache path. Without `vietnamBasemap`, the current runtime behavior is preserved.

## Release Operations

1. Build a candidate package with the standalone builder.
2. Validate the candidate with the release manager.
3. Manually activate the validated version.
4. Keep old immutable versions available for rollback.
5. Point online clients at the active service version and offline clients at the matching package version.

The release manager and package-level details are in the standalone `vietnam-basemap/docs/` documentation. The operator is responsible for source license and attribution metadata; the platform does not make legal compliance decisions.

## Verification

- Frontend: `npm run typecheck`, targeted basemap Vitest suite, and `npm run check:frontend`.
- Standalone platform: `cargo fmt --check --manifest-path vietnam-basemap/Cargo.toml`, `cargo test --manifest-path vietnam-basemap/Cargo.toml`, and `cargo clippy --manifest-path vietnam-basemap/Cargo.toml --all-targets -- -D warnings`.
- Release acceptance requires manifest compatibility, declared assets, resolved style URLs, service health, and rollback checks.
