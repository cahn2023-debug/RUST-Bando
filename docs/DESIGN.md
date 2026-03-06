# 🎨 DESIGN: Offline Project Manager Pro Max

**Ngày cập nhật:** 24/02/2026
**Mục tiêu:** Kế thừa UI/UX Pro Max từ bản C#, tối ưu hoá lại bằng TailwindCSS/React. Thiết kế giao diện Data-heavy (hiển thị nhiều dữ liệu như VSCode, Notion) nhưng vẫn thoáng mắt, hiện đại.

---

## 1. HỆ THỐNG MÀU SẮC (VSCODE DARK THEME INSPIRED)

| Thành phần | Mã màu Hex | Tên biến Tailwind | Mục đích |
|---|---|---|---|
| **Background (Sâu)** | `#111111` | `bg-surface-50` | Nền chính của ứng dụng, Sidebar ngoài cùng. |
| **Workspace** | `#18181A` | `bg-surface-100` | Khu vực Center Workspace, Panels chính. |
| **Borders (Đường viền)** | `#27272A` | `border-surface-200` | Dùng để phân tách các khu vực 4-Pane. Giữ sự mỏng nhẹ. |
| **Accent / Primary** | `#3b82f6` | `bg-brand-500` | Nút bấm chính, viền Input Focus, Hover items. |
| **Success (Hoàn thành)** | `#10b981` | `bg-emerald-500` | Task đã hoàn thành, Thanh trạng thái đồng bộ. |
| **Text Primary** | `#FAFAFA` | `text-surface-900` | Tiêu đề, dữ liệu quan trọng, Task Name. |
| **Text Muted** | `#A1A1AA` | `text-surface-500` | Subtitle, Placeholder, Dữ liệu phụ. |

## 2. TYPOGRAPHY (FONT CHỮ)

- **Font Family:** `Inter`, `Segoe UI`, `sans-serif`. Mặc định của hệ điều hành để đảm bảo Native Desktop app feel.
- **Tiêu đề App/Menu:** 16px - 18px, Font Weight 600 (Semi-bold).
- **Lưới dữ liệu (Data Grid & Tree View):** 11px - 12px. Nhỏ gọn để hiển thị lượng lớn file và task (tham khảo VSCode explorer).
- **Ngày tháng & Số liệu:** Dùng `font-mono` với thuộc tính `tracking-tighter` để các con số thẳng hàng nhau.

## 3. LAYOUT CẤU TRÚC 4-PANE BẤT CHIẾN BẠI

Cấu trúc này loại bỏ sự phụ thuộc quá nhiều vào màn hình phụ bằng cách gộp tất cả công cụ vào 1 màn hình duy nhất nhưng có thể thu phóng linh hoạt.

1. **Nav Bar (Trên cùng, cao 40px):**
   - Chứa thanh Search "Spotlight" (nhấn `Ctrl+K`)
   - Nút quản lý môi trường, đồng bộ dữ liệu.
2. **Project Explorer (Trái, rộng 250px):**
   - Chứa TreeView đệ quy các Folder và File (`FolderTree`, `FileItem`).
   - Có thể ẩn đi nếu chỉ tập trung xem Gantt.
3. **Task & Notes Panel (Phải, rộng 300px):**
   - Nơi xem thông số dự án (`StatCard`).
   - Nơi Input thông tin Task, hiển thị Note theo mô hình Kanban thẳng đứng.
4. **Workspace (Giữa):**
   - **Nửa trên:** Khu vực File Preview (Monaco Editor cho Code, PDF renderer).
   - **Nửa dưới:** Data Grid chia làm 2 - Bảng nhập liệu bên trái (rộng 450px) và Gantt Chart bên phải tự cuộn.

## 4. UI/UX PATTERNS QUAN TRỌNG

- **Skeleton Loading:**
  - Áp dụng triệt để cho mọi Data fetching call từ Rust `invoke`.
  - Không dùng Spinner xoay giữa đường, thay vào đó là bộ xương `animate-pulse` cho lưới Grid và dải băng Gantt.
- **Contextual Empty States:**
  - Nếu List trống -> Hiện Icon folder lớn, viền dashed mờ, câu call-to-action "Create your first project".
- **Glassmorphism:**
  - Form nhập liệu mới (Modals, Dropdowns) thả nổi trên nền làm mờ `backdrop-blur-sm`, hộp shadow mềm mại.
- **Custom Native Scrollbar:**
  - Thanh cuộn của Windows mặc định rất xấu, ghi đè bằng CSS `::-webkit-scrollbar` ẩn hoặc bé chỉ 10px, làm tròn góc.
- **Optimistic UI:**
  - Click Checkbox hoàn thành Task -> UI cập nhật gạch bỏ task ngay lập tức, ngầm gọi Rust API lưu dưới bg.
