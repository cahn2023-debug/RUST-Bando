# Research: Word Report Export OOM And Capture Completeness

## Findings

- `canvas.toDataURL()` creates large base64 strings and duplicates image memory.
- Holding all report map captures in React state increases retained heap for large projects.
- DOCX image embedding can accept binary image data, so base64 is not required for export.
- Existing pixel validation only rejects blank/transparent captures; it does not prove required objects are in frame.
- Renderer capture filtering already supports focused and hidden feature ids, so the fix should extend that path.

## Decisions

- Use `toBlob` plus `Uint8Array` for map capture output.
- Keep preview object URLs short-lived and revoke them on reset/unmount.
- Validate required geometry by projecting required points into the fitted viewport.
- Continue export with warnings for recoverable capture/photo failures.
