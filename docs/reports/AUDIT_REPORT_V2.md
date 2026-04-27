# BÁO CÁO KIỂM TRA CẤU TRÚC CODE (AUDIT REPORT V2)
**Dự án**: Project Manager V4 - Offline Edition
**Ngày lập**: 2026-04-12
**Công nghệ chính**: Tauri v2, Rust, React 19, Vite, Tailwind CSS v4, Zustand, SQL (SQLite/RocksDB/DuckDB).

---

## 🏗️ Kiến trúc Tổng thể (Mirrored Architecture)

Dự án sử dụng mô hình **Feature-Driven Mirrored Architecture**. Cả Frontend (`src`) và Backend (`src-tauri/src`) đều tuân thủ cùng một sơ đồ thư mục, giúp đồng bộ hóa logic nghiệp vụ và giao diện theo từng module chức năng.

### 📂 Cấu trúc Thư mục Chính

| Thư mục | Chức năng (Frontend `src`) | Chức năng (Backend `src-tauri/src`) |
| :--- | :--- | :--- |
| **CONTRACT** | Khai báo các types, interfaces, constants dùng chung cho toàn bộ dự án. | Định nghĩa dữ liệu truyền nhận giữa frontend/backend (Tauri Commands/Events). |
| **DESIGN** | Chứa UI components, CSS, Hooks giao diện, và các tính năng visual (Map, CAD). | Xử lý logic hiển thị, quản lý layout, event handler phía backend. |
| **HOME** | Trang chủ, routing chính, login/onboarding. | Logic khởi tạo hệ thống, cấu hình môi trường. |
| **IMPLEMENT** | Logic "nặng": Core stores (Zustand), API layers, Event Dispatcher. | Implementation chi tiết của các commands, Database IO (SQLite/RocksDB). |
| **TOOL** | Các hàm tiện ích (Utils), Metadata normalization, Helper functions. | Loggers, File system helpers, Macro definitions. |

---

## 🖥️ Chi tiết Frontend (`src`)

### 🛠️ Các thư mục quan trọng trong `src/DESIGN`
- `components/ui`: Các file giao diện nguyên tử (Atomic components như `Button`, `Dialog`, `TitleBar`).
- `components/core`: Thành phần lõi cho Canvas/Map (ví dụ: `CADCanvas`, `CoordinatePanel`).
- `features`: Các module tính năng phức tạp (ví dụ: `map/MapLayer`, `map/MapSearchBar`).
- `hooks`: Logic tái sử dụng gắn liền với vòng đời component.

### ⚙️ Core Logic tại `src/IMPLEMENT`
- `stores/useDesignSync`: Store trung tâm quản lý trạng thái thiết kế và đồng bộ dữ liệu.
- `hooks/useCanvasInteraction`: Xử lý tương tác chuột/bàn phím trên Canvas.

---

## 🦀 Chi tiết Backend (`src-tauri/src`)

### ⚡ Entry Points
- `main.rs`: Khởi tạo Tauri App, đăng ký plugins và commands.
- `lib.rs`: Chứa các macro handler và logic đăng ký lệnh Tauri chính thức.

### 📂 Logic Module
- `DESIGN/map.rs`: Xử lý logic tính toán hoặc cache liên quan đến bản đồ.
- `IMPLEMENT/db`: (Giả định) Quản lý kết nối và repo xử lý SQLite/RocksDB.

---

## 🗺️ Luồng Dữ liệu (Data Flow)

1. **User Action**: Người dùng click/vẽ trên `CADCanvas` (Frontend).
2. **Event Dispatch**: `dispatchEvent` trong `useDesignSync` gửi tín hiệu qua Tauri IPC.
3. **Backend Processing**: Tauri Command tương ứng trong `src-tauri` nhận lệnh, ghi vào Database (SQLite/RocksDB).
4. **Sync Update**: Backend phát sự kiện `SyncUpdate` (hoặc tương tự), Frontend nhận và cập nhật Zustand store, UI re-render.

---

## 🔒 Bảo mật & Hiệu năng
- **Local-First**: Dữ liệu lưu trữ SQLite nội bộ, giảm latency và tăng tính riêng tư.
- **WAL Mode**: SQLite running in Write-Ahead Logging mode để tránh lỗi "Database is locked".
- **Asset Streaming**: Sử dụng `convertFileSrc` để render ảnh lớn/file doc từ local mà không làm chậm app.

---

## 🧩 VS Code Extension: Project Relationship Graph

Tôi đã xây dựng một extension riêng cho dự án này để giúp bạn hình ảnh hóa các mối quan hệ code.

### 📍 Vị trí mã nguồn
Thư mục: `standalone/vscode-extension`

### 🛠️ Cách sử dụng nhanh
1. Mở folder extension bằng VS Code.
2. Chạy `npm install`.
3. Nhấn `F5` để chạy thử.
4. Sử dụng lệnh `Show Project Relationship Graph` trong cửa sổ mới.

---
*Báo cáo được tạo tự động bởi Antigravity Orchestrator.*

