---
id: if0p6x
title: "[map-features-01] Sửa lỗi hiển thị feature trên bản đồ"
status: done
priority: medium
labels:
  - normal
  - map
  - bug
createdAt: '2026-08-08T17:32:30.465Z'
updatedAt: '2026-08-09T01:29:00.401Z'
completedAt: '2026-08-09T01:29:00.401Z'
timeSpent: 1266
assignee: '@me'
---
# [map-features-01] Sửa lỗi hiển thị feature trên bản đồ

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Điều tra và sửa lỗi khiến các feature không hiển thị đúng trên bản đồ; xác định đường đi dữ liệu/rendering, bổ sung kiểm thử hồi quy phù hợp và xác minh bằng các lệnh kiểm tra của dự án.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Large-project FeatureCreated/FeatureUpdated increments viewportQueryRevision and triggers queryVisibleFeaturesV2.
- [x] #2 Feature visibility remains viewport-bounded; non-large and moveend behavior are preserved.
- [x] #3 Regression coverage verifies state and renderer event-driven refresh without query loops.
- [x] #4 Frontend quality gate passes: encoding, boundaries, typecheck, lint, tests, and build.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Bổ sung regression coverage cho luồng large-project trong `src/modules/design/features/map/stores/mapStateSlice.bug-exploration.test.ts` và `mapStateSlice.preservation.test.ts`: FeatureCreated/FeatureUpdated phải yêu cầu refresh viewport; feature ngoài viewport không được bị inject vào `visibleFeatures`; non-large project và moveend giữ nguyên hành vi. Bao phủ feature điểm/đường/vùng và camera/FOV/DORI theo bug spec `.kiro/specs/map-object-display-delay/bugfix.md`.
2. Tách tín hiệu “cần query viewport” khỏi `viewportRevision` dùng cho dữ liệu/render bằng một revision/action chuyên dụng trong store (`types.ts`, `mapCameraSubSlice.ts`, `initializationSlice.ts`). `applyPatchToState()` chỉ tăng tín hiệu này cho FeatureCreated/FeatureUpdated trên large project; giữ nguyên throttle và các semantics hiện có của `viewportRevision`.
3. Cập nhật `MapLibreFastRenderer.tsx` để lắng nghe tín hiệu refresh mới và gọi `queryVisibleFeaturesV2` ngay sau event, đồng thời loại bỏ cơ chế inject đại trà `newLargeProjectFeatures`. Giữ đồng bộ cache cho feature đang hiển thị và bảo đảm kết quả query cập nhật render feature, FOV và DORI mà không tạo vòng lặp query khi `setViewportFeatures()` hoàn tất.
4. Chạy test store/map liên quan, thêm hoặc cập nhật test renderer cho event-driven viewport query, sau đó chạy quality gate frontend theo `@doc/guides/development` (`npm run check:frontend` nếu môi trường đủ dependency).

### Plan check
- AC coverage: bug spec 1.1–1.5 và 2.1–2.5 được phủ bởi bước 1–3; regression 3.1–3.8 được phủ bởi bước 1 và 4.
- Scope: 4 file production ở bước 2, 1 file renderer ở bước 3, và các file test liên quan; tổng scope bounded cho một task.
- Risk: thay đổi state contract dùng chung giữa store và renderer; cần cập nhật toàn bộ test fixture/type liên quan. Không thêm dependency ngoài.
- Assumption: symptom người dùng đề cập là delay Feature/FOV/DORI trên large project theo `.kiro/specs/map-object-display-delay/bugfix.md`; chưa có repro UI cụ thể khác.
- Baseline: các test store/map hiện có đã chạy pass (35 tests ở bug/adapter và 27 tests ở thư mục stores).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: Added viewportQueryRevision to the store contract and lifecycle resets; large-project feature create/update paths now request viewport refresh through that signal across applied, queued-ack, and optimistic event flows. Removed direct new-feature injection into visibleFeatures so viewport query remains authoritative. MapLibreFastRenderer now subscribes to viewportQueryRevision; added renderer and preservation regression coverage. System Decision Impact: candidate @decision/20260809-0828-t-ch-t-n-hi-u-query-viewport-kh-i-revision-d-li-u-b-n (added) — durable state/query separation; draft remains in Review Inbox because the .kiro source is not a Knowns document.
Verification: check:encoding and check:boundaries passed; npm run check:frontend passed end-to-end (typecheck, lint with existing warnings only, 590 tests, coverage, build). Knowns task validation passed with 0 errors/warnings.
<!-- SECTION:NOTES:END -->

