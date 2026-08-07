# PLAN: Refactor Code Quality, Clean Code & Domain-Driven Modularization

> **Mục tiêu**: Nâng cao chất lượng code toàn diện cho dự án Project Manager (Frontend React/TS & Backend Rust), đạt 100% test pass rate, loại bỏ 50 ESLint errors, dọn dẹp dead code trong `src/` & `src-tauri/src/` và chuẩn hóa kiến trúc Domain-Driven Modular.

---

## 1. Định hướng & Nguyên tắc chỉ đạo (Theo Thỏa thuận /grill-me)

- **Chiến lược chính**: Code Quality, Clean Code & Quality Assurance.
- **Thứ tự thực hiện (Phased Execution)**:
  1. **Phase 1: Triage & Fix Tests / Lints**:
     - Khắc phục 1 Vitest bị lỗi (`src/modules/implement/hooks/useProjectManager.test.tsx`).
     - Rà soát và sửa triệt để 50 ESLint errors (kết hợp `eslint --fix` và sửa thủ công các lỗi type-checking/nullish coalescing).
  2. **Phase 2: Dọn dẹp Dead Code**:
     - Loại bỏ các unused imports, dead functions, variables không dùng trong `src/` và `src-tauri/src/`.
     - **Lưu ý**: Giữ nguyên thư mục sao lưu `BAK/` và `src-tauri/BAK` theo đúng chỉ thị người dùng.
  3. **Phase 3: Domain-Driven Modular Refactoring & Deduplication**:
     - Phân tách và chuẩn hóa ranh giới giữa `src/core/` (core basemap, tile cache, telemetry), `src/shared/` (shared UI/types/hooks), và các domain modules (`src/modules/design`, `src/modules/implement`, `src/modules/analytics`, `src/modules/contract`, `src/modules/tool`).
     - Gom nhóm và tái sử dụng các logic bị trùng lặp (DRY).

---

## 2. Kế hoạch Thực thi Chi tiết

### Phase 1: Test & Lint Fixes
- **Sửa Test**: Phân tích mock `open_project_bootstrap` vs `get_active_project` / `get_recent_projects` trong `useProjectManager.test.tsx` line 148 để test phản ánh đúng flow bootstrap thực tế của hook.
- **Sửa ESLint Errors**:
  - Chạy `npm run lint:fix` để tự động sửa các lỗi định dạng và warning đơn giản.
  - Sửa thủ công 50 ESLint errors (bao gồm `@typescript-eslint/prefer-nullish-coalescing`, non-null assertions, v.v.).
- **Xác nhận**: `npx vitest run` -> PASS 100% (553/553 tests). `npm run lint` -> 0 errors.

### Phase 2: Dead Code Clean Up
- Quét các unused exports, dead code bằng ESLint / TypeScript rules trong `src/` và `src-tauri/src/`.
- Loại bỏ dead functions, unreachable code blocks.
- **Không đụng tới**: Thư mục `BAK/`.

### Phase 3: Domain-Driven Modular Refactoring
- Tái cấu trúc helper functions dùng chung trong các modules về đúng phạm vi `src/core/` hoặc `src/shared/`.
- Loại bỏ trùng lặp trong metadata parsing, feature normalization và IPC response handlers.

---

## 3. Kiểm thử & Nghiệm thu (Verification)
- `npm run typecheck`: Clean (0 errors).
- `npx vitest run`: Clean (553/553 tests passed).
- `npm run lint`: Clean (0 errors).
- `cargo check --manifest-path src-tauri/Cargo.toml`: Clean.
