# Specification: Remove Canvas Search and Pegman

## Overview

Loại bỏ hoàn toàn tính năng Tìm kiếm (Canvas Search / MapSearchBar) và tính năng Xem toàn cảnh đường phố StreetView Pegman (`StreetViewControl`) trong màn hình Canvas của ứng dụng CAD Project Manager. Việc loại bỏ bao gồm gỡ bỏ các linh kiện giao diện, các file component liên quan, và dọn dẹp các đường dẫn import / export trong codebase.

## Locked Decisions

- **D1**: Xóa hoàn toàn `<StreetViewControl />` khỏi `MapLayer.tsx`, đồng thời xóa file `StreetViewControl.tsx` và `StreetViewPage.tsx` khỏi codebase.
- **D2**: Xóa thanh Search khỏi `CoordinatePanel.tsx` (và loại bỏ `CoordinatePanel` khỏi `CADCanvas.tsx` nếu không còn nội dung khác), xóa file `MapSearchBar.tsx`.
- **D3**: Dọn dẹp tất cả các import/export liên quan trong `apps/project-manager/src/modules/design/features/map/MapLayerComponents/index.ts` và `useMapSearch.ts` (nếu không còn nơi nào sử dụng).

## System Decision Impact

- Impact: none
- Decision: n/a
- Acceptance gate: Code compiles cleanly without missing export errors and no leftover Pegman or Canvas Search UI element appears in Canvas view.

## Requirements

### Functional Requirements

- **FR-1**: Không còn hiển thị nút Pegman (StreetViewControl) ở góc giao diện bản đồ Canvas.
- **FR-2**: Không còn hiển thị thanh Tìm kiếm (Search Bar) ở góc trên bên trái màn hình bản đồ Canvas.
- **FR-3**: Đảm bảo các chức năng vẽ, đo đạc, chọn layer và 3D Viewport trên Canvas vẫn hoạt động bình thường mà không phát sinh lỗi runtime/compile.

### Non-Functional Requirements

- **NFR-1**: Giảm bớt dung lượng bundle và các file component không cần thiết.
- **NFR-2**: Đảm bảo không còn bất kỳ warning hay typescript error nào liên quan đến các file bị xóa.

## Acceptance Criteria

- [x] AC-1: File `StreetViewControl.tsx` và `MapSearchBar.tsx` đã bị gỡ bỏ khỏi thư mục `MapLayerComponents`.
- [x] AC-2: Component `<StreetViewControl />` không còn được import và render trong `MapLayer.tsx`.
- [x] AC-3: Component `<CoordinatePanel />` / Search bar không còn được import và render trong `CADCanvas.tsx`.
- [x] AC-4: Thư mục `MapLayerComponents/index.ts` đã được cập nhật, xóa các câu lệnh re-export `StreetViewControl` và `MapSearchBar`.
- [x] AC-5: Project biên dịch thành công (`npm run build` hoặc `tsc` check clean).

## Scenarios

### Scenario 1: Mở giao diện Canvas 2D
**Given** Người dùng đang ở màn hình Thiết kế (Design Canvas 2D)
**When** Giao diện bản đồ được tải hoàn tất
**Then** Không nhìn thấy ô tìm kiếm ở góc trên bên trái và không có nút/biểu tượng Pegman StreetView ở trên bản đồ.

### Scenario 2: Chuyển đổi qua lại giữa 2D và 3D Viewport
**Given** Người dùng đang tương tác với Canvas
**When** Chuyển từ chế độ 2D sang 3D Viewport
**Then** Không gặp lỗi văng app hay console error do thiếu component Pegman hoặc Search.

## Technical Notes

- File cần xóa/sửa:
  - DELETE: `apps/project-manager/src/modules/design/features/map/MapLayerComponents/StreetViewControl.tsx`
  - DELETE: `apps/project-manager/src/modules/design/features/map/MapLayerComponents/MapSearchBar.tsx`
  - DELETE: `apps/project-manager/src/modules/design/features/map/MapLayerComponents/StreetViewPage.tsx`
  - DELETE: `apps/project-manager/src/modules/design/components/core/CoordinatePanel.tsx`
  - MODIFY: `apps/project-manager/src/modules/design/features/map/MapLayer.tsx`
  - MODIFY: `apps/project-manager/src/modules/design/components/core/CADCanvas.tsx`
  - MODIFY: `apps/project-manager/src/modules/design/features/map/MapLayerComponents/index.ts`

## Task Links

(Sẽ được tạo sau khi chạy `/kn-plan --from @doc/specs/2026-08-15/remove-canvas-search-pegman`)

## Open Questions

- Không có.
