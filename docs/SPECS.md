# 💡 SPECS: Offline Project Manager (Rust/Tauri Edition)

**Ngày cập nhật:** 24/02/2026
**Mục tiêu:** Tái cấu trúc phần mềm quản lý dự án nội bộ từ C# WPF sang kiến trúc hiện đại Rust + Tauri + React.

---

## 1. VẤN ĐỀ VÀ KIẾN TRÚC HIỆN TẠI (C# WPF)
- Ứng dụng hiện tại chạy trên .NET 10.0 WPF, quản lý file dạng `.pmp` (thực chất là SQLite DB).
- Chứa các tính năng nặng về UI và xử lý dữ liệu: Gantt Chart, Kanban, FTS5 Search, File Preview (NPOI, PDFPig), Machine Learning (ML.NET).
- **Vấn đề:** Muốn chuyển đổi sang nền tảng nhẹ hơn, an toàn vùng nhớ hơn, tốc độ khởi động nhanh hơn (Tauri + Rust) nhưng vẫn giữ nguyên giao diện Desktop Pro Max.

## 2. GIẢI PHÁP ĐỀ XUẤT (RUST + TAURI)
- **Frontend:** React + TypeScript + TailwindCSS. Dùng Vite để build. UI component dùng Radix UI / Lucide Icons.
- **Backend Core:** Rust.
  - Quản lý State: `Arc<Mutex<AppState>>`.
  - Database: `rusqlite` tiếp tục sử dụng SQLite (ưu tiên tương thích ngược với file `.pmp` cũ). Ràng buộc Full-Text Search FTS5.
  - File/Document Processing: Sử dụng các crate Rust tương đương (`calamine` cho Excel, `lopdf` cho PDF, hoặc gọi tiến trình Python con nếu cần mượn thư mục `V4_Python_co thu vien`).
  - ML Offline: Sử dụng `linfa` (Rust) hoặc `ort` (ONNX Runtime) để thay thế ML.NET, đảm bảo chạy hoàn toàn offline.

## 3. TÍNH NĂNG CỐT LÕI (CORE FEATURES)

### 🚀 Giai đoạn 1 (Core & UI Foundation)
- [x] Kiến trúc Tauri + React (Giao tiếp IPC).
- [x] Giao diện 4-Pane (Nav, Sidebar, Workspace, Right Panel) chuẩn Dark Mode Pro.
- [x] Đọc/Ghi cơ sở dữ liệu dự án dạng SQLite.

### 🚀 Giai đoạn 2 (Project Management Core)
- [ ] **Project Explorer:** TreeView ánh xạ cấu trúc cây thư mục hệ điều hành, hỗ trợ bóc tách Context-aware (click vào thư mục -> tạo Task tự link tới thư mục đó).
- [ ] **Kanban Task Board:** Bảng quản lý tiến độ chia cột trạng thái (Todo, In Progress, Done). Tương tác Drag & Drop mượt mà. Đẩy tín hiệu (Optimistic UI) ngay lập tức.
- [ ] **Gantt Chart & Calendar:**
  - Visualize Task trên trục thời gian.
  - Kéo thả thân bar để đổi ngày, kéo thả viền để tạo Dependency (liên kết).
  - Tích hợp phát hiện vòng lặp (Cycle Detection) bằng Rust phía backend.

### 🎁 Giai đoạn 3 (Document & Search)
- [ ] **Full-Text Search Engine:**
  - Đọc nền nội dung file văn bản.
  - Tiền xử lý xóa dấu tiếng Việt.
  - Đẩy vào FTS5 Virtual Table. Tìm kiếm theo kiểu `MATCH`.
- [ ] **File Preview:**
  - Tích hợp Monaco Editor cho Text/Code.
  - Tích hợp PDF.js cho tài liệu.
  - Xử lý lock file thông minh bằng hệ thống I/O của Rust.

### 🧠 Giai đoạn 4 (AI/ML)
- [ ] Tích hợp mô hình ML Offline để phân tích rủi ro task hoặc gợi ý thời lượng task.

## 4. RỦI RO KỸ THUẬT & LƯU Ý
- **Tương thích ngược file `.pmp`:** Schema SQLite của C# EF Core có thể chứa các metadata đặc thù. Rust code phải map đúng schema cũ hoặc chạy migration script.
- **Hiệu năng IPC:** Việc pass dữ liệu lớn (như Gantt chart chứa vạn task) giữa Rust và webview có thể nghẽn. Cần thiết kế phân trang hoặc cơ chế delta-update thông qua Tauri Events thay vì Invoke nguyên cục.
- **Quản lý Process:** Việc đọc file nặng cần xử lý bằng `tokio::spawn` để không chặn Main thread của Rust/Tauri.
