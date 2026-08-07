# 💡 BRIEF: Tối ưu hoá Kiến trúc Dữ liệu - File PMP (Portable Project Manager)

**Ngày tạo:** 24/02/2026

---

## 1. VẤN ĐỀ CẦN GIẢI QUYẾT
- Hiện tại CSDL SQLite của phần mềm đang được lưu ở một thư mục cố định (ví dụ `AppData/Roaming/BMAD_Manager/manager.sqlite`).
- Gây khó khăn khi muốn chép toàn bộ dự án sang máy khác, backup dữ liệu, hoặc quản lý vòng đời của dự án một cách riêng biệt vì các project bị hoà trộn chung trong 1 Database.
- Lo ngại về việc localhost/web-server đang chạy ngầm trong phần mềm offline.

## 2. GIẢI PHÁP ĐỀ XUẤT (THE PMP MODEL)
1. **Làm rõ về Localhost**: Khẳng định phần mềm không chạy localhost ở bản `.exe` cuối cùng. Nó dùng giao thức cục bộ `tauri://`.
2. **Kiến trúc File `.pmp`**: Tương tự như file `.mpp` của MS Project.
   - Khi người dùng khởi tạo 1 dự án trên phần mềm -> Phần mềm sẽ tạo ra một file tên là `[Ten_Du_An].pmp` (thực chất là một file SQLite Database đổi đuôi) lưu ngay bên trong thư mục dự án đó.
   - File `.pmp` này sẽ lưu trữ: Nhiệm vụ (Tasks), Cột mốc (Dependencies), Ghi chú (Notes), và Chỉ mục tìm kiếm (FTS Index) nội bộ của dự án đó.
   - **Hoạt động không chạm file gốc**: Dữ liệu thật (PDF, Excel, Word) giữ nguyên, `.pmp` chỉ lưu metadata và tag.
   - **Siêu linh hoạt**: Người dùng copy nguyên thư mục vứt sang máy tính khác, click đúp (hoặc File > Open) chọn file `.pmp` là phần mềm sẽ load lại 100% tình trạng công việc.

## 3. ĐỐI TƯỢNG SỬ DỤNG
- Kỹ sư, Quản lý dự án, Cá nhân làm việc độc lập.
- Các Team cần share offline toàn bộ thư mục dự án qua USB hoặc cục bộ LAN.

## 4. TÍNH NĂNG (BẮT BUỘC ĐỂ CHUYỂN ĐỔI - MVP)

### 🚀 MVP (Bắt buộc có):
- [ ] Xoá bỏ quản lý CSDL tập trung ở `AppData`, chuyển Database Connection thành Dynamic (Tham số đường dẫn).
- [ ] Chức năng `File > New Project`: Chọn thư mục -> Khởi tạo file `manager.pmp` (schema chuẩn) tại thư mục đó.
- [ ] Chức năng `File > Open Project`: Browse chọn tới file `.pmp` -> Load Connection và đọc dữ liệu.
- [ ] Lưu lịch sử "Recent Projects" (cái này lưu ở `AppData` dưới dạng 1 file config nhỏ `settings.json` chỉ chứa đường dẫn các `.pmp` mờ gần đây).

### 💭 Phase Tiếp Theo (Làm sau):
- [ ] Tính năng Archive / Backup (Zip toàn bộ thư mục + file .pmp) thành file nén 1 click.
- [ ] Thiết lập file association trong Windows Registry để click đúp file `.pmp` tự động mở BMAD Manager.

## 6. ƯỚC TÍNH SƠ BỘ
- **Độ phức tạp:** Trung bình (Cần refactor lại Backend State trong Rust `src-tauri` để Connection Pool nhận path linh hoạt thay vì fix cứng).
- **Rủi ro:** Migration dữ liệu cũ (nếu có) bị mất khi đập bỏ cấu trúc DB cũ. Cần thông báo xoá luồng DB phiên bản trước.

## 7. BƯỚC TIẾP THEO
→ Xác nhận cấu trúc và chạy `/plan` để lên sơ đồ Code File Structure cho Tauri.
