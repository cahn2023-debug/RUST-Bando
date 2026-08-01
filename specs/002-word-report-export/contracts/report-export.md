# Contract: Report Export Capture

## Map Capture Request

Existing event: `request-map-capture`

Payload fields:

- `captureId?: string`
- `printArea: [minLat, minLng, maxLat, maxLng] | null`
- `scale?: number`
- `fitToBounds?: boolean`
- `zoom?: number`
- `focusFeatureIds?: string[]`
- `hiddenFeatureIds?: string[]`

## Capture Scope Behavior

- When `focusFeatureIds` is non-empty, renderer shows only those feature IDs.
- `hiddenFeatureIds` are additionally hidden.
- Scope applies only while the capture request is active.
- Renderer must restore normal map state after `design-report-map-capture` emits `active: false`.

## Site Photo Behavior

- Data URL photos are embedded directly.
- Asset-backed photos are resolved before preview/export.
- Unresolved or missing photos create warning text.
- Warnings do not block Word export.
