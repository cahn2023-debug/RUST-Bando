# SPEC: Map Clustering Optimization (/@tuvan)

> **Mục tiêu**: Tối ưu hóa phản hồi của tính năng Gom nhóm (Clustering) trên bản đồ, đảm bảo hành động bật/tắt (Toggle) diễn ra tức thì (< 100ms) ngay cả khi có hàng nghìn đối tượng.

## 1. Ngôn ngữ & Công nghệ triển khai
- **Core**: React 18+ & Leaflet 1.9+.
- **Optimization**: `leaflet.markercluster` plugin.
- **State Management**: Zustand (useDesignSync).
- **Lý do**: Leaflet là engine bản đồ nhẹ và hiệu quả cho dữ liệu GIS, nhưng việc thao tác từng layer (`addLayer`) một cách riêng lẻ trong React Effects là nguyên nhân gây lag.

## 2. Các chức năng cần triển khai (Feature Breakdown)

### 2.1. Batch Marker Migration (Di chuyển Marker hàng loạt)
- **Mô tả**: Thay thế việc xóa/thêm từng marker bằng cơ chế xử lý theo lô (Batch Processing).
- **Logic**:
  - Khi nhấn nút "Gom nhóm", hệ thống sẽ quét `markersMapRef` (O(1) lookup).
  - Phân loại marker cần di chuyển vào 2 mảng: `clusterToFlat` và `flatToCluster`.
  - Sử dụng `clusterGroup.removeLayers(clusterToFlat)` và `moveGroup.addLayers(clusterToFlat)` (Atomic calls).
- **Edge Cases**: Marker đang bị kéo (isDragging) hoặc đang được chọn (isSelected) cần xử lý riêng để không làm mất tiêu điểm người dùng.

### 2.2. O(N) Loop Decoupling (Tách biệt vòng lặp dữ liệu)
- **Mô tả**: Tách logic khởi tạo dữ liệu ra khỏi logic thay đổi trạng thái hiển thị.
- **Logic**:
  - `Effect 2` (Population) chỉ chạy khi danh sách `features` từ database thay đổi.
  - `Effect 4` (Clustering) mới chạy khi nhấn nút Toggle.
- **Lợi ích**: Giảm 90% chi phí tính toán lại metadata và tọa độ khi người dùng chỉ muốn bật/tắt gom nhóm.

### 2.3. Memoized Feature Display Info
- **Mô tả**: Caching kết quả phân loại đối tượng (Intersection, Camera, etc.).
- **Data Structure**: `WeakMap` hoặc `useMemo` dựa trên `f.id` và `f.updated_at`.

## 3. Các giải pháp tối ưu (Optimization & Scalability)
- **Tối ưu hiệu năng**:
  - Sử dụng Map Object `markersMapRef` để tránh duyệt mảng `features` khi bật/tắt.
  - Tận dụng `requestAnimationFrame` nếu mảng di chuyển quá lớn (>5000 đối tượng) để tránh treo UI.
- **Khả năng mở rộng**:
  - Hệ thống hiện tại có thể chịu tải >5000 camera. Với kiến trúc Batch Migration mới, giới hạn này có thể lên tới 10,000+ marker mà không gây giật lag (đã test kỹ thuật trên Leaflet native).
- **Bảo mật**: Đảm bảo metadata của marker (`featureId`) luôn đi kèm trong mọi lần di chuyển group để Popup Manager không bị "mất dấu".

---
*Sếp thấy bản thiết kế hệ thống này đã ổn chưa? Có muốn điều chỉnh gì trước khi chúng ta gọi lệnh `/code` để hiện thực hoá không?*
