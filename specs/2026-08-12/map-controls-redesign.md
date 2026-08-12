# Map Controls Redesign Spec

## Overview

Tái cấu trúc và hiện đại hóa toàn bộ giao diện điều khiển bản đồ trong ứng dụng `vietnam-basemap-preview`. Loại bỏ hoàn toàn các phần ngoài bản đồ ở phía bên trái, chuyển bản đồ thành chế độ hiển thị tràn viền toàn màn hình (Full-screen canvas focus), bố trí 2 cụm nút biểu tượng nổi (Floating Action Control Buttons) ở góc trên bên phải và góc dưới bên phải, đồng thời tích hợp danh sách ô tích (checkboxes) bật/tắt các lớp con (sub-layers) của nguồn bản đồ trong popover điều khiển.

## Locked Decisions

- **D1**: Nút Layer ở góc dưới bên phải sẽ mở một **Popover floating card** phía trên nút, cho phép người dùng lựa chọn nguồn bản đồ (Google Street, Google Hybrid, Local package) và đổi style (Engineering, Light, Dark). Tự động đóng popover khi nhấp ra ngoài.
- **D2**: Nút **Thước đo** (Measure Tool) hoạt động theo cơ chế bật/tắt (toggle active). Khi bật, người dùng nhấp các điểm trên MapLibre canvas để nối thành đường kẻ đo khoảng cách thực tế (mét/km) kèm nhãn tooltip độ dài; nhấp đúp hoặc tắt nút để xóa đường đo.
- **D3**: Ẩn/loại bỏ hoàn toàn bảng điều khiển góc dưới bên trái cũ (`preview-controls`).
- **D4**: Loại bỏ toàn bộ phần giao diện đè lên bản đồ bên trái (gồm thanh Header tiêu đề "VIETNAM BASEMAP / Basemap Preview", Badge trạng thái, và khung tin báo phía dưới bên trái). Nút xem Thông tin (Metadata) được đưa vào chân trang Popover Layer.
- **D5**: Nút **Pegman** ở góc trên bên phải được thiết kế hình tròn hoàn hảo (Circular floating button).
- **D6**: Biểu tượng Pegman đại diện góc nhìn người từ trên xuống (top-down view):
  - **Đầu người**: Hình ô van/tròn màu vàng (`#ffcf5a`) ở chính giữa.
  - **Thân người**: Hình ô van nằm ngang màu xanh (`#65d6c3`) phía dưới.
  - Mũi tên chỉ hướng nhìn nằm ngay phía trên đầu.
- **D7**: **Các ô tích lớp nền của nguồn bản đồ (Sub-layers Checkboxes)**: Phía dưới phần Nguồn bản đồ trong Popover Layer, bổ sung danh sách các ô tích bật/tắt linh hoạt các thành phần layer nền, bao gồm:
  - **Nhãn & Ranh giới (Borders & Labels)**: Bật/tắt đường ranh giới hành chính và tên địa danh/đường xá.
  - **Giao thông / Đường xá (Roads & Transportation)**: Bật/tắt lớp mạng lưới đường giao thông.
  - **Địa điểm quan tâm (Places / POIs)**: Bật/tắt biểu tượng và nhãn các điểm dịch vụ/công cộng.
  - **Công trình 3D (3D Buildings)**: Bật/tắt khối nhà 3D khi thu phóng cận cảnh.
  - **Địa hình (Terrain & Contours)**: Bật/tắt lớp mô phỏng địa hình / đường đồng mức.
- **D8**: **Tách biệt lớp nền Vệ tinh thuần và lớp Nhãn/Giao thông phủ (Google Hybrid dual-raster overlay)**:
  Nguồn Google Hybrid (`google-hybrid`) được tách thành 2 lớp riêng biệt trong MapLibre document:
  1. `google-satellite-layer` (`lyrs=s`): Ống kính vệ tinh thuần túy, không chứa chữ hay ranh giới.
  2. `google-hybrid-labels-layer` (`lyrs=h`): Lớp phủ trong suốt chứa nhãn tên đường, POIs và đường ranh giới.
  Khi người dùng bỏ tích các ô sub-layer liên quan (Nhãn, Đường xá, POI), lớp phủ `google-hybrid-labels-layer` sẽ tự động ẩn (`visibility: 'none'`), hiển thị bản đồ vệ tinh nguyên bản không còn chữ hay nhãn đè lên.

## System Decision Impact

- **Impact**: none
- **Acceptance gate**: N/A

## Functional Requirements

- **FR-1**: Hiển thị danh sách ô tích các sub-layer ngay bên dưới section Nguồn bản đồ trong `LayerPopover`.
- **FR-2**: Người dùng có thể tích/bỏ tích độc lập từng lớp con (`borders_labels`, `roads`, `pois`, `buildings_3d`, `terrain`).
- **FR-3**: Trạng thái ô tích cập nhật ngay lập tức (real-time toggle) độ ẩn/hiện (`visibility: visible | none`) của các layer tương ứng trên MapLibre canvas.
- **FR-4**: Lưu giữ trạng thái bật/tắt sub-layer vào cấu hình người dùng (`PreviewUserConfig`) hoặc state hiện tại của ứng dụng.

## Acceptance Criteria

- [x] **AC-1**: Biểu tượng Pegman chính giữa hình tròn hiển thị hình ô van đầu người màu vàng ở giữa và ô van nằm ngang màu xanh cho thân người.
- [x] **AC-2**: Marker Pegman trên bản đồ cũng đồng bộ hiển thị hình ô van vàng (đầu) và ô van xanh ngang (thân) quay theo hướng xem của người dùng.
- [x] **AC-3**: Popover "Lớp nền bản đồ" hiển thị danh sách các ô tích layer con phía dưới phần Nguồn bản đồ (Borders & Labels, Roads, Places/POIs, 3D Buildings, Terrain).
- [x] **AC-4**: Tích hoặc bỏ tích bất kỳ ô nào sẽ tự động ẩn/hiện layer tương ứng trên canvas mà không làm reload hoặc đơ map.

## Scenarios

### Scenario 1: Tắt nhãn và đường xá trên bản đồ
**Given** Người dùng đang mở Popover "Lớp nền bản đồ"
**When** Bỏ tích ở ô "Nhãn & Ranh giới" và ô "Giao thông / Đường xá"
**Then** Bản đồ hiển thị lớp ảnh vệ tinh/nền thuần mà không còn các chữ tên đường hay ranh giới tỉnh/thành.

### Scenario 2: Bật công trình 3D
**Given** Người dùng đang ở mức thu phóng (zoom level) cận cảnh (zoom >= 15)
**When** Tích chọn ô "Công trình 3D (3D Buildings)"
**Then** Các khối tòa nhà 3D xuất hiện nổi trên mặt đất canvas bản đồ.

## Task Links

(Sẽ cập nhật sau khi chạy `/kn-plan --from @doc/specs/2026-08-12/map-controls-redesign.md`)

