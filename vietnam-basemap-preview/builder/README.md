# Basemap Builder

The builder validates source/layer configuration and packages prepared
basemap artifacts into an immutable versioned release. It is intentionally
separate from the consuming application's business data.

The current builder accepts a prepared tile archive and prepared style/font/
sprite files. An OSM/Planetiler adapter can produce those inputs without
changing the package or client contract.

Example configuration: builder/config/pipeline.example.json.

The CLI shape is:

    cargo run -p basemap_builder -- --config builder/config/pipeline.example.json --tile-archive <prepared-tile-archive> --styles-dir <styles-directory> --fonts-dir <fonts-directory> --sprites-dir <sprites-directory> --output <release-root>

The builder refuses to overwrite an existing version and writes through a
staging directory before publishing the completed package.
