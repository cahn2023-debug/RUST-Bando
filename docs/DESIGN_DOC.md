# 🎨 Hồ sơ Kỹ thuật: Module DESIGN

## 1. Tổng quan Kiến trúc (Architecture Overview)

Hệ thống thiết kế được xây dựng dựa trên mô hình **Event Sourcing** kết hợp với **In-Memory Projection**. Đây là kiến trúc tối ưu cho các phần mềm CAD/GIS yêu cầu độ phản hồi cực nhanh (0.001ms) và khả năng hoàn tác (Undo/Redo) vô hạn.

### 🔄 Luồng dữ liệu (Data Flow)
1. **Action (UI)**: Người dùng thực hiện thao tác (vẽ điểm, tạo Layer).
2. **Command (Tauri Bridge)**: Gọi các Rust commands trong `design_events/mod.rs`.
3. **Event Store**: Sự kiện được lưu vào bảng `design_events` (SQLite).
4. **Projection (MapState)**: Sự kiện được "chiếu" vào bộ nhớ RAM (`MapState`) để cập nhật trạng thái hiển thị tức thì.
5. **Sync**: Dữ liệu cấu trúc phẳng được ghi vào các bảng `regions`, `layers` để phục vụ báo cáo.

---

## 2. Cấu trúc Phân cấp Dữ liệu (Hierarchy)

Dữ liệu được tổ chức theo mô hình cây 4 tầng để quản lý hàng vạn đối tượng:

| Cấp độ | Tên (Rust Model) | Vai trò |
| :--- | :--- | :--- |
| **Cấp 1** | `Region` | Khu vực lớn (ví dụ: Tòa nhà A, Tầng 1). |
| **Cấp 2** | `Layer` | Lớp dữ liệu (ví dụ: Hệ thống Camera, Hệ thống Cửa). |
| **Cấp 3** | `FeatureGroup` | Nhóm các đối tượng cùng loại hoặc cùng cụm. |
| **Cấp 4** | `Feature` | Đối tượng hình học thực tế (Point, Line, Polygon). |

---

## 3. Các tính năng cốt lõi (Core Features)

### 📐 Hình học & Không gian (Geometry & Spatial)
- **Spatial Indexing (R-Tree)**: Sử dụng thư viện `rstar` để index toàn bộ đối tượng. Cho phép tìm kiếm đối tượng trong vùng nhìn thấy (Bounding Box) cực nhanh.
- **Snapping System**: Hỗ trợ hít điểm (Snap) chính xác vào:
  - Điểm nút (Vertex).
  - Đoạn thẳng (Segment).
  - Trung điểm (Midpoint).
- **Topology Verification**: Kiểm tra tính toàn vẹn hình học, đảm bảo không có các đối tượng chồng lấn trái phép.

### 🎥 Mô phỏng Camera (DORI Simulation)
Tính năng đặc thù cho ngành an ninh:
- **DORI Zones**: Tự động tính toán và hiển thị các vùng:
  - **D**etection (Phát hiện)
  - **O**bservation (Quan sát)
  - **R**ecognition (Nhận diện)
  - **I**dentification (Định danh)
- **FOV Calculation**: Tính toán góc nhìn dựa trên thông số ống kính (Focal length) và kích thước cảm biến (Sensor size).

### ⏳ Quản lý dòng thời gian (Undo/Redo)
- Nhờ Event Sourcing, hệ thống có thể "quay ngược thời gian" bằng cách đánh dấu sự kiện là `is_undone`.
- **Snapshots**: Lưu lại trạng thái toàn cục tại một thời điểm để nạp nhanh (khác với việc replay hàng ngàn sự kiện).

---

## 4. Cấu trúc Mã nguồn (Code Structure)

### Thư mục `src/DESIGN/design_events/` (Lõi Engine)
- `mod.rs`: Hub trung tâm, chứa các Tauri Commands (dispatch, undo, redo, load_state).
- `state.rs`: Định nghĩa `MapState` - "Trái tim" của hệ thống, chứa DashMap các Feature và R-Tree.
- `spatial.rs`: Logic index không gian và snapping.
- `camera.rs`: Quản lý trạng thái và optics của bản vẽ/camera.
- `events.rs`: Định nghĩa enum `DesignEventType` chứa tất cả các loại thao tác người dùng.

### Thư mục `src/DESIGN/geometry/` (Toán học)
- `types.rs`: Các kiểu dữ liệu cơ bản (`Point`, `Segment`, `Polyline`).
- `snapping.rs`: Thuật toán tìm điểm hít gần nhất.
- `simd_math.rs`: (Tiềm năng) Tối ưu hóa tính toán bằng lệnh phần cứng.

### Thư mục `src/CONTRACT/`
- `design_state.rs`: Chứa các giao ước dữ liệu (Interface) giữa Rust và Frontend, bao gồm logic **Robust Deserialization** để tương thích ngược với các phiên bản cũ.

---

## 5. Tối ưu hóa Hiệu năng (Performance Tuning)

1. **Concurrent State**: Sử dụng `Arc` và `DashMap` cho phép nhiều luồng truy cập dữ liệu Map đồng thời mà không gây khóa (Deadlock).
2. **Layer Rendering**: Chỉ render những Feature nằm trong Bounding Box của Viewport nhờ R-Tree.
3. **Data Bridge**: Chuyển đổi dữ liệu sang dạng `Entity` tối ưu cho WebGL/Canvas ở Frontend.

---
*Tài liệu được tổng hợp bởi Antigravity Orchestrator.*
