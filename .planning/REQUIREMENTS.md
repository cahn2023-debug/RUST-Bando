# REQUIREMENTS: GIS Polyline Features

## 1. Functional Requirements
### 1.1 Polyline Drawing
- [ ] Support multi-click points for vertex creation.
- [ ] Support double-click to finish.
- [ ] Visual feedback for active drawing.

### 1.2 Snapping
- [ ] Snap to Points (CCTV, PTZ, etc.) within 5 meters.
- [ ] Snap to Vertices of other Polylines.
- [ ] Visual indication (ghost point) when snapped.

### 1.3 Segmentation
- [ ] Detect intersections with Road and Sidewalk polygons.
- [ ] Split Polyline into Segments at intersection points.
- [ ] Assign SegmentType (Asphalt, Stone, Soil, etc.) based on underlying polygon.

### 1.4 Metadata
- [ ] Support schema-based metadata for Power, Signal, and Trench types.
- [ ] Per-segment metadata for TrenchLines.

## 2. Technical Requirements
- [ ] Use `rstar` in Rust for spatial indexing.
- [ ] Keep GIS logic in Rust for performance.
- [ ] Sync with Firestore for real-time collaboration.

## 3. Simulated View & Recognition (Milestone 2)
### 3.1 Simulated View
- [ ] Integrate Google Street View Static API.
- [ ] Map camera location and rotation to Street View parameters (`location`, `heading`, `fov`).
- [ ] Handle UI for loading/displaying the simulated image.

### 3.2 Simulated Recognition (PPM/DORI)
- [ ] Implement PPM calculation formula based on focal length, sensor size, and resolution.
- [ ] Add technical spec inputs to DeviceConfigPanel (Height, Focal Length, Resolution).
- [ ] Support DORI standard levels (Detection, Observation, Recognition, Identification).
- [ ] Generate simulated sample images (pixelated based on PPM).

### 3.3 Visual Enhancements
- [ ] Visualize DORI zones on the map FOV.
- [ ] Responsive UI for simulation results.
