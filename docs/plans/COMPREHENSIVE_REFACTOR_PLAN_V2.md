# KẾ HOẠCH REFACTOR TOÀN DIỆN - PROJECT MANAGER V7.0

**Ngày tạo**: 2026-04-11  
**Mục tiêu**: Tối ưu hóa luồng logic, cải thiện chất lượng code, giảm technical debt mà KHÔNG ảnh hưởng đến chức năng hiện tại  
**Phạm vi**: Frontend (React/TypeScript) + Backend (Rust/Tauri)  
**Nguyên tắc**: Refactor an toàn, từng bước nhỏ, có test gate, giữ nguyên contract IPC và database schema

---

## 📊 TỔNG QUAN TÌNH TRẠNG HIỆN TẠI

### ✅ Điểm mạnh
- Frontend build: ✅ PASS (với 6 warnings TS6133 - unused imports)
- Backend check: ✅ PASS (cargo check green)
- Tests: ✅ PASS (npm test + cargo test đều green)
- Kiến trúc cơ bản đã được phân tách rõ ràng (HOME/DESIGN/IMPLEMENT/TOOL)
- Không có TODO/FIXME/HACK comments trong codebase (code quality tốt)
- Đa số duplicate modules đã được converge

### ⚠️ Vấn đề cần giải quyết

| Hạng mục | Mức độ | Số lượng | Impact |
|----------|--------|----------|--------|
| **TypeScript unused imports** | Low | 6 files | Build không clean |
| **Rust clippy warnings** | Low-Medium | 44 warnings (29 auto-fixable) | Code quality, maintainability |
| **File quá lớn (>400 lines)** | Medium | 8 files | Khó maintain, test |
| **State management complexity** | Medium-High | useDesignSync quá phân tán | Debug khó, risk bug |
| **Command functions quá nhiều params** | Medium | 3 functions (9 params each) | Type safety, readability |
| **Unsafe code thiếu documentation** | Medium | 1 function | Safety risk |
| **Store slices phân tán** | Medium | 6 slices trong useDesignSync | Architecture drift risk |
| **Large orchestration components** | Medium | 5 components >500 lines | Maintainability |

---

## 🎯 MỤC TIÊU REFACTOR

### Primary Goals (P0 - Bắt buộc)
1. ✅ **Clean build**: Loại bỏ tất cả TypeScript warnings
2. ✅ **Clean clippy**: Fix tất cả 44 Rust clippy warnings
3. ✅ **Giảm complexity**: Split files >500 lines thành components nhỏ hơn
4. ✅ **Improve type safety**: Refactor functions với >7 parameters thành struct-based
5. ✅ **Document unsafe code**: Thêm `# Safety` docs cho unsafe Rust functions

### Secondary Goals (P1 - Nên làm)
6. ✅ **Consolidate store slices**: Hợp lý hóa useDesignSync architecture
7. ✅ **Extract business logic**: Tách logic khỏi presentational components
8. ✅ **Improve error handling**: Chuẩn hóa error patterns across codebase
9. ✅ **Optimize re-renders**: Memoization và selector optimization
10. ✅ **Code duplication**: Identify và eliminate duplicate logic

### Nice-to-Have (P2 - Có thì tốt)
11. Performance profiling và optimization hot paths
12. Better test coverage cho critical paths
13. Documentation updates cho architecture

---

## 📋 KẾ HOẠCH THỰC THI CHI TIẾT

### PHASE 1: Quick Wins - Clean Build Gates (1-2 hours)
**Mục tiêu**: Build hoàn toàn sạch sẽ, không warnings

#### Task 1.1: Fix TypeScript Unused Imports (6 files)
**Files cần sửa**:
1. `src/DESIGN/components/core/CADNavigation.tsx` - Remove unused `React` import
2. `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx` - Remove unused `contextMenu` variable (line 78)
3. `src/DESIGN/components/core/CADPanels/Explorer/ExplorerFilterBar.tsx` - Remove unused `React` import
4. `src/DESIGN/components/core/CADPanels/Explorer/ExplorerModals.tsx` - Remove unused `React` import
5. `src/DESIGN/features/map/stores/mapStateSlice.ts` - Remove unused `DesignActionResponse`, `DesignBulkActionResponse` imports

**Action**: Delete unused imports/variables  
**Risk**:极低 (chỉ xóa code không dùng)  
**Verification**: `npm run build` phải sạch sẽ warnings

#### Task 1.2: Auto-fix Rust Clippy Warnings (29 auto-fixable)
**Command**:
```bash
cd src-tauri
cargo clippy --fix --allow-dirty --allow-staged
```

**Warnings sẽ được auto-fix**:
- 6x `len_zero`: `arr.len() > 0` → `!arr.is_empty()`
- 8x `needless_borrow`: `&conn` → `conn`
- 3x `unwrap_or_default`: `unwrap_or_else(|| "".to_string())` → `unwrap_or_default()`
- 2x `manual_flatten`: Manual if-let → `.flatten()`
- 2x `explicit_auto_deref`: `&mut *f` → `&mut f`
- 2x `let_unit_value`: Remove useless unit bindings
- 1x `needless_question_mark`: `Ok(x?)` → `x`
- 1x `collapsible_match`: Collapse nested patterns
- 1x `unnecessary_lazy_evaluations`: `unwrap_or_else` → `unwrap_or`
- 1x `cloned_ref_to_slice_refs`: Use `std::slice::from_ref`

**Risk**: 极低 (clippy --fix chỉ apply safe transformations)  
**Verification**: `cargo clippy` phải giảm từ 44 → 15 warnings

#### Task 1.3: Manual Clippy Fixes (15 remaining)
**Files**:
1. `spatial.rs:134` - `len() > 0` → `!is_empty()` (if not auto-fixed)
2. `state.rs:590` - `&Vec<T>` → `&[T]` parameter type
3. `mod.rs:313` - Use `std::slice::from_ref`
4. `commands.rs:30` - Add `impl Default for History`
5. `simd_math.rs:29` - Add `# Safety` documentation
6. `auth.rs:64` - `unwrap_or_else` → `unwrap_or` (if not auto-fixed)
7. `contract.rs:53` - Refactor `create_contract` (9 params → struct)
8. `contract_analysis.rs:161` - `unwrap_or_default` (if not auto-fixed)
9. `file_tree.rs:66` - Manual flatten (if not auto-fixed)
10. `material.rs:64,149` - Needless borrow (if not auto-fixed)
11. `project.rs:84,113` - `unwrap_or_default` + refactor `update_project_details`
12. `project_v4.rs:114` - Needless borrow (if not auto-fixed)
13. `task.rs:45,70,129,318` - Refactor `create_task` + needless borrows

**Priority functions với 9 parameters**:
- `create_contract` (contract.rs:53)
- `update_project_details` (project.rs:113)
- `create_task` (task.rs:45)

**Solution**: Tạo struct cho mỗi function
```rust
// Before
pub fn create_contract(
    conn: &Connection,
    project_id: i64,
    contract_number: String,
    contract_name: Option<String>,
    investor: Option<String>,
    contractor: Option<String>,
    value: f64,
    currency: String,
    notes: Option<String>
) -> Result<Contract, Error>

// After
#[derive(Deserialize)]
pub struct CreateContractParams {
    pub contract_number: String,
    pub contract_name: Option<String>,
    pub investor: Option<String>,
    pub contractor: Option<String>,
    pub value: f64,
    pub currency: String,
    pub notes: Option<String>,
}

pub fn create_contract(
    conn: &Connection,
    project_id: i64,
    params: CreateContractParams,
) -> Result<Contract, Error>
```

**Verification**: `cargo clippy` phải về 0 warnings

**Exit Criteria Phase 1**:
- ✅ `npm run build` → 0 warnings
- ✅ `cargo clippy` → 0 warnings
- ✅ `npm run test` → all pass
- ✅ `cargo test` → all pass

---

### PHASE 2: Decompose Large Components (4-6 hours)
**Mục tiêu**: Không có file nào >500 lines

#### Task 2.1: Split PropertyPanel.tsx (772 lines → ~200 lines each)
**File**: `src/DESIGN/components/core/PropertyPanel.tsx`

**Current problems**:
- Mixes UI rendering, form state, import logic, camera integration, metadata editing
- Too many responsibilities in one component

**Target decomposition**:
```
PropertyPanel/
├── PropertyPanel.tsx (150 lines) - Container/orchestrator
├── PropertyForm.tsx (200 lines) - Name, icon, metadata form
├── PropertyActions.tsx (100 lines) - Save, delete, import buttons
├── PropertyImportModal.tsx (150 lines) - Import from Excel/KML dialog
├── PropertyMetadataEditor.tsx (200 lines) - Nested metadata editor
└── index.ts - Re-export
```

**Logic extraction**:
```typescript
// Extract to hooks/usePropertyPanel.ts
function usePropertyPanel(featureId: string | null) {
  // All state management logic
  // Local name/meta state
  // Save/delete handlers
  // Import handlers
}

// Extract to hooks/usePropertyMetadata.ts
function usePropertyMetadata(feature: Feature | null) {
  // Nested metadata get/set helpers
  // Preview sync logic
}
```

#### Task 2.2: Split PrintDialog.tsx (578 lines → ~200 lines each)
**File**: `src/DESIGN/features/print/PrintDialog.tsx`

**Target decomposition**:
```
print/
├── PrintDialog.tsx (150 lines) - Main dialog container
├── PrintSettings.tsx (200 lines) - Print configuration form
├── PrintPreview.tsx (150 lines) - Preview canvas
├── PrintJobProgress.tsx (100 lines) - Progress tracking
└── index.ts
```

**Logic extraction**:
```typescript
// hooks/usePrintJob.ts
function usePrintJob(settings: PrintSettings) {
  // Print job state machine
  // Progress tracking
  // Error handling
}

// hooks/usePrintSettings.ts
function usePrintSettings() {
  // Form state for print options
  // Validation logic
  // Preset management
}
```

#### Task 2.3: Split CameraViewPanel.tsx (565 lines → ~200 lines each)
**File**: `src/DESIGN/features/map/Palette/CameraViewPanel.tsx`

**Target decomposition**:
```
Palette/
├── CameraViewPanel.tsx (150 lines) - Panel container
├── CameraControls.tsx (200 lines) - Camera adjustment controls
├── CameraPresets.tsx (100 lines) - Saved camera positions
├── CameraLivePreview.tsx (150 lines) - Live preview renderer
└── index.ts
```

#### Task 2.4: Split BoxSummary.tsx (442 lines → ~150 lines each)
**File**: `src/DESIGN/features/map/MapLayerComponents/BoxSummary.tsx`

**Target decomposition**:
```
MapLayerComponents/
├── BoxSummary.tsx (150 lines) - Summary container
├── BoxStatistics.tsx (150 lines) - Stats display
├── BoxActions.tsx (100 lines) - Action buttons
└── index.ts
```

#### Task 2.5: Split AnalysisTable.tsx (431 lines → ~200 lines each)
**File**: `src/DESIGN/components/ui/AnalysisTable.tsx`

**Target decomposition**:
```
ui/
├── AnalysisTable.tsx (150 lines) - Table container + column defs
├── AnalysisTableRows.tsx (150 lines) - Row rendering
├── AnalysisTableToolbar.tsx (150 lines) - Filter, sort, export toolbar
└── index.ts
```

**Exit Criteria Phase 2**:
- ✅ Không có file TypeScript/TSX nào >500 lines
- ✅ Mỗi component có tối đa 2-3 responsibilities
- ✅ Logic được extract thành custom hooks
- ✅ All tests pass
- ✅ Manual smoke test: UI still renders correctly

---

### PHASE 3: Consolidate Store Architecture (6-8 hours)
**Mục tiêu**: useDesignSync dễ hiểu hơn, ít phân tán hơn

#### Task 3.1: Analyze Current Store Slice Dependencies
**Current state**:
```typescript
useDesignSync = {
  ...createMapStateSlice(...a),        // 297 lines - features, layers, regions
  ...createSelectionSlice(...a),       // 66 lines - hover, select, box select
  ...createDrawingSlice(...a),         // ??? lines - drawing mode, points
  ...createUIControlSlice(...a),       // 67 lines - panels, DORIs, zoom
  ...createInitializationSlice(...a), // 169 lines - loading, pegman
  ...createDesignActionSlice(...a),   // 229 lines - actions, history
}
```

**Problem**: 6 slices spread across different directories, hard to trace data flow

#### Task 3.2: Create Store Facade Pattern
**Target architecture**:
```typescript
// src/IMPLEMENT/stores/useDesignSync/
useDesignSync/
├── index.ts                    // Main store creation
├── types.ts                    // Unified store types
├── mapStateSlice.ts           // Features, layers, regions
├── selectionSlice.ts          // Selection state
├── drawingSlice.ts            # Drawing mode
├── uiControlSlice.ts          # UI toggles
├── initializationSlice.ts     # Loading state
├── designActionSlice.ts       # Actions + history
├── selectors.ts               # Memoized selectors (reselect)
└── middleware.ts              # Event sync middleware
```

**Improvements**:
1. Add memoized selectors with `reselect` or `useMemo`
2. Create action creators that compose multiple slice actions
3. Add middleware for cross-cutting concerns (undo/redo, event sync)

#### Task 3.3: Implement Memoized Selectors
**Current problem**: Components directly access `state.features`, causing unnecessary re-renders

**Solution**:
```typescript
// selectors.ts
import { createSelector } from 'reselect'; // or write simple memoization

const selectState = (s: DesignSyncStore) => s.state;
const selectSelectionSet = (s: DesignSyncStore) => s.selectionSet;

export const selectFeatureById = createSelector(
  [selectState, (_state, featureId: string) => featureId],
  (state, featureId) => state?.features?.[featureId]
);

export const selectSelectedFeatures = createSelector(
  [selectState, selectSelectionSet],
  (state, selectionSet) => 
    Array.from(selectionSet).map(id => state?.features?.[id]).filter(Boolean)
);

export const selectVisibleFeatures = createSelector(
  [selectState],
  (state) => Object.values(state?.features || {}).filter(f => f.visible)
);
```

**Usage in components**:
```typescript
// Before - re-renders on ANY state change
const feature = useDesignSync(s => s.state?.features?.[id]);

// After - only re-renders when THIS feature changes
const feature = useDesignSync(s => selectFeatureById(s, id));
```

#### Task 3.4: Extract Store Middleware
**Current**: Event dispatching, history management, undo/redo all mixed in slices

**Target**: Dedicated middleware layer
```typescript
// middleware.ts
export const designSyncMiddleware: StateCreator<DesignSyncStore> = (set, get, api) => {
  // Intercept all actions
  // Auto-sync to backend via IPC
  // Manage undo/redo history
  // Trigger cross-window events
};
```

**Exit Criteria Phase 3**:
- ✅ Store slices collocated in one directory
- ✅ All components use memoized selectors
- ✅ No direct `state.features[id]` access patterns
- ✅ Undo/redo logic centralized in middleware
- ✅ Performance test: Map renders 20% faster (fewer re-renders)

---

### PHASE 4: Optimize Logic Flow & Performance (8-10 hours)
**Mục tiêu**: Code chạy nhanh hơn, dễ debug hơn

#### Task 4.1: Extract Business Logic from Components
**Components cần refactor**:

**1. DrawingExplorer.tsx (287 lines)**
- Current: Mixes tree flattening, drag-drop, import, search, filter, expand state
- Target: Extract 3-4 custom hooks

```typescript
// hooks/useDrawingExplorer.ts - Tree management
function useDrawingExplorer(regions, layers, groups, features) {
  // Expand/collapse logic
  // Auto-expand on load
  // LocalStorage persistence
}

// hooks/useDrawingTreeSearch.ts - Search & filter
function useDrawingTreeSearch(items) {
  // Text search
  // Type filter
  // Sort (name vs STT)
  // Reverse order
}

// hooks/useDrawingImport.ts - Import orchestration
function useDrawingImport(projectId) {
  // Excel import flow
  // KML import flow
  // Mapping dialog state
}

// hooks/useDrawingDragDrop.ts - Drag & drop
function useDrawingDragDrop(dispatchEvents, selectionSet) {
  // Virtual drag state
  // Drag start handler
  // Drop handler with backend sync
}
```

**2. FeatureEditor.tsx (428 lines)**
- Current: Editing UI, validation, preview, camera controls
- Target: Split into 2-3 components + hooks

#### Task 4.2: Optimize Event Handlers
**Current problem**: Every small state change triggers backend IPC call

**Solution**: Debounce + batch updates
```typescript
// Before - fires IPC on every keystroke
const updateName = (name: string) => {
  setLocalName(name);
  dispatchEvent({ type: 'feature_name_update', feature_id: id, name });
};

// After - debounce 300ms
const updateName = useMemo(
  () => debounce((name: string) => {
    setLocalName(name);
    dispatchEvent({ type: 'feature_name_update', feature_id: id, name });
  }, 300),
  [id, dispatchEvent]
);
```

#### Task 4.3: Implement React.memo Strategically
**Components nên memoize**:
1. `TreeItem` - Renders hundreds of times in explorer
2. `FeatureItem` - Same as above
3. `AnalysisTable` rows - Large tables
4. `MapLayerComponents` - Map overlays
5. `PalettePanel` variants - Complex panels

```typescript
// Before
export const TreeItem = ({ item, expanded, onToggle }) => { ... };

// After
export const TreeItem = React.memo(({ item, expanded, onToggle }) => { ... });
```

**Rule of thumb**: Memoize components that:
- Render >50 instances
- Have expensive rendering logic
- Receive stable props (primitives, memoized objects)

#### Task 4.4: Optimize Backend Command Calls
**Current**: Some commands fetch more data than needed

**Solutions**:
1. **Add selective hydration endpoints**:
```rust
// Instead of loading ALL features, load only visible ones
#[tauri::command]
pub fn get_design_state_partial(
    state: State<'_, AppState>,
    project_id: i64,
    include_features: bool,
    include_groups: bool,
) -> Result<PartialDesignState, String>
```

2. **Implement cursor-based pagination** for large datasets:
```rust
pub fn get_features_paginated(
    conn: &Connection,
    project_id: i64,
    cursor: Option<i64>,
    limit: usize,
) -> Result<(Vec<Feature>, Option<i64>), Error>
```

#### Task 4.5: Fix Error Handling Inconsistencies
**Current**: Mix of `Result<T, String>`, `Result<T, anyhow::Error>`, and silent failures

**Target**: Standardize on `Result<T, AppError>` with custom error type
```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("File not found: {path}")]
    FileNotFound { path: String },
    
    #[error("Invalid parameter: {field}")]
    InvalidParameter { field: String },
    
    #[error("IPC error: {0}")]
    IPC(#[from] tauri::Error),
}
```

**Exit Criteria Phase 4**:
- ✅ All large components decomposed into hooks + presentational components
- ✅ Event handlers debounced where appropriate
- ✅ React.memo applied to hot-path components
- ✅ Backend commands support partial hydration
- ✅ Error handling standardized
- ✅ Performance profile: 30% faster initial render, 50% fewer IPC calls

---

### PHASE 5: Code Quality & Maintainability (4-6 hours)
**Mục tiêu**: Code dễ đọc, dễ test, dễ onboard

#### Task 5.1: Add Missing Type Definitions
**Current gaps**:
1. `DesignSyncStore` type quá lớn, khó hiểu
2. Event types không đầy đủ documentation
3. Some utility types implicit

**Solution**:
```typescript
// Explicit type for every complex object
export interface FeatureGroup {
  id: string;
  type: 'camera' | 'polygon' | 'line';
  name: string;
  visible: boolean;
  metadata: FeatureMetadata;
}

export type DesignEventType =
  | { type: 'feature_added'; feature: Feature }
  | { type: 'feature_updated'; feature_id: string; changes: Partial<Feature> }
  | { type: 'feature_deleted'; feature_id: string }
  | // ... all variants explicitly documented
```

#### Task 5.2: Add JSDoc Documentation
**Add documentation to**:
1. All custom hooks (purpose, params, return value, examples)
2. All store actions (what they do, side effects)
3. All utility functions (input/output, edge cases)
4. All complex components (props interface with descriptions)

```typescript
/**
 * Hook to manage drawing explorer tree state
 * 
 * @param regions - Map region data from backend
 * @param layers - Drawing layers configuration
 * @param groups - Feature groups (folders)
 * @param features - Individual features
 * @returns Object with expanded state, toggle handler, auto-expand effect
 * 
 * @example
 * const { expanded, toggleNode } = useDrawingExplorer(regions, layers, groups, features);
 */
function useDrawingExplorer(
  regions: Record<string, Region>,
  layers: Record<string, Layer>,
  groups: Record<string, FeatureGroup>,
  features: Record<string, Feature>
) { ... }
```

#### Task 5.3: Improve Test Coverage
**Current gaps**: Need more tests for critical paths

**Add tests for**:
1. Store selectors (memoization correctness)
2. Custom hooks (logic without UI)
3. Utility functions (pure functions)
4. Backend commands (input validation, error cases)
5. Complex event flows (undo/redo, sync)

```typescript
// Example: Test memoized selectors
describe('selectFeatureById', () => {
  it('returns same reference when feature unchanged', () => {
    const state1 = createMockState({ feature1: { id: 'feature1', name: 'Test' } });
    const state2 = createMockState({ feature1: { id: 'feature1', name: 'Test' } });
    
    const result1 = selectFeatureById(state1, 'feature1');
    const result2 = selectFeatureById(state2, 'feature1');
    
    expect(result1).toBe(result2); // Referential equality
  });
});
```

#### Task 5.4: Create Architecture Decision Records (ADRs)
**Document key decisions**:
1. Why Zustand over Redux/Context?
2. Why slice-based store architecture?
3. Why event-sourcing for design state?
4. Why SQLite + RocksDB combination?
5. Why feature flags for AI modules?

**Format**:
```markdown
# ADR-001: State Management with Zustand

## Status
Accepted

## Context
We need a state management solution that is lightweight, performant, and easy to test.

## Decision
Use Zustand with slice pattern for better organization.

## Consequences
- Pro: Less boilerplate than Redux
- Pro: Better TypeScript integration
- Con: No devtools out of the box (need middleware)
```

**Exit Criteria Phase 5**:
- ✅ All public APIs have documentation
- ✅ Test coverage >70% for business logic
- ✅ Architecture decisions documented
- ✅ Onboarding guide updated

---

### PHASE 6: Optional Optimizations (Time Permitting)
**Mục tiêu**: Squeeze thêm performance cho edge cases

#### Task 6.1: Implement Virtual Scrolling for Large Lists
**Current**: DrawingExplorer uses `react-virtuoso` but may not be optimal

**Optimize**:
1. Ensure proper `estimatedItemSize`
2. Implement `itemContent` memoization
3. Add overscan configuration

#### Task 6.2: Web Worker for Heavy Computations
**Move to workers**:
1. Geometry calculations (point-in-polygon, intersections)
2. Large JSON parsing
3. Search indexing
4. Metadata normalization

#### Task 6.3: Code Splitting & Lazy Loading
**Already done**: Analysis, Print windows use `React.lazy`

**Add more**:
1. Admin panel (lazy load)
2. Contract analysis (lazy load)
3. Import dialogs (lazy load)
4. Map layers (conditional load based on zoom)

#### Task 6.4: Database Query Optimization
**Backend optimizations**:
1. Add missing indexes on frequently queried columns
2. Use prepared statements with caching
3. Implement query result caching (TTL-based)
4. Optimize WAL checkpoint frequency

**Exit Criteria Phase 6**:
- ✅ Profile-guided optimizations applied
- ✅ Lighthouse score >90 on all metrics
- ✅ Memory usage <500MB for typical workflows

---

## 📊 THỨ TỰ ƯU TIÊN THỰC THI

### Sprint 1 (Week 1): Clean Build + Quick Wins
- [ ] Phase 1: Fix all warnings (Task 1.1, 1.2, 1.3)
- [x] **Result**: 100% clean build gates

### Sprint 2 (Week 2): Decompose Large Files
- [ ] Phase 2: Split 5 largest components (Task 2.1-2.5)
- [x] **Result**: No file >500 lines

### Sprint 3 (Week 3-4): Store Architecture
- [ ] Phase 3: Consolidate useDesignSync (Task 3.1-3.4)
- [x] **Result**: Clear, predictable store architecture

### Sprint 4 (Week 4-5): Performance & Flow
- [ ] Phase 4: Optimize logic flow (Task 4.1-4.5)
- [x] **Result**: 30% faster renders, 50% fewer IPC calls

### Sprint 5 (Week 5-6): Quality & Docs
- [ ] Phase 5: Code quality improvements (Task 5.1-5.4)
- [x] **Result**: Well-documented, well-tested codebase

### Sprint 6 (Week 6+): Optional Polish
- [ ] Phase 6: Advanced optimizations (Task 6.1-6.4)
- [x] **Result**: Production-grade performance

---

## ✅ DEFINITION OF DONE

### Build Gates (Must Pass After Each Phase)
```bash
# Frontend
npm run build                    # 0 errors, 0 warnings
npm run test                     # 100% pass
npm run test -- --coverage      # >70% coverage (Phase 5+)

# Backend
cargo check                      # 0 errors
cargo clippy                     # 0 warnings
cargo test                       # 100% pass

# Integration
npm run tauri build              # Successful production build
```

### Manual Smoke Checklist (After Each Phase)
- [ ] App launches successfully
- [ ] Auth flow works
- [ ] Create/open project works
- [ ] DESIGN tab loads with map
- [ ] Add/edit/delete features work
- [ ] Undo/redo works
- [ ] Import/export flows work
- [ ] Analysis window works
- [ ] Print window works
- [ ] Street View works
- [ ] PMP open-by-association works

### Code Quality Metrics
- [ ] 0 TypeScript warnings
- [ ] 0 Rust clippy warnings
- [ ] 0 files >500 lines
- [ ] 0 functions >50 lines (except tests)
- [ ] 0 functions with >7 parameters
- [ ] 100% of unsafe code documented
- [ ] >70% test coverage (business logic)
- [ ] All public APIs documented

---

## ⚠️ RISK REGISTER

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Refactor breaks existing functionality | High | Medium | Comprehensive test suite + manual smoke test after each task |
| Performance regression | Medium | Low | Profile before/after each optimization |
| Scope creep | Medium | High | Strict adherence to phases, defer nice-to-haves |
| Merge conflicts | Low | High | Small, frequent PRs; sequential merge |
| Team members disagree on approach | Low | Medium | Document decisions in ADRs, get buy-in early |
| Third-party dependency breaks | Low | Low | Pin versions, test upgrades in isolation |

---

## 📈 SUCCESS METRICS

The refactor is successful when:

### Quantitative
- ✅ Build warnings: 44 → **0**
- ✅ Largest file: 772 lines → **<500 lines**
- ✅ Functions with >7 params: 3 → **0**
- ✅ Test coverage: current → **>70%**
- ✅ Render time: baseline → **-30%**
- ✅ IPC calls per workflow: baseline → **-50%**
- ✅ Re-renders per interaction: baseline → **-40%**

### Qualitative
- ✅ New developer can understand architecture in <1 day
- ✅ Adding new feature requires touching <3 files
- ✅ Bug triage time reduced by 50%
- ✅ Code review time reduced by 30%

---

## 📚 TÀI LIỆU THAM KHẢO

### Internal Docs
- `REFRACTOR_PLAN.md` - Previous refactor plan (completed phases)
- `AUDIT_REPORT.md` - Security and quality audit
- `docs/CORE_APP_CODE_WALKTHROUGH.md` - Architecture walkthrough
- `SPEC_AI_OPTIMIZATION.md` - AI optimization spec

### External Resources
- [Zustand Best Practices](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Rust Clippy Lints](https://rust-lang.github.io/rust-clippy/master/)
- [Tauri v2 Documentation](https://v2.tauri.app/)

---

## 🎯 NEXT STEPS

1. **Review plan with team** - Get buy-in on priorities and approach
2. **Start Phase 1** - Quick wins, low risk, immediate value
3. **Set up CI/CD gates** - Enforce clean builds going forward
4. **Track progress** - Update this doc after each phase completion
5. **Iterate** - Adjust plan based on learnings

**Estimated total time**: 4-6 weeks (1-2 hours/day)  
**Risk level**: Low (incremental, tested approach)  
**Expected ROI**: High (maintainability, performance, developer experience)

---

**Created by**: AI Code Audit  
**Date**: 2026-04-11  
**Version**: 1.0  
**Status**: Ready for Review
