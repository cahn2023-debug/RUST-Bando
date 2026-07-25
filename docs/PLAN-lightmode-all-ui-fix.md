# Implementation Plan: Chuyển Đổi Toàn Bộ Giao Diện Sang Light Mode & Tối Ưu Tương Phản Text

Khắc phục triệt để tình trạng các Sidebar bên phải (PropertyPanel, Spec Panel, Camera View, Device Configure, Inspector), Modals, Toolbars và Popups còn bị giữ màu tối hoặc chữ bị chìm/khó đọc khi bật Light Mode. Chuyển toàn bộ thành phần UI sang CSS Theme Tokens chuẩn để hiển thị sáng rõ 100% trong Light Mode.

---

## User Review Required

> [!IMPORTANT]
> **Các quyết định kiến trúc chính (Đã thống nhất qua `/grill-me`):**
> 1. **Phạm vi chuyển đổi**: Thay thế toàn bộ các màu nền/viền/chữ hardcode tối (`bg-[#1e1e1e]`, `bg-[#111]`, `bg-[#1A1A1A]`, `border-[#333]`, `text-white`) trong Sidebar phải, Explorer, TopToolbar, TitleBar, Modals và Popups sang các CSS variables linh hoạt (`bg-cad-surface`, `bg-cad-elevated`, `bg-cad-bg`, `border-cad-border`, `text-cad-text-primary`, `text-cad-text-secondary`, `text-cad-text-muted`).
> 2. **Bảng màu Light Mode tối ưu**: 
>    - Nền chính ứng dụng: `#F8FAFC`
>    - Nền Sidebar / Cards / Modals: `#FFFFFF`
>    - Nền Elevated surfaces: `#F1F5F9`
>    - Viền phân cách: `#CBD5E1`
>    - Chữ chính (High Contrast): `#0F172A` (Tương phản ~15:1)
>    - Chữ phụ: `#334155`
>    - Chữ muted: `#64748B`

---

## Open Questions

Không có. (Tất cả câu hỏi đã được làm rõ và thống nhất qua `/grill-me`).

---

## Proposed Changes

### 1. CSS Design Tokens & Utilities

#### [MODIFY] [index.css](file:///d:/Code%20Antinigaty/RUST/src/modules/design/index.css)
- Tinh chỉnh Palette Light Mode (`[data-theme="light"]`) đảm bảo độ tương phản chữ >= 4.5:1.
- Cập nhật các utility classes `.cad-panel`, `.cad-panel-strong`, `.cad-card`, `.cad-dialog`, `.cad-toolbar`, `.cad-statusbar`, `.cad-input`, `.cad-select`, `.cad-button` và scrollbars tương thích mượt mà giữa Dark và Light Mode.

---

### 2. TitleBar, Toolbar & Top Navigation

#### [MODIFY] [TitleBar.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/ui/TitleBar.tsx)
- Thay thế các class hardcode `bg-[#2B2B2B]`, `border-[#1A1A1A]`, `bg-[#1A1A1A]` bằng `bg-cad-header`, `border-cad-border`, `bg-cad-surface`, `text-cad-text-primary`.

#### [MODIFY] [TopToolbar.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/ui/TopToolbar.tsx)
- Đảm bảo thanh công cụ trên cùng chuyển đổi màu nền và màu chữ chính xác theo theme.

---

### 3. Right Sidebars & CAD Panels (Thông số thiết kế, Camera View, Device Configure, Inspector)

#### [MODIFY] [PropertyPanel.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/core/PropertyPanel.tsx) & [PropertyFields.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/core/PropertyPanel/PropertyFields.tsx)
- Chuyển đổi khung ngoài `aside`, các khối thông số thiết kế, inputs, selects, buttons từ màu tối cố định `#1e1e1e` sang `bg-cad-surface`, `bg-cad-elevated`, `border-cad-border`, `text-cad-text-primary`.

#### [MODIFY] [CameraViewPanel.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/features/map/Palette/CameraViewPanel.tsx)
- Cập nhật màu nền panel và text xem thử camera hiển thị sáng rõ trong Light Mode.

#### [MODIFY] [DeviceConfigPanel.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/features/map/Palette/DeviceConfigPanel.tsx)
- Chuyển đổi giao diện cấu hình thiết bị sang theme light tokens.

#### [MODIFY] CAD Sidebar Modals / Explorer Panels
- Cập nhật `DrawingExplorer.tsx`, `ExplorerModals.tsx`, `Inspector` panels để đồng bộ màu nền và màu chữ.

---

### 4. Modals, Popups & Map Overlays

#### [MODIFY] Popups & Tooltips trên Bản đồ
- Cập nhật styling cho popup bản đồ, tọa độ click, và tooltip để chữ hiển thị rõ nét trên cả 2 chế độ sáng/tối.

---

## Verification Plan

### Automated Verification
1. Chạy `npm run typecheck` (`tsc --noEmit`) đảm bảo không có lỗi type.
2. Chạy `npx vitest run` kiểm tra lại toàn bộ suite test.

### Manual Verification
1. **Kiểm tra Light Mode**:
   - Toggle sang Light Mode.
   - Quan sát toàn bộ màn hình: TitleBar, Ribbon, Left Sidebar, Map controls, Right Sidebars (Thông số thiết kế, Camera View, Cấu hình thiết bị), Network Graph Inspector.
   - Xác nhận 100% bề mặt chuyển sang nền sáng (`#FFFFFF` / `#F8FAFC`).
   - Xác nhận văn bản (tiêu đề, nhãn, dữ liệu, inputs) đều có màu đen/slate đậm (`#0F172A`), đọc cực kỳ rõ nét, không còn chữ tối trên nền tối hay chữ trắng bị chìm.
2. **Kiểm tra Dark Mode**:
   - Toggle ngược lại Dark Mode.
   - Đảm bảo ứng dụng quay về CAD Dark mượt mà không bị hỏng giao diện.
