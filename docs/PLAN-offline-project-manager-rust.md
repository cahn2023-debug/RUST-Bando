# 📋 PLAN: Offline Project Manager (Rust Migration)

**Ngày cập nhật:** 24/02/2026

Dựa trên yêu cầu từ `docs/SPECS.md`, bản kế hoạch này định tuyến các bước để chuyển đổi Offline Project Manager từ C# sang Rust & Tauri.

## 🎯 GIAI ĐOẠN 1: FOUNDATION & UI BỘ KHUNG (Đã thực hiện 80%)
**Trọng tâm:** Khởi tạo Tauri, React, cấu trúc thư mục 4-Pane Layout.
- **Frontend Specialist:** Hoàn thành khung giao diện `App.tsx`, `ProjectDetail.tsx`.
- **Database Architect:** Thiết lập kết nối cơ bản với SQLite qua Rust (`rusqlite`) lấy danh sách Project.
- **UI/UX Designer:** Cài đặt các Skeleton loader và Empty State chuẩn mực `react-ui-patterns`.

## 🏗️ GIAI ĐOẠN 2: PROJECT EXPLORER & KANBAN THỰC TẾ
**Trọng tâm:** Kết nối file hệ thống và luồng dữ liệu Task thực tế.
- **Backend Specialist:**
  - Viết module File Walker bằng Rust để map thư mục dự án (Tree View).
  - Tích hợp `notify` crate để theo dõi thay đổi thư mục thời gian thực.
  - CRUD API cho bảng `Tasks` (Drag & Drop support).
- **Frontend Specialist:**
  - Xây component `FolderTree` đệ quy để hiển thị File map hiện tại.
  - Bổ sung React-dnd (Kéo thả) cho Kanban Board. Context-aware creation cho Task/Note dựa trên tree-item được chọn.

## 📅 GIAI ĐOẠN 3: ĐỒNG BỘ GANTT CHART & LỊCH TRÌNH
**Trọng tâm:** Chuyển đổi công cụ Gantt.
- **Frontend Specialist:**
  - Nâng cấp `GanttWorkspace.tsx`. Kéo thả edge của thân bar để thay đổi timeline.
  - Phác thảo thuật toán Dependency lines (mũi tên nối).
- **Backend/Performance Optimizer:**
  - Xử lý Cycle Detection (Chống vòng lặp vô hạn) qua graph algorithms của Rust trước khi lưu vào SQLite.
  - Pagination hoặc Lazy Loading nếu user có 1 vạn tasks để UI web không bị đơ.

## 🔍 GIAI ĐOẠN 4: FULL-TEXT SEARCH & TÀI LIỆU
**Trọng tâm:** Động cơ cốt lõi khiến App C# nổi bật.
- **Database Architect:** Khởi tạo FTS5 Virtual Table với cấu hình `tokenize = "unicode61"`.
- **Backend Specialist:**
  - System background task (dùng `std::thread` / Tokio) ngầm quét file `.pdf`, `.docx`, `.xlsx`.
  - Nếu crate Rust thiếu tính năng, sử dụng IPC hoặc `std::process::Command` để gọi Python local extractor (vẫn nằm gọn trong file offline).
  - Tạo Trigger SQLite tự đẩy dữ liệu parse vào FTS.
- **Frontend Specialist:** Khung search (Spotlight-like `Ctrl+K`) tìm mọi thứ từ nội dung đến tiêu đề.

## 🖼️ GIAI ĐOẠN 5: BỘ XEM TRƯỚC (FILE PREVIEW)
**Trọng tâm:** Thay thế WebView2/AvalonEdit.
- **Frontend Specialist:** WebView của Tauri hỗ trợ sẵn HTML/PDF.
- Xây dựng TextPreview (Dùng thư viện Monaco Editor component vì nó hỗ trợ highlight 100 ngôn ngữ chuẩn VSCode).
- Xây dựng ExcelPreview / HTML render.

## 🤖 GIAI ĐOẠN 6: MACHINE LEARNING OFFLINE
**Trọng tâm:** Cải tạo từ ML.NET sang thế giới AI/ML của Rust.
- **AI Engineer:**
  - Thử nghiệm `linfa` cho Logistic Regression dự đoán rủi ro (Risk prediction).
  - Hoặc nhúng `ort` (ONNX) để chạy các pre-trained ML models siêu nhẹ và Offline. 

## 🛡️ GIAI ĐOẠN 7: OPTIMIZATION & RELEASE
- **DevOps/Performance Engineer:** Set profile Cargo release `lto = true`, `strip = true`. Đóng gói bộ installer `.msi` siêu nhẹ bằng Tauri Bundler.
- **Security Auditor:** Bảo vệ Injection từ đầu vào Full Text Search.

---
**Agent Assignments:**
1. `project-planner`: Duyệt kế hoạch, theo dõi Phase thay đổi.
2. `frontend-specialist`: Giao diện React & Gantt.
3. `backend-specialist`: Xử lý I/O, IPC Rust.
4. `database-architect`: FTS5 & Optimization SQLite.
