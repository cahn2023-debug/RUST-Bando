# Basemap Release Package Layout

The package contains only assets required to render the basemap:

```text
<release>/
├── manifest.json
├── tiles/
├── styles/
├── fonts/
└── sprites/
```

`manifest.json` is the compatibility entry point for both online and offline
clients. Paths in the manifest are package-relative; they must never be
absolute paths into a consuming application's filesystem.

The package must not contain project-specific feature data, including camera,
intersection, cabinet, fiber, duct, pole, equipment, project point, project
line, or business metadata records.
