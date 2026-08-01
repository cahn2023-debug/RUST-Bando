# Data Model: Memory-Safe Report Images

## ReportSection

- `captureMode`: `intersection | route | feature`
- `focusFeatureIds`: features that must remain visible during capture
- `hiddenFeatureIds`: features hidden during capture
- `requiredFeatureIds`: features represented by required geometry
- `requiredPoints`: lng/lat points that must fit inside the capture frame
- `captureWarnings`: warnings shown in preview and DOCX

## ReportImageRef

- `mimeType`: image MIME type
- `bytes`: binary image data used for DOCX
- `objectUrl`: preview-only URL, revoked when no longer needed
- `dataUrl`: legacy fallback
- `width`, `height`: source dimensions for DOCX aspect ratio
- `warnings`: capture-specific warnings
