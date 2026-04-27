# 📊 BÁO CÁO TỔNG QUAN DỰ ÁN: 15042026_TH du an

## 🎯 Giới thiệu chung
Dự án **Project Manager V4 (Offline Edition)** là một ứng dụng desktop chuyên dụng cho quản lý dự án, tệp tin và dữ liệu GIS, được xây dựng trên nền tảng **Tauri v2**. Ứng dụng tập trung vào khả năng hoạt động offline-first, đồng bộ hóa đa thiết bị và tích hợp trí tuệ nhân tạo (AI).

---

## 📁 Cấu trúc thư mục (High-Level)
Dự án được tổ chức theo mô hình **Mono-repo** phân tách rõ ràng giữa giao diện (Frontend) và logic hệ thống (Backend).

```text
RUST/
├── src/                    # ⚛️ Frontend (React + TypeScript)
│   ├── IMPLEMENT/          # Lõi logic thực thi (Features, Stores, Hooks)
│   ├── DESIGN/             # Định nghĩa giao diện và layout
│   ├── CONTRACT/           # Định nghĩa các giao diện dùng chung
│   └── i18n/               # Đa ngôn ngữ (VI/EN)
├── src-tauri/              # 🦀 Backend (Rust + Tauri)
│   ├── src/IMPLEMENT/      # Lõi logic hệ thống
│   │   ├── modules/v2/     # Kiến trúc V2 (Event Sourcing)
│   │   ├── db/             # Quản lý Database (Schema, Migrations)
│   │   └── commands/       # API Commands cho Frontend gọi
│   └── crates/             # Các module Rust độc lập (GIS, Storage)
├── financial_system/       # 💰 Crate riêng quản lý tài chính
└── docs/                   # 📝 Tài liệu hướng dẫn và báo cáo
```

---

## 🛠️ Công nghệ sử dụng
| Thành phần | Công nghệ |
|------------|-----------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, Zustand, TanStack Table |
| **Backend** | Rust (Tauri v2), Tokio (Async runtime) |
| **Database** | SQLite (Rusqlite), RocksDB (Key-Value), DuckDB (Analytics) |
| **Bản đồ/GIS** | Leaflet, Google Maps JS API, Proj4, Rstar |
| **AI/OCR** | Burn (Deep Learning), ONNX Runtime, PDF Extract |
| **Khác** | Monaco Editor, Mermaid JS (Diagrams), i18next |

---

## 🏗️ Kiến trúc & Mối liên kết (Frontend - Backend - DB)

### 1. Luồng dữ liệu (Data Flow)
Ứng dụng sử dụng mô hình **Event Sourcing (V2)**:
1. **Frontend**: Người dùng tương tác -> Gọi `safeInvoke` (Tauri IPC).
2. **Backend**: Nhận command -> Tạo một **AppEvent** -> Lưu vào **EventStore** (SQLite).
3. **Projection**: `ProjectionEngine` nhận event -> Cập nhật các bảng quan hệ tương ứng (`projects`, `tasks`, `files`).
4. **UI Update**: Frontend nhận kết quả và cập nhật trạng thái qua Zustand store.

### 2. Chi tiết Database
*   **SQLite**: Lưu trữ dữ liệu cấu trúc, danh sách task, dự án và nhật ký sự kiện (`design_events`). Sử dụng **FTS5** để tìm kiếm nội dung toàn văn siêu nhanh.
*   **RocksDB**: Dùng làm cache hoặc lưu trữ key-value hiệu năng cao cho việc đồng bộ dữ liệu.
*   **DuckDB**: Xử lý các truy vấn phân tích dữ liệu lớn hoặc báo cáo tài chính phức tạp.

### 3. Các Module Chức năng Chính (Backend)
- **AI Module**: Hỗ trợ OCR (nhận diện văn bản từ ảnh/pdf), trích xuất thông tin hợp đồng tự động.
- **GIS Module**: Xử lý dữ liệu không gian, chuyển đổi hệ tọa độ (VN-2000, WGS-84) và hiển thị Marker/Polyline trên bản đồ.
- **Sync Engine**: Đảm bảo dữ liệu đồng bộ giữa các lần chạy và hỗ trợ mô hình Offline-first.

---

## 📍 Trạng thái hiện tại & File quan trọng
| Thành phần | File/Thư mục cốt lỗi | Chức năng |
|------------|-----------------------|-----------|
| **DB Schema** | `src-tauri/src/IMPLEMENT/db/schema.rs` | Định nghĩa toàn bộ bảng SQLite |
| **V2 Logic** | `src-tauri/src/IMPLEMENT/modules/v2/` | Lõi xử lý Event Sourcing và Sync |
| **IPC API** | `src-tauri/src/IMPLEMENT/commands/` | Danh sách các lệnh Frontend có thể gọi |
| **UI Store** | `src/IMPLEMENT/stores/` | Quản lý state toàn cục của ứng dụng |
| **I18n** | `src/IMPLEMENT/lib/i18n.ts` | Cấu hình đa ngôn ngữ Tiếng Việt/Anh |

---

## ⚠️ Lưu ý kỹ thuật
*   Dự án đang trong giai đoạn chuyển đổi từ **V1 (CRUD truyền thống)** sang **V2 (Event Sourcing)**. Cần ưu tiên sử dụng các module trong `v2/` cho các tính năng mới.
*   Hệ thống metadata sử dụng định dạng JSON linh hoạt (`metadata_json`) cho phép mở rộng thuộc tính mà không cần thay đổi schema database.

---
**Báo cáo được tạo tự động bởi Antigravity Project Analyst.**
