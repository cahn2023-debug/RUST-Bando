# 🏛️ KẾ HOẠCH TÁI CẤU TRÚC TOÀN BỘ DỰ ÁN (PLAN-refactor-clean)

> **Mục tiêu**: Tái cấu trúc dự án `project-manager` theo kiến trúc Clean & Modular Architecture, loại bỏ sự chồng chéo giữa các modules, phân rã các Monolithic Stores/Components và chuẩn hóa đường dẫn import mà không làm vỡ các tính năng hiện có.

---

## 1. Goal & Scope (Mục tiêu & Phạm vi)

### Mục tiêu chính:
- **Tổ chức 3 Tầng Kiến Trúc**:
  - `src/core/`: Quản lý các dịch vụ toàn cục (Auth, Settings, Global Layout/Theme).
  - `src/shared/`: Quản lý Shared UI Primitives (`components/ui`), Shared GIS/Math/IPC Utils (`utils/`), và Custom Hooks (`hooks/`).
  - `src/modules/`: Quản lý các tính năng độc lập (`design`, `map`, `implement`, `reports`, `analytics`, `contract`, `home`).
- **Di chuyển & Gom cụm Utilities**: Di chuyển các file util GIS, Math, CSV, IPC từ `src/modules/tool/utils` về `src/shared/utils`.
- **Phân rã (Decompose) Monolithic Stores & UI**:
  - `mapStateSlice.ts` (~42KB) & `initializationSlice.ts` (~15KB) ➔ Tách thành các sub-slices chuyên biệt (Layers, Camera, Selection, UI).
  - `reportDialog.tsx` (~900 dòng) & `PrintDialog.tsx` (~560 dòng) ➔ Tách thành các Sub-components và Custom Hooks độc lập.
- **Đảm bảo An toàn (Regression-Averse)**: 100% test pass (`npm run test:ci`) và 0 lỗi TypeScript (`npm run typecheck`).

---

## 2. Component Boundaries & Directives

```
src/
├── core/                       # Core system & global state
│   ├── stores/                 # Auth, Layout, Theme, Settings stores
│   └── basemap/                # Global basemap configurations
├── shared/                     # Shared cross-module resources
│   ├── components/             # Reusable UI Primitives (Buttons, Dialogs, Icons)
│   ├── hooks/                  # Cross-cutting custom React hooks
│   └── utils/                  # Domain/GIS/Math/CSV/IPC utilities (di chuyển từ modules/tool)
├── modules/                    # Isolated Business Modules
│   ├── design/                 # Module Thiết kế & Bản đồ tương tác
│   │   ├── features/           # Feature sub-modules (map, print, reports)
│   │   ├── components/         # Design-specific UI components
│   │   └── hooks/              # Design-specific hooks
│   ├── implement/              # Module Thi công
│   ├── analytics/              # Module Phân tích
│   ├── contract/               # Module Hợp đồng
│   └── home/                   # Module Trang chủ
└── contracts/                  # IPC Schemas & Tauri APIs
```

---

## 3. Implementation Steps (Các pha thực thi)

### Phase 1: Chuẩn hóa & Di chuyển Utilities (`src/modules/tool/utils` ➔ `src/shared/utils`)
1. Di chuyển các file utils GIS/Math/IPC/CSV/Accessibility từ `src/modules/tool/utils/` sang `src/shared/utils/`.
2. Cập nhật các đường dẫn import trên toàn bộ codebase (`src/modules/design`, `src/modules/implement`, v.v.).
3. Chạy `npm run typecheck` & `npm run test:ci` xác nhận Phase 1 hoán đổi đường dẫn thành công.

### Phase 2: Phân rã Monolithic State Slices (`mapStateSlice.ts` & `initializationSlice.ts`)
1. Tách `mapStateSlice.ts` thành các sub-slices nhỏ gọn:
   - `mapLayersSubSlice.ts`: Quản lý danh sách layer và visibility.
   - `mapCameraSubSlice.ts`: Quản lý tọa độ, zoom và bounds.
   - `mapSelectionSubSlice.ts`: Quản lý đối tượng được chọn.
2. Tách `initializationSlice.ts` thành:
   - `mapBootSubSlice.ts`: Tải dữ liệu ban đầu và khởi tạo map instance.
3. Giữ nguyên facade giao diện store trong `src/modules/design/features/map/stores/index.ts` để không làm đứt gãy code consuming store.
4. Chạy `npm run test:ci` để đảm bảo các test `mapStateSlice.preservation.test.ts` & `initializationSlice.test.ts` đều PASS 100%.

### Phase 3: Phân rã Monolithic UI Components (`reportDialog.tsx` & `PrintDialog.tsx`)
1. Trong `src/modules/design/features/reports/word/`:
   - Tách `reportDialog.tsx` thành `ReportDialogHeader.tsx`, `ReportOptionsForm.tsx`, `ReportPreviewSection.tsx`, và custom hook `useReportDialogState.ts`.
2. Trong `src/modules/design/features/print/`:
   - Tách `PrintDialog.tsx` thành `PrintPageSetup.tsx`, `PrintExportControls.tsx`, và `usePrintExport.ts`.
3. Kiểm tra render và chạy `npm run typecheck`.

### Phase 4: Chuẩn hóa Shared UI & Cleanup
1. Tập trung các component UI cơ bản từ `src/modules/design/components/ui` về `src/shared/components/ui`.
2. Xóa các import thừa, loại bỏ file tạm/file rác nếu có.
3. Chạy toàn bộ quy trình kiểm thử độc lập (Fresh Sol Reviewer).

---

## 4. Verification Plan (Kế hoạch kiểm thử)

### Lệnh kiểm thử tự động:
- **TypeScript Type Check**: `npm run typecheck`
- **Vitest Unit Test & Coverage**: `npm run test:ci`
- **ESLint Code Quality**: `npm run lint`

### Các bài test trọng yếu cần pass 100%:
- `src/modules/design/features/map/stores/mapStateSlice.preservation.test.ts`
- `src/modules/design/features/map/stores/mapStateSlice.bug-exploration.test.ts`
- `src/modules/design/features/map/stores/initializationSlice.test.ts`

---

## 5. Acceptance Criteria (Tiêu chuẩn nghiệm thu)

- [ ] Phân tầng rõ ràng 3 lớp `src/core`, `src/shared`, `src/modules`.
- [ ] Mọi utility từ `src/modules/tool/utils` được chuyển về `src/shared/utils` và hoạt động ổn định.
- [ ] Monolithic slice `mapStateSlice.ts` được phân rã modular hóa.
- [ ] Components lớn (`reportDialog.tsx`, `PrintDialog.tsx`) được bóc tách gọn gàng.
- [ ] **`npm run typecheck`** trả về 0 lỗi.
- [ ] **`npm run test:ci`** trả về 100% tests PASS (`[SHIP]`).
