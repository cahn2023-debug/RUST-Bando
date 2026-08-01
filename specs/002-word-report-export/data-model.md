# Data Model: Word Design Report Export

## Report Model

- `title`: Effective report title shown in preview and Word.
- `sections`: Ordered report sections.
- `selectedItems`: Original export selections.

## Report Section

- `captureMode`: `intersection`, `route`, or `feature`.
- `focusFeatureIds`: Features that must remain visible during capture.
- `hiddenFeatureIds`: Features hidden during capture, especially unrelated routes.
- `bounds`: Map bounds for capture.
- `details`: Object details and site photos.
- `photoWarnings`: Aggregated warnings from section details.

## Report Feature Detail

- `photos`: Ordered site photos, including unresolved photo references.
- `photoWarnings`: Missing or unresolved photo warnings for the object.
- `bounds`: Detail bounds for object-level context.

## Report Photo

- `dataUrl`: Resolved image data when embeddable.
- `assetId`: Existing media asset reference.
- `warning`: Optional warning when the photo cannot be resolved.
