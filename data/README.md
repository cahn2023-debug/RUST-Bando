# Shared data hub

`data/` is the canonical coordination point for workspace data shared by application tabs and tools.

## Areas

- `manifests/` — migration manifests, ownership, hashes, and coordination metadata; tracked in Git.
- `schemas/` — shared data contracts and schemas; tracked in Git.
- `raw/` — large or external inputs; ignored by default.
- `normalized/` — generated or transformed shared data; ignored by default.
- `exports/` — generated exports; ignored by default.
- `runtime/` — runtime state and temporary coordination data; ignored by default.
- `samples/` — small reproducible fixtures; tracked in Git.

Canonical shared data belongs here. A tab may keep app-private runtime storage inside its own contract, but it must not create a second canonical copy of shared workspace data.

