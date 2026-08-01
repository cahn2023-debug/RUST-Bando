# Feature Specification: Memory-Safe Word Report Map Export

## User Stories

- As a design user exporting a large project, I can export a Word report without the WebView crashing with Out of Memory.
- As a reviewer, I can trust each exported map image contains the required intersection, route, and related objects.
- As a report author, I can still receive a Word document when individual map captures or site photos fail, with visible warnings instead of silent omissions.

## Functional Requirements

- The export pipeline must avoid storing all map captures as base64 data URLs in React state.
- Map captures must use binary image refs for export and object URLs only for preview.
- Each report section must include capture metadata: mode, focused features, hidden features, required feature ids, required points, and warnings.
- Route captures must hide unrelated route/line features and keep only the selected route plus intersections on that route.
- Capture mode must hide transient map overlays such as drawing/edit/measurement/snap/selection layers.
- A capture is valid only when pixel validation passes and all required points project inside the viewport safe frame.
- Missing map captures and unresolved site photos must warn and allow DOCX generation to continue.

## Success Criteria

- Exporting a large multi-section report no longer creates a WebView Out of Memory page.
- Preview and DOCX map images are not covered by translucent overlays.
- Intersection images include parent and direct child objects.
- Route images include the whole selected route and its route intersections.
- DOCX output lists warnings for missing captures or missing site photos.
