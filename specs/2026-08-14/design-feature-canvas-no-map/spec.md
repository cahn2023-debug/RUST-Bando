# Specification: Design Feature Canvas & Map Removal

## Overview

Yêu cầu chỉnh sửa trong giao diện THIẾT KẾ (DESIGN): Lược bỏ toàn bộ bản đồ nền GIS/Map tile ở phần trung tâm viewport, chuyển sang canvas sơ đồ vector phẳng đơn sắc/lưới (grid background). Đồng thời hoàn thiện các thao tác Zoom Extent (fit bounds theo feature với animation mượt) và Click chọn điểm (point selection với highlight và đồng bộ với cây danh sách bên trái + bảng thuộc tính bên phải).

## Locked Decisions

- **D1**: Ẩn/tắt hoàn toàn bản đồ nền (map tiles/GIS layers) trong khu vực trung tâm, chỉ giữ lại canvas hiển thị vector các feature (nút, tuyến, điểm) với nền đơn sắc/lưới (grid), đồng thời nâng cấp các thao tác Zoom Extent và chọn điểm direct-click.
- **D2**: Zoom Extent sẽ tính toán Bounding Box bao phủ toàn bộ các feature (hoặc feature được chọn) và căn giữa viewport với padding 10-15%, có hiệu ứng mượt (smooth transition 300-500ms). Click chọn điểm sẽ highlight điểm đó, đồng bộ với cây danh sách bên trái và bảng Thông số ở sidebar phải.
- **D3**: Ẩn/lược bỏ các công cụ dành riêng cho bản đồ GIS như "TỌA ĐỘ GIS", ô tìm kiếm địa chỉ/camera; giữ lại và tối ưu các công cụ vẽ (Nút/Điểm, Nối giao, Polyline, Chọn, Di chuyển, Visibility, Analyses, Export).

## System Decision Impact

- **Impact**: none
- **Decision**: N/A

## Requirements

### Functional Requirements

- **FR-1**: Canvas trung tâm hiển thị sơ đồ phẳng (Grid canvas mode), loại bỏ việc tải map tiles (Mapbox/MapLibre tiles/OpenStreetMap/satellite raster tiles).
- **FR-2**: Hỗ trợ thao tác Zoom Extent (Fit Bounds) khi click nút Zoom Extent trên Toolbar hoặc phím tắt. Tự động tính Bounding Box của tập hợp feature (hoặc feature đang chọn) và căn chỉnh camera viewport mượt mà (animation 300-500ms, padding 10-15%).
- **FR-3**: Thao tác Click chọn điểm (Point Direct-Click Selection): Cho phép người dùng click trực tiếp vào nút/điểm trên canvas để chọn. Điểm được chọn sẽ hiển thị hiệu ứng highlight (viền sáng, đổi màu indicator), kích hoạt đồng bộ selection state với cây danh sách nút/giao lộ bên trái (DrawingExplorer / Feature Tree) và tự động load thông số kỹ thuật lên sidebar phải (THÔNG SỐ THIẾT KẾ).
- **FR-4**: Cập nhật MapToolbar: Lược bỏ nút "TỌA ĐỘ GIS" và ô search địa chỉ/nút giao GIS; tối ưu bố cục toolbar cho chế độ Thiết kế sơ đồ.
- **FR-5**: Hỗ trợ Multi-select điểm (Shift + Click) và Toggle selection khi click lại vào điểm đang chọn.

### Non-Functional Requirements

- **NFR-1**: Tăng tốc độ render canvas do không còn độ trễ tải tile mạng (0ms network tile delay).
- **NFR-2**: Trải nghiệm tương tác mượt mà (60 FPS pan/zoom/select).

## Acceptance Criteria

- [ ] **AC-1**: Khi vào màn hình THIẾT KẾ, vùng canvas trung tâm hiển thị nền vector đơn sắc / lưới (grid canvas), không tải hoặc hiển thị bất kỳ map tile raster/vector background nào.
- [ ] **AC-2**: Click nút Zoom Extent trên Toolbar hoặc gọi hàm fitBounds: Viewport tự động tính toán BBox của các feature và zoom/pan mượt mà để hiển thị trọn vẹn sơ đồ trong khung nhìn.
- [ ] **AC-3**: Click trực tiếp vào điểm (Point/Nút): Điểm chuyển sang trạng thái Selected (highlight stroke/color), cây danh sách bên trái tự động scroll và chọn dòng "Đường Vương & Đại...", bảng bên phải hiển thị "THÔNG SỐ THIẾT KẾ" tương ứng.
- [ ] **AC-4**: Các nút công cụ GIS không cần thiết ("TỌA ĐỘ GIS", ô search địa chỉ) được ẩn/lược bỏ khỏi MapToolbar.
- [ ] **AC-5**: Thao tác Shift+Click chọn nhiều điểm hoạt động chính xác.

## Scenarios

### Scenario 1: Zoom Extent toàn bộ sơ đồ
**Given** Người dùng đang ở màn hình THIẾT KẾ với sơ đồ có nhiều nút/tuyến
**When** Người dùng click vào nút Zoom Extent trên Toolbar
**Then** Viewport tự động căn chỉnh vị trí và mức zoom (smooth transition 400ms, padding 12%) sao cho tất cả các nút và tuyến nằm trọn trong màn hình.

### Scenario 2: Click chọn điểm trên sơ đồ
**Given** Người dùng ở chế độ Chọn (Select mode)
**When** Người dùng click chuột trái vào điểm/nút nút giao "Đường Vương & Đại..."
**Then** Điểm đó hiển thị viền highlight sáng trên canvas, cây nút giao bên trái tự động scroll và chọn dòng "Đường Vương & Đại...", bảng bên phải hiển thị "THÔNG SỐ THIẾT KẾ" tương ứng.

## Technical Notes

- Cấu hình style của MapLibreFastRenderer / CanvasRenderer để sử dụng empty/flat background style (hoặc custom HTML5 Canvas mode) mà không fetch GIS tile servers.
- Sử dụng `SmoothZoomController` và `SelectionManager` đã có trong `apps/project-manager/src/modules/design/features/map` để xử lý fitBounds animation và synchronization store.

## Task Links

*Các task sẽ được tự động tạo và liên kết sau khi duyệt Spec này.*

## Open Questions

Không còn câu hỏi mở. Tất cả các quyết định D1, D2, D3 đã được chốt qua quá trình Socratic Dialog.
