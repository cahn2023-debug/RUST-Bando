# 🏛️ Kế hoạch Kiến trúc Refactor Toàn bộ Dự án (Plan: refactor-entire-project)

> **Mục tiêu**: Tái cấu trúc kiến trúc & mô-đun hóa dự án `project-manager`, phân tách rõ ràng giữa `Core`, `Shared` và `Modules`, chuẩn hóa các Zustand Stores theo đúng mô hình phân tầng, và đảm bảo an toàn tuyệt đối bằng kiểm thử tự động.

---

## 🎯 1. Goal & Scope (Mục tiêu & Phạm vi)

### Mục tiêu chính
1. **Phân tầng Kiến trúc (Architectural Layering)**:
   - `src/core/`: Lưu trữ các thành phần dùng chung toàn ứng dụng (Global Stores, Core Types, Core Providers, Network/Event Bus).
   - `src/shared/`: Lưu trữ các Utilities, UI Components tái sử dụng (Design System Primitives), Helpers.
   - `src/modules/`: Phân ranh giới rõ ràng theo Domain (`design`, `implement`, `analytics`, `contract`, `tool`, `i18n`, `home`). Mỗi module chỉ chứa UI, Local Stores, Hooks và Features thuộc nghiệp vụ của nó.
2. **Tái cấu trúc Zustand Stores**:
   - Di chuyển các Store toàn cục (`useAuthStore`, `useSettingsStore`, `themeStore`, `useLayoutStore`) về `src/core/stores/`.
   - Giữ các Store theo nghiệp vụ riêng (`useMapStore` slices, `useFeatureStore`, `useLayerStore`, `useTabStore`) ở `src/modules/[module]/stores/`.
   - Chuẩn hóa Selectors với `useShallow` và loại bỏ trùng lặp state.
3. **Loại bỏ Nợ Kỹ thuật (Technical Debt Cleanup)**:
   - Dọn dẹp imports lòng vòng (circular dependencies).
   - Chuẩn hóa Type Safety (loại bỏ `any` không cần thiết).

---

## 🚧 2. Component Boundaries & File Mapping

### A. Core Layer (`src/core/`)
- `src/core/stores/useAuthStore.ts` (Di chuyển từ `src/modules/implement/stores/useAuthStore.ts`)
- `src/core/stores/useSettingsStore.ts` (Di chuyển từ `src/modules/implement/stores/useSettingsStore.ts`)
- `src/core/stores/useLayoutStore.ts` (Di chuyển từ `src/modules/implement/stores/useLayoutStore.ts`)
- `src/core/stores/themeStore.ts` (Di chuyển từ `src/modules/design/stores/themeStore.ts`)

### B. Modules Layer (`src/modules/`)
- `src/modules/design/`: Quản lý nghiệp vụ Bản đồ, Bản vẽ, GIS & Design Tools.
- `src/modules/implement/`: Quản lý Khối lượng, Bảng Biểu, Dự án & Thi công.
- `src/modules/analytics/`, `src/modules/contract/`, `src/modules/tool/`: Các mô-đun chức năng phụ trợ.

---

## 📋 3. Implementation Steps (Terra Lane)

1. **Bước 1: Chuẩn bị & Chạy Test Baseline**:
   - Chạy `npm run typecheck` và `npm run test:ci` để đảm bảo codebase hiện tại hoàn toàn sạch lỗi trước khi refactor.
2. **Bước 2: Di chuyển & Quy hoạch Global Stores về `src/core/stores`**:
   - Di chuyển các file Store toàn cục về `src/core/stores/`.
   - Cập nhật tất cả các đường dẫn `import` tương ứng trong toàn bộ codebase.
   - Chạy `npm run typecheck` để xác nhận không vỡ import.
3. **Bước 3: Tối ưu & Chuẩn hóa Domain Stores tại `src/modules/`**:
   - Tối ưu các Zustand slices trong `src/modules/design/features/map/stores/`.
   - Đảm bảo các component sử dụng `useShallow` từ Zustand để tránh re-render thừa.
4. **Bước 4: Chuẩn hóa Export Barrel Index & File Imports**:
   - Cập nhật các file `index.ts` barrel export ở `src/core`, `src/shared`, `src/modules`.
5. **Bước 5: Chạy Kiểm thử & Khắc phục Sai lệch**:
   - Chạy `npm run typecheck`, `npm run lint`, `npm run test:ci`.

---

## 🧪 4. Verification Plan (Fresh Sol Reviewer)

- **Type Safety**: `npm run typecheck` (tsc --noEmit) phải kết thúc với 0 lỗi.
- **Linter**: `npm run lint` phải sạch lỗi syntax/types.
- **Unit & Integration Tests**: `npm run test:ci` (Vitest) phải PASS 100%.

---

## ✅ 5. Acceptance Criteria

- [ ] Cấu trúc folder tuân thủ phân tầng `Core / Shared / Modules`.
- [ ] 100% Global Stores nằm ở `src/core/stores/`.
- [ ] 0 lỗi TypeScript build (`npm run typecheck`).
- [ ] Tất cả Vitest test suite đều PASS (`npm run test:ci`).
- [ ] Trạng thái sẵn sàng cho lệnh `[SHIP]`.
