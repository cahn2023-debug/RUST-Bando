# Virtual Meeting: Map Clustering Performance Optimization (/@tv)

**Date**: 2026-03-27
**Participants**:
- **Agent Architect**: System structure & pattern enforcement.
- **Agent Performance**: FPS, Memory & Latency optimization.
- **Agent Logic**: Functional correctness and edge cases.
- **Agent Security**: Data integrity and access control.

## 1. Problem Statement
The "Gom nhóm" (Clustering) toggle is slow (~1s latency) and occasionally fails to update existing markers. This is due to an O(N) re-render cycle in `PointLayer.tsx` that triggers on every state change, combined with inefficient one-by-one marker manipulation.

## 2. Agent Hypotheses & Debate

### Performance Agent (Proposal: Batch Migration)
> "Moving 3000 markers using `addLayer` one-by-one triggers 3000 internal spatial index updates in Leaflet. We MUST use `addLayers([])` and `removeLayers([])` to perform a single batch update. This will reduce latency from >1000ms to <50ms."

### Logic Agent (Observation: Missing Sync)
> "Current implementation in `Effect 2` doesn't even move existing markers when `showFeatureGroups` changes. It only affects new ones. This is a functional bug. We need to explicitly check if a marker's `_group` matches the desired `targetGroup` and move it if not."

### Architect Agent (Recommendation: Decoupling)
> "Effect 2 is overloaded. We should decouple 'Feature Lifecycle' (add/remove features) from 'Feature Appearance' (clustering/selection/mode). Let's move the clustering toggle logic to a standalone Effect that only runs when `showFeatureGroups` changes."

### Security Agent (Check)
> "Ensure that while moving markers between groups, we don't accidentally lose the `featureId` metadata or break the Popup Manager which relies on finding markers in these groups."

## 3. Consensus Decision
**The O(Batch) Migration Pattern**:
1.  **Refactor `PointLayer`**: Remove `showFeatureGroups` from the main population sync (Effect 2).
2.  **Dedicated Clustering Effect**: Add a specialized `useEffect` for `[showFeatureGroups]`.
3.  **Marker Partitioning**: Gather all markers from `markersMapRef`, identify which ones are currently in the wrong group.
4.  **Bulk Operation**: Use `removeLayers` on Source Group and `addLayers` on Target Group in two atomic calls.

## 4. Expected Outcome
Near-instant (sub-100ms) toggling of clustering mode for thousands of objects on the map.
