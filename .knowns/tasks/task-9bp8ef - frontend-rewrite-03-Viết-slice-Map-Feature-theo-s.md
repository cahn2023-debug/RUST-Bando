---
id: 9bp8ef
title: "[frontend-rewrite-03] Viết slice Map/Feature theo spatial schema"
status: done
priority: high
labels:
  - frontend
  - rewrite
  - map
  - gis
  - performance
createdAt: '2026-08-09T04:16:19.201Z'
updatedAt: '2026-08-09T06:22:15.593Z'
completedAt: '2026-08-09T06:22:15.593Z'
timeSpent: 1904
assignee: '@me'
parent: 7qmhzr
order: 20
---
# [frontend-rewrite-03] Viết slice Map/Feature theo spatial schema

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dựng Region → Layer → Feature Group → Feature, viewport query, selection/property editing và MapLibre renderer; bảo đảm progressive loading, viewport-first, first-feature < 2000ms và frame < 16ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Một icon type, màu và kích thước được normalize nhất quán ở UI preview, SVG string và MapLibre GeoJSON.
- [x] #2 Marker camera/intersection hiển thị đúng kích thước pixel đã chỉnh, không còn nhân ngầm theo loại icon.
- [x] #3 Thay đổi icon/màu/kích thước trong PropertyPanel cập nhật preview map trước khi Save.
- [x] #4 Save ghi lại metadata canonical và properties mirror; mở lại feature vẫn nhận đúng icon/màu/kích thước.
- [x] #5 SVG bất kỳ type/size/color không hợp lệ không làm vỡ renderer hoặc chèn thuộc tính SVG ngoài ý muốn.
- [x] #6 Test liên quan và quality gate frontend pass; không mở rộng sang backend schema hoặc dirty changes ngoài phạm vi.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

1. Tạo một style contract dùng chung cho feature symbol: canonical icon type (IconType), màu an toàn có fallback cố định, và giới hạn/kích thước point-line dùng chung giữa PropertyPanel, map adapter và SVG renderer.
2. Hợp nhất nguồn SVG camera/map: giữ MapIcons.tsx là nguồn render duy nhất, hỗ trợ đầy đủ intersection và escape thuộc tính/text; chuyển CameraIcons.tsx thành compatibility re-export để không còn hai implementation khác nhau.
3. Cập nhật pipeline MapLibre (mapLibreFastAdapter.ts, mapImageService.ts) dùng style contract, truyền đúng màu/icon/size đã chuẩn hóa, và coi size đã lưu là kích thước hiển thị cuối cùng; preview thay đổi phải cập nhật iconImageId/GeoJSON ngay.
4. Cập nhật PropertyPanel.tsx dùng cùng giới hạn/chuẩn icon-màu-kích thước; khi Save, ghi metadata canonical cùng alias tương thích vào metadata và properties, sau đó xóa preview draft.
5. Bổ sung regression tests cho SVG/type/color/size, camera/intersection preview giữ đúng kích thước nhập vào, preview size/icon/color, và payload Save giữ các giá trị đã chỉnh sửa.
6. Chạy targeted tests, typecheck/lint liên quan và frontend quality gate phù hợp; validate task/refs và review diff trước khi hoàn tất.

### Acceptance Criteria

- [ ] Một icon type, màu và kích thước được normalize nhất quán ở UI preview, SVG string và MapLibre GeoJSON.
- [ ] Marker camera/intersection hiển thị đúng kích thước pixel đã chỉnh, không còn nhân ngầm theo loại icon.
- [ ] Thay đổi icon/màu/kích thước trong PropertyPanel cập nhật preview map trước khi Save.
- [ ] Save ghi lại metadata canonical và properties mirror; mở lại feature vẫn nhận đúng icon/màu/kích thước.
- [ ] SVG bất kỳ type/size/color không hợp lệ không làm vỡ renderer hoặc chèn thuộc tính SVG ngoài ý muốn.
- [ ] Test liên quan và quality gate frontend pass; không mở rộng sang backend schema hoặc các dirty changes ngoài phạm vi.

### Plan check

- AC coverage: AC1→1–3; AC2→3; AC3→3–4; AC4→4–5; AC5→1–2–5; AC6→6.
- Scope: 4–5 file production thuộc icon/style/map/property và 3–4 file test; không thêm dependency.
- Risk: MapLibre icon cache key thay đổi theo canonical size/color; cần test icon id và render collection. Existing dirty worktree is preserved.
- Assumption: size là pixel marker cuối cùng trên map; metadata aliases giữ để backward compatibility.
- Fallback: Knowns code LSP không khả dụng (code index 0/C# backend missing), nên structural discovery dùng CodeGraph rồi xác nhận on-disk bằng shell; không ảnh hưởng plan.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: PASS — manual 4-perspective review (quality, architecture, security, completeness) found 0 P1 and 0 P2 findings; the delegated reviewer was closed after timing out without a verdict. The only test failure encountered was an unrelated flaky performance threshold and passed on isolated rerun/full-gate rerun.
Spec Decision Compliance: no linked spec Locked Decisions; all six task acceptance criteria were verified.
System Decision Impact: candidate @decision/20260809-1318-canonical-feature-symbol-contract-for-icon-type-color-and-pixel-size (added) — shared icon/color/size normalization and persisted pixel-size contract.
Verification: targeted 6 files/87 tests passed; npm run check:frontend passed (encoding, boundaries, typecheck, lint 0 errors/1137 warnings, 95 files/597 tests, build); git diff --check passed.
Extracted reusable knowledge to @doc/learnings/learning-map-feature-symbol-normalization and proposed project memory @memory/9e4nt0. The canonical guidance remains the non-current draft @decision/20260809-1318-canonical-feature-symbol-contract-for-icon-type-color-and-pixel-size.
Reopened via explicit /kn-implement request. Existing implementation plan and all ACs were already complete; performing implementation preflight and verification only, with no new scope.
Implement recheck complete: existing implementation remains unchanged and all six ACs were already satisfied; no new scope or files added during this explicit kn-implement invocation. Verification: targeted map/icon suite 6 files/87 tests passed, npm run typecheck passed, git diff --check passed, and the prior full npm run check:frontend gate remains green. Existing System Decision Impact candidate and extracted learning remain linked.
<!-- SECTION:NOTES:END -->

