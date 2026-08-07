# TÀI LIỆU CHI TIẾT UI/UX DỰ ÁN RUST CAD & GIS PRODUCT
Dự án: **RUST CAD & GIS Network Product (V1.2.0)**
Đơn vị tiêu chuẩn: **Design System Master (`design-system/MASTER.md`)**

---

## 1. Triết Lý Thiết Kế & Trải Nghiệm Người Dùng (UI/UX Philosophy)

Dự án RUST CAD & GIS Product là hệ điều hành phần mềm kỹ thuật dành cho các kỹ sư trắc địa, kỹ sư viễn thông và nhà quản lý bản đồ. Triết lý thiết kế tuân theo 4 trụ cột chính:

1. **High-Density Technical Desktop Workspace:** Tối ưu hóa không gian hiển thị tối đa cho bản đồ và bản vẽ CAD. Tránh các khoảng trắng thừa vãi (spacious whitespace) không cần thiết của web thông thường.
2. **Dual Theme Native System:** Hỗ trợ giao diện **CAD Dark Mode (Mặc định)** giúp bảo vệ mắt khi làm việc cường độ cao, cùng tùy chọn **CAD Light Mode** độ tương phản cao cho môi trường ngoài trời.
3. **Strict Chrome Dimension Consistency:** Tất cả các thanh công cụ, tiêu đề, thanh trạng thái có chiều cao cố định chính xác pixel, không bị co giãn bất thường.
4. **Fluid Accessibility & Keyboard First Workflow:** Đảm bảo mọi phím tắt CAD quen thuộc (`Ctrl+S`, `Escape`, `Delete`, phím mũi tên chuyển Tab) vận hành tức thì.

---

## 2. Hệ Thống Dual Theme System & Design Tokens

Màu sắc trong hệ thống được quản lý thông qua **CSS Variables (`--cad-*`)** kết hợp với `@theme` của Tailwind v4 (`--color-cad-*`). **Nghiêm cấm viết mã màu Hex trực tiếp trong components.**

### 2.1. Bảng Màu CAD Dark Mode (Chủ Đạo Mặc Định)

| Token Utility | Mã Hex | Vai trò & Ngữ cảnh sử dụng |
|---|---|---|
| `bg-cad-header` | `#101217` | Thanh tiêu đề ứng dụng (TitleBar), thanh điều khiển Window, Ribbon rail |
| `bg-cad-bg` | `#0F1115` | Nền móng ứng dụng đằng sau bản đồ & workspace |
| `bg-cad-surface` | `#171B21` | Nền chính của các Sidebar, Panel cố định, Card thông tin |
| `bg-cad-elevated` | `#20252D` | Nền các Modal, Hộp thoại nổi, Dòng được chọn, Popover menu |
| `border-cad-border` | `#2B313B` | Đường viền ngăn cách giữa các ô và bảng |
| `bg-cad-accent` | `#10B981` | Màu Xanh Emerald thương hiệu - Nút hành động chính (Primary Action) |
| `hover:bg-cad-active` | `#34D399` | Trạng thái di chuột vào nút Accent, điểm nổi bật active |
| `text-cad-warn` | `#F59E0B` | Cảnh báo hệ thống, Badge lưu ý |
| `text-cad-danger` | `#F87171` | Trạng thái lỗi, hành động xóa nguy hiểm |
| `text-cad-text-primary` | `#E5E7EB` | Văn bản chính, Tiêu đề, Thông số kỹ thuật |
| `text-cad-text-secondary` | `#9CA3AF` | Nhãn trường dữ liệu (Labels), Phụ đề |
| `text-cad-text-muted` | `#4B5563` | Thông tin phụ, Metadata, Đơn vị đo |

### 2.2. Bảng Màu CAD Light Mode

| Token Utility | Mã Hex | Vai trò & Ngữ cảnh sử dụng |
|---|---|---|
| `bg-cad-header` | `#F1F5F9` | Thanh TitleBar xám nhạt Slate |
| `bg-cad-bg` | `#F8FAFC` | Nền ứng dụng sáng Slate-50 |
| `bg-cad-surface` | `#FFFFFF` | Nền panel trắng tinh |
| `bg-cad-elevated` | `#F1F5F9` | Card nổi xám Slate nhạt |
| `border-cad-border` | `#CBD5E1` | Viền xám nhạt rõ nét |
| `bg-cad-accent` | `#059669` | Xanh lá Emerald đậm cho giao diện sáng |
| `text-cad-text-primary` | `#0F172A` | Chữ Slate-900 độ tương phản tuyệt đối |
| `text-cad-text-secondary` | `#334155` | Chữ phụ Slate-700 |
| `text-cad-text-muted` | `#64748B` | Chữ mờ Slate-500 |

---

## 3. Khung Bố Cục & Kích Thước Khung Khung Chrome (Chrome Dimensions)

Không gian làm việc được phân chia chính xác bằng các kích thước pixel cố định:

```
+-----------------------------------------------------------------------+  h-10 (40px)
| TitleBar (Tên dự án, Nút điều khiển Cửa sổ, Switch Theme, Lang)      |
+-----------------------------------------------------------------------+  h-9  (36px)
| Ribbon Tab Rail (Home | Design | Topology | Inventory | Reports)       |
+-----------------------------------------------------------------------+  h-[80px]
| Ribbon Action Band (Bộ công cụ Vẽ, Công cụ Đo, Lớp Bản đồ, Bóc bóc BOM)|
+-----------------------------------------------------------------------+
|  Left Dock |                                           | Right Dock   |
|  Panel     |          CAD Canvas Workspace             | Property     |
|  (Files /  |          (MapLibre GL / Map Engine)       | Panel        |
|   Layers)  |                                           | (Attributes) |
|            |                                           |              |
+-----------------------------------------------------------------------+  h-8 / h-6
| Command Line (Dòng nhập lệnh CAD & Gợi ý tham số)                      |
+-----------------------------------------------------------------------+  h-[22px]
| Status Bar (Tọa độ X,Y,Z | Hệ VN2000 | Tỷ lệ Scale | Kết nối Server)   |
+-----------------------------------------------------------------------+
```

| Thành phần | Kích thước | Class CSS tương ứng |
|---|---|---|
| Thanh tiêu đề (Title Bar) | 40px | `h-10` |
| Nút điều khiển window | 36px x 36px | `w-9 h-9` |
| Thanh Tab Ribbon | 36px | `h-9` |
| Băng nội dung Ribbon | 80px | `h-[80px]` |
| Thanh công cụ phụ (Toolbar) | 40px | `h-10` |
| Thanh trạng thái (Status Bar) | 22px | `h-[22px]` |
| Dòng dữ liệu chuẩn / Icon button | 32px | `h-8` |
| Dòng dữ liệu nén (Compact row) | 24px | `h-6` |

---

## 4. Thang Phân Lớp Màn Hình Z-Index Hierarchy

Do MapLibre GL và Leaflet chiếm dụng các khoảng z-index từ `200` đến `1000`, toàn bộ UI Chrome trên bản đồ phải bắt đầu từ `1100`:

| Token Name | Class Utility | Giá trị Z-Index | Phạm vi Áp dụng |
|---|---|---|---|
| `--z-index-cad-map-control` | `z-cad-map-control` | `1100` | Nút điều hướng bản đồ, công cụ tìm kiếm ghim trên Map |
| `--z-index-cad-panel` | `z-cad-panel` | `2000` | Các Sidebar cố định, TreeView tệp tin |
| `--z-index-cad-floating` | `z-cad-floating` | `2200` | Các Palette kéo thả tự do trên bản đồ |
| `--z-index-cad-dropdown` | `z-cad-dropdown` | `3000` | Dropdown Menu, Context Menu khi nhấp chuột phải |
| `--z-index-cad-overlay` | `z-cad-overlay` | `4000` | Màn mờ làm tối nền khi mở Modal (Scrim) |
| `--z-index-cad-modal` | `z-cad-modal` | `4100` | Hộp thoại Modal chính |
| `--z-index-cad-modal-nested` | `z-cad-modal-nested` | `4200` | Modal con bật ra từ trong Modal mẹ |
| `--z-index-cad-toast` | `z-cad-toast` | `5000` | Thông báo nổi dạng Toast thông tin / cảnh báo |
| `--z-index-cad-tooltip` | `z-cad-tooltip` | `5500` | Chú thích nhanh khi rê chuột (Tooltip) |
| `--z-index-cad-debug` | `z-cad-debug` | `6000` | Màn hình hiển thị FPS và thông số Debug |

---

## 5. Quy Chuẩn Typography & Font Hierarchy

- **UI Label & Body Copy:** Sử dụng `Inter`, `"Segoe UI"`, `Roboto`, `sans-serif` (`font-sans`).
- **Thông Số Kỹ Thuật & Tọa Độ:** Bắt buộc sử dụng Monospace Font `"Roboto Mono"`, `monospace` (`font-mono`) cho các tham số tọa độ GPS/VN2000, độ dài cáp quang, góc quay và mã vật tư để tránh xê dịch layout khi số nhảy.
- **Tiêu đề Nhãn Ribbon:** Sử dụng chữ in hoa `font-black`, `tracking-[0.16em]`, `text-[10px]` theo chuẩn giao diện kỹ thuật chuyên nghiệp.

---

## 6. Thành Phần Linh Kiện (Component System Rules)

1. **Buttons (`src/modules/design/components/ui/Button.tsx`):**
   - **Primary (`cad-button-primary`):** Nút hành động chính duy nhất trên một màn hình, nền màu Emerald Accent `#10B981`, chữ màu đen vòm chữ đậm.
   - **Secondary (`cad-button-secondary`):** Nút phụ, viền nén `border-cad-border`.
   - **Ghost (`cad-button-ghost`):** Nút không viền, hiển thị nền mờ khi rê chuột.
   - **Danger (`cad-button-danger`):** Dành cho thao tác xóa dữ liệu / hủy liên kết.
2. **Property Panel (`src/modules/design/components/core/PropertyPanel.tsx`):**
   - Thiết kế dạng lưới 2 cột nén (Label bên trái `text-cad-text-secondary`, Value bên phải `font-mono text-cad-text-primary`).
   - Tích hợp công cụ chỉnh sửa thuộc tính trực tiếp (Inline Editing).
3. **BOM Summary Panel & Analysis Table (`AnalysisTable.tsx`):**
   - Sử dụng bảng cuộn ảo (Virtual Scrolling qua `react-virtuoso`) xử lý hàng chục ngàn dòng dữ liệu mượt mà.
   - Header cố định (Sticky Header) với viền mỏng hairline `1px`.
4. **Modal Dialogs:**
   - Luôn sử dụng `<Portal>` đưa hộp thoại ra `#portal-root` ngoài cùng.
   - Hỗ trợ đóng nhanh bằng phím `Escape` và giữ tiêu điểm (Focus Trap).

---

## 7. Trạng Thái Tương Tác & Micro-Animations

- **Hover States:** Di chuyển chuột lên ô hoặc card hiển thị hiệu ứng đổi màu bề mặt mượt mà `transition-colors duration-200 hover:bg-cad-elevated`.
- **Active & Selection Ring:** Phần tử đang chọn nhận trạng thái `bg-cad-accent/10 text-cad-accent border-cad-accent/30`. Focus Ring chuẩn WCAG 2px viền Emerald + 2px khoảng lùi.
- **Chế Độ Low Power Mode (`.low-power-active`):** Tự động vô hiệu hóa toàn bộ hiệu ứng `backdrop-blur`, hiệu ứng đổ bóng `shadow` và animation khi hệ thống phát hiện thiết bị pin yếu hoặc cần ưu tiên tốc độ xử lý bản đồ nặng.

---

## 8. Hỗ Trợ Đa Ngôn Ngữ (i18n) & Chuẩn Accessibility (a11y)

- **Đa Ngôn Ngữ:** 100% văn bản giao diện (Title, Placeholder, Tooltip, Alt) được gọi qua hook `useTranslation()` từ `react-i18next`. Hỗ trợ song ngữ Tiếng Việt (`vi`) và Tiếng Anh (`en`).
- **Accessibility:**
  - Tất cả các nút bấm chỉ chứa Icon bắt buộc có thuộc tính `aria-label`.
  - Icon trang trí mang `aria-hidden="true"`.
  - Giữ nguyên đường viền chọn bằng phím Tab (`:focus-visible`).
