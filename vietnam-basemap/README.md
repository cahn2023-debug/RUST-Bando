# Vietnam Basemap Platform

This directory is the standalone boundary for the reusable Vietnam basemap
platform. It is deliberately separate from the existing application source,
Tauri backend, SQLite database, and project-specific map features.

The platform owns:

- basemap source metadata and build outputs;
- versioned release packages;
- styles, fonts/glyphs, sprites, and tile assets;
- the online/offline manifest and active-release contract.

It does not own project features such as cameras, fiber, equipment, design
points, or business metadata. Those remain in the consuming application.

## Release package contract

Each release exposes a manifest plus basemap-only assets. Clients may obtain
the same contract from the online service or from a local package:

```text
manifest.json
tiles/
styles/
fonts/
sprites/
```

The contract intentionally records the tile format and container as metadata.
The concrete build and serving implementation is selected by later tasks.

## Development

Run contract checks from this directory:

```text
cargo fmt --check
cargo check
cargo test
```
