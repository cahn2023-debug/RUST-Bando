# SPEC: Granular Basemap Feature Control (Can thiệp nội dung bản đồ)

## 1. Mục tiêu
Thay thế việc sử dụng lớp phủ "Nhãn bản đồ" (Labels Overlay) bằng cách can thiệp trực tiếp vào style của bản đồ nền (Styled Tiles). Cho phép sếp bật/tắt từng nhóm đối tượng: Nhà cửa, Đường xá, Điểm tiện ích (Trạm y tế, trường học...), Công trình xây dựng.

## 2. Giải pháp kỹ thuật (Tech Stack)
- **Cơ chế**: Sử dụng tham số `apistyle` của Google Maps Tile API để lọc các feature trực tiếp từ server trước khi tải Tile về máy.
- **Tối ưu**: 
  - Không tạo thêm lớp phủ mới (giảm số lượng TileLayer đang chạy).
  - Tận dụng bộ nhớ đệm (Cache) của trình duyệt.
  - Phù hợp với máy RAM 2GB vì chỉ render 1 lớp bản đồ chính duy nhất.

## 3. Danh sách các thành phần (Feature Breakdown)

| Thành phần | Mã Feature (s.t) | Mô tả |
|------------|-----------------|-------|
| **Đường xá** | `3` | Đường cao tốc, quốc lộ, đường phố. |
| **Công trình** | `2` | Các điểm mốc, building lớn, khối biểu tượng. |
| **Tiện ích (POI)** | `8` | Trạm y tế, trường học, cửa hàng, ATM... |
| **Nhãn văn bản** | `s.e:l` | Tên đường, tên địa danh, số nhà. |
| **Địa hình** | `6` | Công viên, thảm thực vật, nước. |

## 4. Giao diện (UI/UX)
- Tạo một menu nhỏ "Lọc nội dung" (Content Filter) nằm tích hợp hoặc ngay sát menu LayersControl.
- Sử dụng các checkbox nhỏ gọn.
- **Logic**: Khi sếp tick/untick, chuỗi `apistyle` sẽ được tạo lại ví dụ: `s.t:3|p.v:off` (Ẩn đường xá).

## 5. Rủi ro & Giải pháp
- **Rủi ro**: Mỗi lần đổi style, bản đồ sẽ bị nháy nhẹ để tải lại Tile mới.
- **Giải pháp**: Chỉ kích hoạt tải lại khi sếp ngừng thao tác checkbox (Debounce logic) để tránh gửi quá nhiều request liên tục.

---
Sếp thấy phương án "can thiệp sâu" này đã đúng hướng chưa ạ? Nếu ổn, tôi sẽ bắt tay vào code phần UI filter này luôn.
