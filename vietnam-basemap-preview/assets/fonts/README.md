# Vietnamese Font and Glyph Inputs

The release package must provide local glyph PBF files for the font stack used
by the styles. The operator supplies the licensed font and generated glyph
ranges; vendor binaries are not embedded in source control by this contract.

Expected package shape:

    fonts/
    └── Noto Sans/
        ├── 0-255.pbf
        ├── 256-511.pbf
        └── ...

The style placeholder {basemap-glyphs} is resolved to this package directory
by the online or offline client adapter. No runtime Google Fonts or other CDN
request is allowed.
