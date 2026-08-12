---
id: g8ckf8
title: 'Fix: Independent Google Street and Hybrid sublayer toggles'
status: done
priority: high
labels:
  - bugfix
  - basemap-preview
  - google-layers
  - runtime
createdAt: '2026-08-12T15:02:39.162Z'
updatedAt: '2026-08-12T15:12:45.317Z'
completedAt: '2026-08-12T15:12:35.404Z'
timeSpent: 0
assignee: '@me'
spec: specs/2026-08-12/separate-basemap-layers
fulfills:
  - FR-2
  - FR-3
  - FR-5
---
# Fix: Independent Google Street and Hybrid sublayer toggles

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Google Street Nhãn/POI checkbox không thay đổi do apistyle selectors sai. Google Hybrid dùng một tile composite nên tắt Đường ẩn cả nền. Sửa rule và tách Hybrid satellite base khỏi transparent information overlay, giữ nền luôn hiển thị.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Google Street: tắt Đường ẩn đường nhưng giữ nền; tắt Nhãn ẩn nhãn; tắt POI ẩn POI, các nhóm khác không đổi.
- [x] #2 Google Hybrid: nền vệ tinh vẫn hiển thị khi tắt Đường, Nhãn, POI; overlay thông tin được cập nhật độc lập.
- [x] #3 Thay đổi checkbox không khởi tạo lại MapLibre map, không reload toàn bộ bản đồ và không làm mất viewport.
- [x] #4 Test, typecheck, build và smoke verification của basemap preview đều pass.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
🐛 Debug classification: runtime/integration bug ở Google raster layer visibility. Root cause: Google Street/Hybrid trước đây dùng raster composite; selector apistyle cũ cho Nhãn/POI không đúng, còn Hybrid `lyrs=y` gộp nền vệ tinh với overlay nên ẩn Đường làm mất cả nền. Fix: dùng selector Street đúng (`s.t:3|s.e:g`, `s.e:l`, `s.t:2|s.e:l`/`s.e:l.i`), tách Hybrid thành source nền `lyrs=s` và overlay `lyrs=h`, giữ source nền visible và chỉ cập nhật overlay theo checkbox. MapCanvas giữ instance MapLibre trong ref, cập nhật visibility/source tiles tại chỗ nên không restart map hoặc reset viewport. Verification: `npm run test` (11 files/43 tests), `npm run typecheck`, `npm run build`, `npm run verify` đều pass. Related spec: specs/2026-08-12/separate-basemap-layers; fulfills FR-2, FR-3, FR-5.
<!-- SECTION:NOTES:END -->

