# Specification: Quy trình sử dụng Street View (Pegman) trong Vietnam Basemap

## Overview

Tài liệu mô tả quy trình tương tác và hiển thị Street View (Pegman) trên giao diện Vietnam Basemap:
1. **Chế độ thường (Pegman Tắt)**: Thao tác click trên bản đồ chỉ xác định và hiển thị tọa độ của điểm click trên thanh trạng thái, tuyệt đối KHÔNG hiện marker.
2. **Chế độ Street View (Pegman Bật)**: Bật lớp phủ đường Street View (blue lines), hiển thị thông báo hướng dẫn cho người dùng, nhấp vào vị trí sẽ mở cửa sổ Street View độc lập và giữ nguyên chế độ Pegman cho các lần chọn tiếp theo.

## Locked Decisions

- **D1**: Nút Pegman nằm ở vị trí góc trên bên phải bản đồ (top-right floating controls). Nhấp vào biểu tượng Pegman để chuyển đổi bật/tắt (toggle) chế độ Pegman.
- **D2**: Khi bật chế độ Pegman, bản đồ hiển thị lớp đường phủ Street View (blue coverage lines layer) đồng thời hiển thị banner/tooltip thông báo *"Nhấp vào điểm trên đường phủ để xem Street View"*.
- **D3**: Khi nhấp chọn vị trí trên bản đồ, cửa sổ Street View độc lập (popup window / preview window) được mở hoặc đồng bộ vị trí viewpoint mới. Chế độ Pegman vẫn duy trì kích hoạt để người dùng tiếp tục nhấp chọn vị trí khác.
- **D4**: Khi chế độ Pegman KHÔNG kích hoạt, thao tác nhấp trên bản đồ chỉ lấy tọa độ `[Longitude, Latitude]` và hiển thị tại thanh trạng thái thông tin (Bottom Status Bar), tuyệt đối KHÔNG hiển thị hay vẽ bất kỳ marker/icon nào trên bản đồ.

## System Decision Impact

- Impact: none

## Requirements

### Functional Requirements

- **FR-1**: Cung cấp nút Toggle Pegman ở góc trên bên phải bản đồ trong `FloatingControls`. Hiển thị trạng thái active (sáng/đổi màu) khi Pegman bật và inactive khi Pegman tắt.
- **FR-2**: Khi Pegman = OFF, lắng nghe sự kiện click trên bản đồ, lấy tọa độ `[Longitude, Latitude]` và cập nhật thanh trạng thái ở cạnh dưới bản đồ. Không thêm hoặc render bất kỳ marker nào.
- **FR-3**: Khi Pegman = ON, hiển thị lớp dữ liệu Street View Coverage (đường phủ màu xanh) trên bản đồ.
- **FR-4**: Khi Pegman = ON, hiển thị banner/tooltip hướng dẫn: *"Nhấp vào điểm trên đường phủ để xem Street View"*.
- **FR-5**: Khi Pegman = ON và người dùng nhấp vị trí trên bản đồ, kích hoạt mở/đồng bộ cửa sổ Street View độc lập với tọa độ vừa chọn, đồng thời giữ trạng thái Pegman = ON.
- **FR-6**: Khi người dùng click tắt Pegman (hoặc hủy chế độ), ẩn lớp phủ Street View, ẩn banner hướng dẫn, và quay trở lại chế độ xác định tọa độ thông thường.

### Non-Functional Requirements

- **NFR-1**: Việc chuyển đổi bật/tắt lớp phủ Street View diễn ra mượt mà, không gây đơ lag bản đồ.
- **NFR-2**: Đồng bộ dữ liệu tọa độ tức thì sang cửa sổ Street View khi người dùng nhấp chọn liên tiếp nhiều điểm.

## Acceptance Criteria

- [x] **AC-1**: Khi Pegman OFF, nhấp vào bản đồ hiển thị tọa độ chính xác ở thanh trạng thái bên dưới và KHÔNG xuất hiện marker nào trên bản đồ.
- [x] **AC-2**: Nút Pegman được hiển thị ở góc trên bên phải bản đồ, chuyển đổi trạng thái Active/Inactive trực quan khi nhấp.
- [x] **AC-3**: Khi Pegman ON, lớp phủ đường Street View (blue lines) xuất hiện đè trên bản đồ.
- [x] **AC-4**: Khi Pegman ON, banner/tooltip hướng dẫn hiển thị dòng chữ *"Nhấp vào điểm trên đường phủ để xem Street View"*.
- [x] **AC-5**: Khi Pegman ON, nhấp chọn vị trí mở ra cửa sổ Street View tại tọa độ vừa chọn.
- [x] **AC-6**: Sau khi mở cửa sổ Street View, chế độ Pegman vẫn ở trạng thái ON để người dùng nhấp chọn vị trí khác mà không phải bật lại.
- [x] **AC-7**: Click tắt Pegman sẽ ẩn lớp phủ Street View cùng banner hướng dẫn, đưa bản đồ về lại chế độ thường.

## Scenarios

### Scenario 1: Nhấp bản đồ ở chế độ Pegman OFF (Xác định tọa độ)
**Given** Người dùng đang duyệt bản đồ ở chế độ thường (Pegman TẮT).
**When** Người dùng click chuột vào một vị trí bất kỳ trên bản đồ.
**Then** Thanh trạng thái thông tin ở góc dưới cập nhật tọa độ `Lat: XX.XXXX, Lng: YY.YYYY`, và không có marker nào được hiển thị trên bản đồ.

### Scenario 2: Bật chế độ Pegman và hiển thị đường phủ
**Given** Bản đồ đang ở chế độ thường.
**When** Người dùng nhấp biểu tượng Pegman ở góc trên bên phải bản đồ.
**Then** Chế độ Pegman được kích hoạt, lớp phủ đường Street View màu xanh xuất hiện trên bản đồ kèm banner thông báo *"Nhấp vào điểm trên đường phủ để xem Street View"*.

### Scenario 3: Nhấp chọn điểm xem Street View và duy trì chế độ Pegman
**Given** Chế độ Pegman đang BẬT và lớp đường phủ Street View đang hiển thị.
**When** Người dùng nhấp vào vị trí đường phủ Street View trên bản đồ.
**Then** Cửa sổ Street View độc lập mở ra hiển thị hình ảnh panorama tại tọa độ vừa nhấp, và chế độ Pegman trên bản đồ vẫn giữ nguyên trạng thái BẬT.

## Technical Notes

- Các file liên quan chính:
  - [BasemapPreviewApp.tsx](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/BasemapPreviewApp.tsx)
  - [MapCanvas.tsx](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/basemapPreview/MapCanvas.tsx)
  - [FloatingControls.tsx](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/basemapPreview/FloatingControls.tsx)
  - [streetViewCoverage.ts](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/basemapPreview/streetViewCoverage.ts)
- Đảm bảo logic xử lý event click ở `MapCanvas.tsx` phân tách rõ 2 trạng thái: `isPegmanActive === true` vs `isPegmanActive === false`.

## Task Links

*(Task links sẽ được tự động liên kết sau khi tạo task)*

## Open Questions

*(Không có câu hỏi mở. Tất cả các quyết định D1-D4 đã được người dùng xác nhận).*
