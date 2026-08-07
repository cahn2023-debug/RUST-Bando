# SPEC_BoxSelection.md - Thiết kế Chức năng Quét vùng Thống kê

## 1. Ngôn ngữ & Công nghệ triển khai
- **Frontend**: React (Zustand cho State Management).
- **Map Library**: Leaflet (React-Leaflet).
- **Utility**: `leaflet` native events, `clipboard-copy` API.
- **Algorithm**: Ray-casting hoặc Simple Bounds Check (dưới đây).

## 2. Các chức năng cần triển khai

### A. Bắt sự kiện Box Selection
- **Mô tả**: Khi người dùng giữ Shift + Chuột trái và kéo, Leaflet mặc định kích hoạt `BoxZoom`.
- **Logic**:
  1. Thêm component `BoxSelectionHandler` vào `MapLayer`.
  2. Lắng nghe event `boxzoomend` trên map instance.
  3. Lấy `bounds` từ event (`e.boxZoomBounds`).

### B. Spatial Query (Lọc đối tượng)
- **Logic**: 
  - Lặp qua `state.features` trong `useDesignSync`.
  - Với **Point**: Kiểm tra `bounds.contains(latlng)`.
  - Với **Polyline**: Kiểm tra xem bất kỳ điểm nào của line có nằm trong bounds không (tối thiểu), hoặc kiểm tra giao cắt (phức tạp hơn). Để MVP, chỉ cần kiểm tra xem bounds có bao phủ ít nhất 1 điểm của line hoặc giao với bounds của line.
- **Data Structure**:
```typescript
interface SelectionSummary {
  counts: Record<string, number>; // e.g. { 'cctv': 5, 'node': 10 }
  features: Feature[];
}
```

### C. UI Property Manager (Selection Mode)
- **Hành vi**:
  - Nếu `selectedFeatureId` là null và có `boxSelection` kết quả.
  - Hiển thị màn hình "Selection Summary".
  - **Phần 1: Thống kê tổng**: Hiển thị card/badge số lượng theo icon (Camera, Nút, ...).
  - **Phần 2: Danh sách chi tiết**: Bảng hoặc list rút gọn các đối tượng.
  - **Phần 3: Copy to Excel**: Nút copy dữ liệu dạng TSV (Tab Separated Values).

### D. Copy to Excel Logic
- Build một chuỗi string:
```text
Tên	Loại	Tọa độ	Mô tả
Camera 01	CCTV	[10.1, 106.2]	Ghi chú...
```
- Sử dụng `navigator.clipboard.writeText(tsvString)`.

## 3. Các giải pháp tối ưu
- **Hiệu năng**: Thay vì check mọi tính năng, có thể lọc nhanh theo `projectId` hiện tại.
- **UX**: Sau khi quét, bản đồ tự động zoom (`map.fitBounds(bounds)`). Điều này Leaflet đã làm mặc định, nhưng cần đảm bảo nó không xung đột với logic thống kê.
- **Bảo mật**: Không export các thông tin nhạy cảm của hệ thống, chỉ export data hiển thị.

---
**Sếp thấy bản thiết kế hệ thống này đã ổn chưa? Có muốn điều chỉnh gì trước khi em bắt đầu code không ạ?**
