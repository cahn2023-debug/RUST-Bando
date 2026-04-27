# Architecture: Bi-directional Street View Synchronization

Hệ thống cung cấp khả năng đồng bộ thời gian thực giữa Main Map (cửa sổ chính) và Street View window (cửa sổ phụ) sử dụng Tauri Events.

## 1. Luồng dữ liệu (Data Flow)

### A. Main Window -> Street View (One-way Initialization)
Khi người dùng chọn một camera và nhấn "Street View":
1.  **Metadata Extraction**: Hệ thống trích xuất `heading` và `fov` từ metadata camera (sử dụng `cameraMath.ts`).
2.  **Window Creation**: Mở cửa sổ Tauri mới với URL chứa tọa độ và thông số POV ban đầu.
3.  **Event Emission**: Emit event `location-change` để cập nhật Panorama nếu cửa sổ đã mở.

### B. Street View -> Main Window (Reverse Sync)
Đảm bảo vị trí Pegman (marker người) trên bản đồ chính khớp với vị trí trong Panorama:
1.  **JS SDK Listeners**: Component `StreetViewJS` lắng nghe sự kiện `position_changed` và `pov_changed` từ Google Maps.
2.  **Tauri Event Emit**: Khi có thay đổi, cửa sổ Street View emit event `pano-changed` và `pov-changed` về Main Window.
3.  **Map Update**: Main window lắng nghe các event này và cập nhật vị trí của Pegman marker tương ứng.

## 2. Event Schema

| Event Name | Source | Payload | Description |
|------------|--------|---------|-------------|
| `location-change` | Main | `{ lat, lng, pov: { heading, pitch, zoom } }` | Cập nhật Panorama |
| `pano-changed` | SV Window | `{ lat, lng, panoId }` | Cập nhật vị trí Pegman |
| `pov-changed` | SV Window | `{ heading, pitch, zoom }` | Đồng bộ hướng nhìn marker |

## 3. Technology Stack
- **Google Maps JavaScript SDK**: Thay thế Iframe để hỗ trợ tương tác sâu.
- **Tauri WebviewWindow**: Quản lý đa cửa sổ và giao tiếp IPC.
- **Zustand**: Quản lý trạng thái camera đang chọn trên Main window.

---
*Tài liệu này thuộc hệ thống tài liệu kỹ thuật Milestone 2.*
