# SPEC_Basemap_Options - Đặc tả kỹ thuật Bản đồ nền & Layer

## 1. Ngôn ngữ & Công nghệ triển khai (Tech Stack)
- **Cốt lõi**: React 18, Vite.
- **Bản đồ**: `react-leaflet` (Leaflet wrapper for React).
- **Styling**: Vanilla CSS (tận dụng CSS Filters cho hiệu ứng đen trắng).
- **Dữ liệu nền**: Google Maps Tile API (`mt0.google.com`).

## 2. Các chức năng cần triển khai (Feature Breakdown)

### 2.1. Chế độ Bản đồ Đen Trắng (Grayscale Mode)
- **Mô tả**: Cho phép người dùng chuyển toàn bộ bản đồ nền sang tông màu xám để làm nổi bật các đối tượng thiết kế (Design Features) phía trên.
- **Luồng xử lý**: 
  - Thêm một checkbox "Chế độ Đen Trắng" trong menu điều khiển bản đồ.
  - Khi kích hoạt, áp dụng `filter: grayscale(100%) brightness(1.1) contrast(1.2)` lên class `.leaflet-tile-container`. (Cần chú ý không để filter này ảnh hưởng đến Marker).
- **Ưu điểm**: Không cần load lại Tile mới, tiết kiệm tài nguyên và băng thông.

### 2.2. Tùy chỉnh hiển thị Layer (Layer Visibility) & UI Cải tiến
- **Mô tả**: Tắt/mở các thành phần của bản đồ nền và các lớp phủ thiết kế, đồng thời cải thiện khả năng đọc của menu.
- **Chi tiết UI**:
  - **Thẻ màu (Color Tags)**: Bổ sung các ô màu nhỏ trước tên bản đồ nền để dễ phân biệt:
    - Street: Blue (#3b82f6)
    - Satellite Hybrid: Green (#22c55e)
    - Satellite Only: slate (#64748b)
    - Terrain: Purple (#a855f7)
    - Grayscale: White (#ffffff)
  - **Độ tương phản (Contrast)**:
    - Chuyển nền menu Layer sang màu tối (Semi-transparent Slate-900).
    - Chuyển chữ sang màu trắng (Slate-50) để hiển thị rõ trên nền bản đồ vệ tinh.
    - Bo góc và thêm viền mảnh (border-white/10).
  - **Overlay Toggles**: Thêm menu để tắt/mở nhanh:
    - Lớp phủ DORI (Camera coverage).
    - Các đối tượng thiết kế (Design Features).
    - Text/Labels trên bản đồ.

### 2.3. Các trường hợp góc (Edge Cases)
- Khi chuyển đổi giữa vệ tinh và đường phố, filter đen trắng phải được giữ nguyên nếu đang bật.
- Đảm bảo các Marker và Icon quan trọng không bị ảnh hưởng bởi filter grayscale (giữ nguyên màu sắc để dễ nhận diện) bằng cách chỉ áp dụng filter lên Tile Layer.

## 3. Các giải pháp tối ưu (Optimization & Scalability)
- **Hiệu năng**: Sử dụng CSS `will-change: filter` để tối ưu hóa render trên GPU.
- **Tái sử dụng**: Đóng gói logic Basemap Control vào một hook hoặc component riêng để dễ dàng bảo trì.
- **Bảo mật**: Đảm bảo các API key (nếu có) được quản lý qua biến môi trường (đã có `.env`).

---
*Người thực hiện: Antigravity*
*Ngày lập: 27/03/2026*
