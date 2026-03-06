# 💡 BRIEF: Nâng Cấp Hoàn Toàn Theo Architect C# WPF -> RUST TAURI

**Ngày tạo:** 25/02/2026
**Tài liệu tham chiếu:** `PROJECT_REVIEW_260224.md`

---

## 1. VẤN ĐỀ VÀ MỤC TIÊU
Hoàn thiện dự án Offline Project Manager phiên bản **Rust/Tauri + React** để đạt mức parity (tương đương 100% tính năng) hoặc vượt trội hơn so với bản gốc **C# WPF**. 
Mặc dù đã hoàn thành Nền tảng Core, Preview, và Right Panel (Task/Note/Contract, Gantt cơ bản), vẫn còn thiếu các module tương tác hình ảnh, Kanban, và đồng bộ Focus để tạo cảm giác "Pro Max" như bản C#.

## 2. HIỆN TRẠNG (WHAT WE HAVE)
✅ **Project Explorer:** TreeView ánh xạ ổ cứng.
✅ **Full-Text Search (Backend):** FTS5 SQLite đã index nền.
✅ **Preview:** React Monaco Editor & Iframe WebView hoàn thiện tốc độ chớp mắt. Magic Select (context menu add to Task/Note).
✅ **Data Grid / Task / Contract / Notes:** Khung giao diện linh hoạt, Backend hoàn chỉnh. Task grouping đệ quy tính thời gian. Kéo thả Gantt cơ bản.

## 3. CÁC TÍNH NĂNG CÒN THIẾU VS C# BẢN GỐC (GAP ANALYSIS)

### 🚀 MVP Gap (Cần hoàn thiện ngay để đạt chuẩn C#):
- [ ] **Context-aware creation:** Nút Add Note/Task trên Toolbar của File Preview, tự động lấy đường dẫn file đang mở (gắn vào tệp).
- [ ] **Search Engine UI:** Khung UI tìm kiếm FTS5 và List kết quả -> Click để mở file & tô sáng.
- [ ] **Kanban Board:** Giao diện cột kéo thả (Todo, In Progress, Done) cho Task hiện tại. Thay vì chỉ có Grid View.
- [ ] **Dependencies (Gantt) & Cycle Detection:** Nối lịch các task báo lỗi đụng độ, đồng bộ Focus qua lại giữa Gantt và tệp tin.

### 🎁 Phase 2 (Nâng cấp Pro Max):
- [ ] **Biểu đồ Lịch (Calendar View):** Nhìn lịch theo tháng.
- [ ] **Machine Learning Tích cực (Rust/Tauri):** Gọi Endpoint AI/ML để phân tích và đánh giá rủi ro (Giả lập giống C#).
- [ ] **Tính năng Hợp đồng:** Map document vào contract chưa có UI bấm.

## 4. CHIẾN LƯỢC CỤ THỂ

- **Frontend (Tauri + React + Tailwind):** 
   - Ứng dụng `react-ui-patterns` -> Mọi tương tác không được giật lag (Optimistic UI). Kéo Kanban, vẽ SVG Path cho Arrow Dependency trên Gantt.
   - Thêm Context Panel / View Toggle trên Navbar để linh động chuyển chế độ xem.
- **Backend (Rust):** 
   - Rust đã hoàn chỉnh phần lớn schema. Gồm Task `target_file_path`, Search SQLite. Mở rộng thêm command cho Dependencies link nếu cần, hoặc quản lý trong Frontend state.

## 5. BƯỚC TIẾP THEO
→ Review bản Brief này, sau đó chạy `/plan` hoặc bắt tay thiết kế và cấu trúc Kanban / Search UI ngay tức khắc!
