# Map Controls Redesign Spec

## Overview

Tái cấu trúc và hiện đại hóa toàn bộ giao diện điều khiển bản đồ trong ứng dụng `vietnam-basemap-preview`. Loại bỏ hoàn toàn các phần ngoài bản đồ ở phía bên trái, chuyển bản đồ thành chế độ hiển thị tràn viền toàn màn hình (Full-screen canvas focus), và bố trí 2 cụm nút biểu tượng nổi (Floating Action Control Buttons) ở góc trên bên phối và góc dưới bên phải.

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

## System Decision Impact

- **Impact**: none
- **Acceptance gate**: N/A

## Acceptance Criteria

- [x] **AC-1**: Biểu tượng Pegman chính giữa hình tròn hiển thị hình ô van đầu người màu vàng ở giữa và ô van nằm ngang màu xanh cho thân người.
- [x] **AC-2**: Marker Pegman trên bản đồ cũng đồng bộ hiển thị hình ô van vàng (đầu) và ô van xanh ngang (thân) quay theo hướng xem của người dùng.
