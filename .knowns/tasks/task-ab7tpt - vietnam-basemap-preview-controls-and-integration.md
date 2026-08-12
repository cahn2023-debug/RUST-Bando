---
id: ab7tpt
title: "[vietnam-basemap-preview-controls-and-integration-04] Pegman Street View window and continuous synchronization"
status: done
priority: high
labels:
  - from-spec
  - spec:vietnam-basemap-preview-controls-and-integration
  - spec-date:2026-08-12
createdAt: '2026-08-12T04:44:26.054Z'
updatedAt: '2026-08-12T16:16:57.564Z'
completedAt: '2026-08-12T16:16:57.564Z'
timeSpent: 1173
assignee: '@me'
spec: specs/2026-08-12/vietnam-basemap-preview-controls-and-integration
fulfills:
  - AC-13
  - AC-14
  - AC-15
order: 40
---
# [vietnam-basemap-preview-controls-and-integration-04] Pegman Street View window and continuous synchronization

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mở Pegman bằng cửa sổ desktop riêng dùng Google Street View public, chỉ khi có điểm chọn, và đồng bộ liên tục vị trí, heading, pitch/FOV về bản đồ chính.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pegman guard and selected map point flow.
- [x] #2 Separate Street View window opens with current viewpoint.
- [x] #3 Continuous location/heading/pitch/FOV event sync updates main map marker.
- [x] #4 Window close/disconnect errors are diagnostic and isolated.
- [x] #5 Lifecycle/event tests cover sync.
- [x] #6 Clicking the map keeps the selected coordinate for Street View without rendering a selected-point or Pegman marker on the map.
- [x] #7 Clicking Pegman opens or reuses the Street View window in Tauri; if window creation fails, a visible diagnostic status is shown.
- [x] #8 After selecting a point or receiving a Street View update, the main map displays the Pegman icon and a heading/FOV viewing-direction overlay; the plain selected-point marker remains absent.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan
1. Thêm typed Street View state/URL/message utilities và bridge cho Tauri global events, browser postMessage, mở/reuse/đóng cửa sổ riêng; phân loại lỗi lifecycle và giữ public embed không cần API key.
2. Thêm route Street View riêng vào standalone preview, khởi tạo từ điểm/góc nhìn hiện tại, phát liên tục position/heading/pitch/FOV khi panorama hoặc các điều khiển fallback thay đổi, và báo trạng thái ready/error/closed.
3. Mở rộng MapCanvas controller để cập nhật marker Pegman theo vị trí, hướng nhìn và FOV; giữ marker/viewport chính ổn định khi Street View lỗi hoặc đóng.
4. Nối nút Pegman ở toolbar góc phải, guard chưa chọn điểm, truyền viewpoint hiện tại và nhận event đồng bộ về bản đồ chính.
5. Bổ sung unit/lifecycle bridge tests, chạy typecheck/Vitest/Cargo/build/git diff check, review và validate task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: separate Tauri/browser Street View window with Pegman guard, initial viewpoint, normalized lifecycle bridge, continuous position/heading/pitch/FOV synchronization when Google Maps JS API is configured, public embed fallback diagnostics, close/disconnect handling, map Pegman marker and direction/FOV updates. Review: PASS — no P1/P2 findings. Artifact verification: route, bridge, controller marker, capability allow-list and tests are substantive and wired. Verification passed: npm exec -- tsc -p tsconfig.json --noEmit; npx vitest run --config vitest.config.ts (7 files, 21 tests); npm run build; cargo fmt --manifest-path Cargo.toml -- --check; cargo check --manifest-path Cargo.toml; cargo test --manifest-path Cargo.toml (5/5); git diff --check. Build has only the existing large MapLibre chunk warning. System Decision Impact: none — this completes the approved standalone preview interaction without changing production Basemap Platform guidance or contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
Knowns metadata repair: Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

System Decision Impact: none — no durable guidance or production contract changed.
Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.

Spec Decision Compliance: D20=pass

Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
Reopened: user reports Pegman window does not open; selected-point marker should be removed from the map.
Implemented bug fix: removed selected-point and synchronized Pegman markers from MapCanvas while preserving selected coordinates in React state; granted Tauri webview/window permissions required by WebviewWindow.getByLabel/new/show/setFocus; rendered visible Street View lifecycle/open errors. Verification: npm run typecheck; npm test (11 files, 43 tests); npm run build; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo check --manifest-path src-tauri/Cargo.toml; code-reviewer cargo check/clippy (0 findings). System Decision Impact: none — this is a bug fix within the approved preview interaction and does not change durable platform guidance or production contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass
Completed reopened fix. The map now remains marker-free for point selection and Street View synchronization; selectedPoint is retained in React state so Pegman can still open from the selected coordinate. The Tauri capability allow-list now covers window enumeration, dynamic webview creation, show, and focus. Open/create errors are visible in the map UI.
Reopened: user reports the Pegman icon and viewing-direction/FOV are not visible on the main map; restore only the Pegman viewpoint marker, keep the selected-point marker removed.
Completed visual restoration: reintroduced a synchronized MapLibre Pegman marker with SVG icon and CSS FOV sector; selection initializes the marker at the clicked coordinate, and Street View ready/state events update its position, heading and FOV continuously. The plain selected-point marker remains removed. Verification: npm run typecheck; npm test (11 files, 43 tests); npm run build; cargo fmt --manifest-path src-tauri/Cargo.toml -- --check; cargo check --manifest-path src-tauri/Cargo.toml; cargo test --manifest-path src-tauri/Cargo.toml (7/7); code-reviewer cargo check/clippy (0 findings); Known validation passed. System Decision Impact: none — this restores approved UI behavior without changing durable guidance or production contracts. Spec Decision Compliance: D1=pass, D2=pass, D3=pass, D4=pass, D5=pass, D6=pass, D7=pass, D8=pass, D9=pass, D10=pass, D11=pass, D12=pass, D13=pass, D14=pass, D15=pass, D16=pass, D17=pass, D18=pass, D19=pass, D20=pass.
<!-- SECTION:NOTES:END -->

