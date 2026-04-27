# Troubleshoot Log - Project Explorer Enhancements

## Context
- User wants Project Explorer to show all entities of the same type when a group (e.g., Intersection) is selected.
- User wants a sort button to toggle between sorting by Name and sorting by Serial Number (STT).

## Virtual Meeting (Hội đồng 4 Agent)

### 1. Logic Agent (Logic)
- **Problem**: Selecting a group currently just expands it and selects it in the store. It doesn't affect the global filters.
- **Hypothesis**: We should hook into the `onClick` event of the `TreeItem`. If the clicked group has a `group_type` (like 'INTERSECTION'), we should update the `filterType` state.
- **Concern**: Auto-filtering on every click might be annoying. Maybe define a specific "Toggle Filter" action or only do it if the filter isn't already set?
- **Decision**: When a specific type-based group is selected, we automatically set the `filterType` to match it. This allows the recursive filtering logic (already implemented) to show all matching nodes across the project.

### 2. Architect Agent (Architect)
- **Problem**: Sorting is only "Reverse" (Asc/Desc) right now, always by Name.
- **Design**: 
    - Introduce `sortField`: `'name' | 'stt'`.
    - Extract STT from metadata if available. Usually, `feature_number` or a specific metadata field `stt`.
    - The sort button should cycle or have a dropdown: [Name A-Z, Name Z-A, STT 1-9, STT 9-1].
- **Data Structure**: Use a `sortConfig` state: `{ field: 'name' | 'stt', direction: 'asc' | 'desc' }`.

### 3. Performance Agent (Performance)
- **Concern**: Sorting large lists of features and groups recursively.
- **Optimization**: Keep sorting inside `useMemo`. Ensure `getParsedMetadata` is efficient (it's already memoized per feature usually, but here we call it inside sorts).
- **Tip**: For STT, pre-parse it once during the data mapping phase instead of parsing inside the sort comparator.

### 4. Security Agent (Security)
- **Review**: No sensitive data affected. Input validation on `prompt` or UI selects is safe.

## Consensus Plan
1.  **Selection Logic**: Modify `setSelectedGroup` to also trigger `setFilterType(group.group_type)` if it's a specific functional type.
2.  **Sort Criterion**:
    - Add `sortField` state.
    - Update data mapping to include a `sortKey` (numeric for STT, string for Name).
    - Update `TreeItem` rendering to use the selected sort.
3.  **UI**: Update the header button in `DrawingExplorer.tsx` to handle the new sort options.

## Next Steps
- [ ] Update `DrawingExplorer.tsx` state and UI.
- [ ] Implement STT extraction logic.
- [ ] Apply new sorting to `filteredRegions` and recursive rendering.
