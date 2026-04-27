# PROJECT: GIS Polyline System

## Context
Implementing advanced GIS features for a utility management system (Power, Signal, Trenching). The system requires precise spatial data (Snapping), structured attributes (Metadata), and logical subdivision (Segmentation) based on physical boundaries (Roads, Sidewalks).

## Tech Stack
- **Frontend**: React, Leaflet (react-leaflet), Zustand (useDesignSync)
- **Backend**: Rust (Tauri), SQLite (rusqlite), Firestore (firebase-rs), rstar (R-tree)
- **Data**: GeoJSON logic, Custom Segment Models

## Core Requirements
1. **Polyline Drawing**: Dynamic drawing with multi-vertex support.
2. **Snapping Engine**: 5m threshold snap to existing points/objects using R-Tree.
3. **Segmentation Logic**: Auto-split polylines when crossing "Road" or "Sidewalk" polygons.
4. **Metadata Management**: Schema-based properties for PowerLine, SignalLine, and TrenchLine.
5. **Data Persistence**: Hierarchical storage in Firestore (Polylines -> Segments).

## Roadmap
- **Phase 1**: Data Models (Rust & TS)
- **Phase 2**: Snapping & Spatial Indexing
- **Phase 3**: Segmentation Algorithm (Polygon Intersections)
- **Phase 4**: UI Tools & Metadata Editors
- **Phase 5**: Integration & Verification

## Milestone 2: Simulated View & Recognition
- **Phase 6**: GIS Math & PPM Utilities
- **Phase 7**: Device Configuration UI Redesign (Collapsible Simulation Sections)
- **Phase 8**: Google Street View Integration (Simulated View)
- **Phase 9**: Recognition Quality Simulation (Simulated Recognition / DORI)
- **Phase 10**: Advanced Visualizations (DORI Heatmaps on Map)
