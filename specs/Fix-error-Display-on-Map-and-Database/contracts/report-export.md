# Contract: Report Map Capture

## Request

`request-map-capture`

- `captureId`
- `printArea`
- `scale`
- `fitToBounds`
- `zoom`
- `focusFeatureIds`
- `hiddenFeatureIds`
- `requiredFeatureIds`
- `requiredPoints`
- `captureKind`: `preview | export`
- `pixelBudget`

## Success

Window event `map-capture-result`

- `captureId`
- `image`: `{ mimeType, bytes, width, height, warnings }`
- `width`
- `height`
- `mimeType`
- `warnings`

## Error

Window event `map-capture-error`

- `captureId`
- `error`
- `recoverable: true`
