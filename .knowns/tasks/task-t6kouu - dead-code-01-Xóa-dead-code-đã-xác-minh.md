---
id: t6kouu
title: "[dead-code-01] Xóa dead code đã xác minh"
status: done
priority: medium
labels:
  - tiny
  - dead-code
  - cleanup
createdAt: '2026-08-09T01:39:43.495Z'
updatedAt: '2026-08-09T01:57:55.998Z'
completedAt: '2026-08-09T01:57:55.998Z'
timeSpent: 534
assignee: '@me'
---
# [dead-code-01] Xóa dead code đã xác minh

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Xác minh và loại bỏ dead code cục bộ trong frontend/backend bằng static analysis và tham chiếu mã; ưu tiên các biến/tham số không dùng và module deprecated không còn importer. Không đụng vào thay đổi dở dang hiện có nếu chưa được xác minh rõ.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Không còn cảnh báo no-unused-vars trong 9 file thuộc phạm vi; không chạm mapStateSlice.ts, ContractAnalysisView.tsx hoặc module deprecated chưa được xác minh.
- [x] #2 Giữ nguyên hành vi xử lý lỗi và chỉ thay đổi binding không được đọc.
- [x] #3 ESLint, typecheck và test/frontend quality gate chạy đạt hoặc mọi lỗi pre-existing được ghi nhận rõ.
- [x] #4 Diff cuối chỉ chứa các thay đổi dead-code đã xác minh.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Chốt baseline và phạm vi từ kết quả npm run lint; chỉ xử lý binding bị @typescript-eslint/no-unused-vars xác nhận, giữ nguyên thay đổi dở dang của người dùng. Không xóa module deprecated firebase.ts/firestoreSync.ts trong task này vì test hiện vẫn mock chúng.
2. Batch core/service: bỏ binding catch không dùng trong src/core/basemap/tileCache.ts, src/core/stores/themeStore.ts, src/core/stores/useAuthStore.ts, src/modules/implement/services/exportService.ts, và src/modules/tool/utils/dataFlattening.ts; giữ nguyên hành vi xử lý lỗi.
3. Batch UI/map: bỏ binding catch không dùng trong src/modules/design/components/core/PropertyPanel.tsx, src/modules/design/components/ui/Ribbon.tsx, src/modules/design/components/ui/TitleBar.tsx, và src/modules/design/features/map/MapLayerComponents/MapLibreMeasurementTool.tsx.
4. Xác minh bằng ESLint, typecheck, test suite/frontend quality gate; kiểm tra diff để bảo đảm chỉ có thay đổi dead-code đã xác minh. Chạy cargo clippy read-only để xác nhận backend không phát hiện dead-code mới; không sửa Rust trong task này.

### Plan check
- AC coverage: lint warnings mục tiêu được xử lý ở bước 2–3; không ảnh hưởng hành vi được kiểm tra ở bước 4; scope/diff được kiểm tra ở bước 1 và 4.
- Scope: 2 batch độc lập, lần lượt 5 và 4 file; không thêm dependency, không chạm file dirty.
- Risk: thấp; chỉ bỏ tên binding không được đọc trong các catch, không đổi control flow.
- Assumption: “dead code” trong task này nghĩa là binding cục bộ đã được static analysis chứng minh không dùng. Unused export/file hoặc module deprecated cần inventory và quyết định riêng.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: removed 12 unused catch bindings across 9 planned frontend files; preserved catch bindings that are read and left dirty map files, deprecated modules, and Rust untouched. Verification: npm run check:frontend passed (encoding, boundaries, typecheck, lint, 590 tests/coverage, build); final typecheck passed; targeted ESLint passed with 0 errors and 0 no-unused-vars in scope; cargo clippy --workspace --all-targets -- -D warnings passed; git diff contains only the planned 9 files. Existing style/build warnings remain. System Decision Impact: none — this is a local cleanup with no durable project guidance change.
<!-- SECTION:NOTES:END -->

