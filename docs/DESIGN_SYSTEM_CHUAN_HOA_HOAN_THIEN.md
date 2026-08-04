# DESIGN SYSTEM — KẾ HOẠCH CHUẨN HÓA GIAO DIỆN (BẢN HOÀN THIỆN)
**Dự án:** RUST CAD & GIS Network Product (V1.2.0)
**Phiên bản:** Hoàn thiện — có đề xuất cụ thể Icon & Màu sắc, sẵn sàng triển khai

> Tài liệu này kế thừa bản audit trước đó (`KE_HOACH_CHUAN_HOA_GIAO_DIEN.md`) và **chốt cụ thể** toàn bộ icon, mã màu, kích thước, để đội dev có thể bắt tay code ngay mà không cần chờ xác nhận thêm.

---

## 1. Nguyên Tắc Cốt Lõi (áp dụng xuyên suốt)

**Nguyên tắc phân lớp màu — quan trọng nhất, giải quyết mọi xung đột màu:**

> **Màu Loại Vật Tư (Type Color)** = màu fill/icon cố định, thể hiện *danh tính* đối tượng (Cột luôn nâu, ODF luôn tím...).
> **Màu Trạng Thái (State Color)** = luôn thể hiện qua **viền/ring/glow bao quanh**, không bao giờ thay fill gốc.

→ Nhờ vậy, một Cột điện (nâu) khi được chọn vẫn giữ màu nâu nhưng có thêm viền sáng Emerald bao quanh — không bao giờ nhầm giữa "đây là loại gì" và "đây đang ở trạng thái gì".

---

## 2. HỆ THỐNG ICON — Đề Xuất Cụ Thể

### 2.1. Thư viện icon nền (UI Chrome)

**Đề xuất: [Lucide Icons](https://lucide.dev)** (bộ icon outline, MIT license, có sẵn dạng React component `lucide-react`).

Lý do chọn:
- Toàn bộ icon cùng 1 grid `24x24`, cùng `stroke-width` mặc định — khớp thẳng với triết lý "High-Density Technical Workspace" đã có.
- Có sẵn rất nhiều icon đúng ngữ cảnh kỹ thuật/bản đồ (utility pole, camera, split, server, ruler, magnet...) — không phải tự vẽ từ đầu cho phần UI Chrome.
- Tree-shakeable, nhẹ, dễ tuỳ biến màu qua `currentColor` → ăn khớp hoàn toàn với token màu.

### 2.2. Specsheet Icon (áp dụng cho MỌI icon trong hệ thống, kể cả icon vật tư tự vẽ)

| Thuộc tính | Giá trị chuẩn |
| :--- | :--- |
| ViewBox | `0 0 24 24` |
| Stroke width | `1.75px` (cố định cho toàn bộ icon outline) |
| Line cap / join | `round` / `round` |
| Grid cỡ hiển thị | `16px` (inline/label), `20px` (nút Ribbon, Tree), `24px` (nút hành động chính), `32px` (Marker chính trên bản đồ ở zoom cao) |
| Màu | Luôn dùng `currentColor`, không hardcode hex trong file SVG |
| Góc bo icon nền (nếu có khung) | `rounded-md` (6px) đồng bộ với bo góc Panel/Card |

### 2.3. Bảng Icon UI Chrome (đề xuất cụ thể — dùng Lucide)

| Khu vực | Chức năng | Icon Lucide đề xuất |
| :--- | :--- | :--- |
| TitleBar | Save | `Save` |
| TitleBar | Force Save / Syncing | `RefreshCw` (xoay khi đang sync) |
| TitleBar | Theme Switcher | `SunMoon` |
| TitleBar | Language Switcher | `Languages` |
| TitleBar | Minimize / Maximize / Close | `Minus` / `Square` / `X` |
| Ribbon – Vẽ | Vẽ điểm (Node) | `MapPin` |
| Ribbon – Vẽ | Vẽ tuyến (Polyline) | `Spline` |
| Ribbon – Vẽ | Vẽ vùng (Polygon) | `Hexagon` |
| Ribbon – Snap & Edit | Snap to Vertex/Midpoint | `Magnet` |
| Ribbon – Snap & Edit | Di chuyển đối tượng | `Move` |
| Ribbon – Snap & Edit | Chỉnh đỉnh Polyline | `PenTool` |
| Ribbon – Topology | Sơ đồ đấu nối (React Flow) | `Workflow` |
| Ribbon – Topology | Quản lý vật tư mạng | `Boxes` |
| Ribbon – Đo đạc | Đo chiều dài/diện tích | `Ruler` |
| Ribbon – Đo đạc | FOV / DORI Camera Coverage | `ScanEye` |
| Ribbon – Đo đạc | Street View (Pegman) | `PersonStanding` |
| Ribbon – Báo cáo | BOM Summary | `ClipboardList` |
| Ribbon – Báo cáo | Analysis Table | `Table2` |
| Ribbon – Báo cáo | Export Word/.docx | `FileText` |
| Ribbon – Báo cáo | Export GeoJSON/DXF | `FileCode` |
| Ribbon – Báo cáo | Export Excel | `FileSpreadsheet` |
| Left Dock | `is_visible` bật/tắt | `Eye` / `EyeOff` |
| Left Dock | `is_locked` khóa | `Lock` / `LockOpen` |
| Left Dock | `color_picker` | `Palette` |
| Left Dock | Cây thư mục | `FolderTree` |
| Map Toolbar | Zoom in/out | `ZoomIn` / `ZoomOut` |
| Map Toolbar | Zoom Extent | `Scan` |
| Map Toolbar | Map Style Selector | `Layers` |
| Command Line | Icon dòng lệnh | `Terminal` |
| Status Bar | Kết nối / đồng bộ | `Wifi` / `WifiOff` |
| Property Panel | Ảnh đính kèm | `ImagePlus` |
| Box Selection Summary | Copy to TSV | `ClipboardCopy` |

### 2.4. Bảng Icon Đối Tượng Bản Đồ (Vật tư kỹ thuật — Point Features)

Vì Lucide không có icon chuyên ngành viễn thông, các icon này **tự vẽ theo Specsheet mục 2.2**, nhưng vẫn ưu tiên tái dùng hình dạng gần nhất của Lucide làm khung tham chiếu để giữ phong cách đồng bộ:

| Loại vật tư | Icon đề xuất | Ghi chú hình dạng |
| :--- | :--- | :--- |
| Cột điện (Pole) | `UtilityPole` (có sẵn trong Lucide) | Dùng thẳng, không cần vẽ lại |
| Tủ cáp (Cabinet) | Tự vẽ dạng "hộp đứng có khe" — tham khảo khung `Archive` | Hình chữ nhật đứng, 2 vạch ngang thể hiện khe cáp |
| Măng xông (Splice Closure) | Tự vẽ dạng "viên con nhộng" (capsule nằm ngang) | Hình oval kéo dài, đơn giản hoá tối đa để nhìn rõ ở zoom thấp |
| ODF (Optical Distribution Frame) | `Server` | Icon rack có các khe ngang — đúng ngữ nghĩa phân phối tín hiệu |
| Splitter (bộ chia quang) | `Split` (có sẵn trong Lucide — đúng nghĩa "chia nhánh") | Dùng thẳng |
| Camera CCTV | `Camera` (dùng cho icon tĩnh) / `Video` (nếu cần phân biệt camera quay quét) | Dùng thẳng |
| Node giao cắt chung (Intersection) | `CircleDot` | Dùng cho điểm giao cắt không thuộc loại nào ở trên |

### 2.5. Icon cho Line & Polygon Features

| Loại | Icon dùng cho Legend/Chú giải | Cách vẽ trên bản đồ |
| :--- | :--- | :--- |
| Cáp quang (Fiber Polyline) | `Cable` | Không dùng icon điểm — vẽ nét line màu theo bảng màu mục 3.4 |
| Tuyến cống bể | `MoveHorizontal` hoặc line nét đứt riêng | Line nét đứt, màu trung tính `--cad-color-conduit` |
| Thửa đất (Land Parcel) | `LandPlot` (có sẵn trong Lucide) | Polygon fill mờ + viền nét liền |
| Khu nhà trạm | `Building2` | Polygon fill mờ + viền nét liền, màu riêng |
| Vùng quy hoạch | `MapPinned` | Polygon fill mờ, viền nét đứt (thể hiện tính "dự kiến/chưa chốt") |

---

## 3. HỆ THỐNG MÀU SẮC — Đề Xuất Cụ Thể

### 3.1. Bảng Màu Trạng Thái (Semantic / State — dùng CHUNG toàn hệ thống, luôn là viền/overlay)

| Trạng thái | Token | Mã màu | Áp dụng |
| :--- | :--- | :--- | :--- |
| Đang chọn (Selected) | `--cad-state-selected` | `#10B981` (giữ nguyên Emerald Accent hiện có) | Viền phát sáng quanh đối tượng, handle chỉnh sửa |
| Di chuột (Hover) | `--cad-state-hover` | `#E5E7EB` ở Dark / `#334155` ở Light (dùng màu text-secondary, độ mờ 40%) | Viền mảnh trung tính, không cạnh tranh với Selected |
| Đang vẽ / Snap (Draft) | `--cad-state-drawing` | `#3B82F6` (Blue 500) | Nét đứt khi vẽ, vòng tròn snap điểm nối |
| Quét vùng chọn (Box Select) | `--cad-state-boxselect` | `#06B6D4` (Cyan 500), nền `rgba(6,182,212,0.15)` | Khung chữ nhật khi Shift+Drag |
| Cảnh báo (Warning) | `--cad-state-warning` | `#F59E0B` (Amber 500) | Thiếu thuộc tính, suy hao cáp vượt ngưỡng |
| Lỗi (Error) | `--cad-state-error` | `#EF4444` (Red 500) | Đứt tuyến, lỗi dữ liệu tọa độ |
| Bị khóa (Locked) | `--cad-state-locked` | `#64748B` (Slate 500) | Icon khóa + overlay chéo nhẹ trên đối tượng bị khóa |
| Vô hiệu hóa (Disabled) | `--cad-state-disabled` | `#4B5563` opacity 50% | Nút/tool không khả dụng |

> 4 màu quan trọng nhất (Selected/Drawing/Box-select/Warning-Error) được chọn **cách xa nhau trên vòng thuần sắc** (xanh lá – xanh dương – cyan – vàng – đỏ) để không bao giờ gây nhầm lẫn dù nhìn nhanh.

### 3.2. Bảng Màu Theo Loại Vật Tư (Point Features — màu fill/icon cố định, KHÔNG đổi theo trạng thái)

| Loại vật tư | Token | Mã màu | Lý do chọn |
| :--- | :--- | :--- | :--- |
| Cột điện (Pole) | `--cad-obj-pole` | `#B45309` (Amber 700 — tông nâu/gỗ) | Gợi liên tưởng vật liệu cột (gỗ/bê tông), tách hẳn khỏi dải Amber cảnh báo (`#F59E0B` sáng hơn, không trùng) |
| Tủ cáp (Cabinet) | `--cad-obj-cabinet` | `#0D9488` (Teal 600) | Tách biệt hoàn toàn khỏi mọi màu state |
| Măng xông (Splice Closure) | `--cad-obj-splice` | `#F97316` (Orange 500) | Cam đứng riêng, không trùng Amber (Cột) lẫn Red (Error) |
| ODF | `--cad-obj-odf` | `#8B5CF6` (Violet 500) | Tím — nhóm "thiết bị phân phối trung tâm" |
| Splitter | `--cad-obj-splitter` | `#D946EF` (Fuchsia 500) | Hồng cánh sen, cùng nhóm tím-hồng với ODF nhưng phân biệt rõ sắc độ |
| Camera CCTV | `--cad-obj-camera` | `#6366F1` (Indigo 500) | Chàm — khác hẳn Blue state (`#3B82F6`) dù cùng họ xanh, đủ để phân biệt khi đặt cạnh nhau |
| Node giao cắt chung | `--cad-obj-node` | `#9CA3AF` (Gray 400) | Trung tính cho điểm không phân loại |

### 3.3. Bảng Màu Cáp Quang Theo Số Sợi (Line Features — thang màu tuần tự)

Giữ đúng yêu cầu gốc "phân màu theo số sợi cáp" nhưng chuẩn hóa thành 1 thang cố định thay vì tùy tiện:

| Số sợi (FO) | Token | Mã màu |
| :--- | :--- | :--- |
| 12FO | `--cad-cable-12` | `#94A3B8` (Slate 400) |
| 24FO | `--cad-cable-24` | `#38BDF8` (Sky 400) |
| 48FO | `--cad-cable-48` | `#FB923C` (Orange 400) |
| 96FO | `--cad-cable-96` | `#C084FC` (Purple 400) |
| 144FO | `--cad-cable-144` | `#F472B6` (Pink 400) |
| 288FO trở lên | `--cad-cable-288` | `#4ADE80` (Green 400) |

> Ghi chú: độ dày nét (`line-width`) vẫn tăng dần theo số sợi song song với màu — tránh việc người dùng chỉ dựa vào màu (hỗ trợ cả người bị mù màu một phần).

### 3.4. Bảng Màu Polygon Theo Loại Vùng

| Loại vùng | Token | Fill (opacity 15%) | Stroke |
| :--- | :--- | :--- | :--- |
| Thửa đất | `--cad-zone-parcel` | `#FACC15` | `#EAB308` |
| Khu nhà trạm | `--cad-zone-station` | `#60A5FA` | `#3B82F6` |
| Vùng quy hoạch | `--cad-zone-planned` | `#A3A3A3` | nét đứt `#737373` |

---

## 4. KÍCH THƯỚC — Chốt Phương Án Cuối

| Thành phần | Quyết định cuối cùng | Thay đổi so với hiện trạng |
| :--- | :--- | :--- |
| TitleBar | `h-10` (40px) | Giữ nguyên |
| Ribbon Tab Rail | `h-9` (36px) | Giữ nguyên |
| Ribbon Action Band | `h-[80px]` | Giữ nguyên |
| **Left Dock** | **Chốt `w-72` (288px)** | **Bỏ dao động 64/80, chỉ 1 giá trị duy nhất** |
| Right Dock | `w-80` (320px) | Giữ nguyên |
| Command Line | `h-8` (32px) | Giữ nguyên |
| Status Bar | `h-[22px]` | Giữ nguyên |
| Icon size scale | `16 / 20 / 24 / 32px` | Chính thức hóa thành token `--icon-sm/md/lg/xl` |
| Button height scale | `28 / 32 / 40px` | Chính thức hóa thành `--btn-sm/md/lg` |
| Spacing scale | `4·8·12·16·20·24·32px` | Áp dụng bắt buộc cho mọi padding/margin mới |

---

## 5. MẪU TOKEN FILE (để dev copy làm điểm khởi đầu)

```css
/* design-tokens.css — mở rộng từ hệ --cad-* hiện có */

:root {
  /* --- State colors (dùng chung 2 theme) --- */
  --cad-state-selected: #10B981;
  --cad-state-drawing: #3B82F6;
  --cad-state-boxselect: #06B6D4;
  --cad-state-boxselect-fill: rgba(6, 182, 212, 0.15);
  --cad-state-warning: #F59E0B;
  --cad-state-error: #EF4444;
  --cad-state-locked: #64748B;
  --cad-state-disabled: rgba(75, 85, 99, 0.5);

  /* --- Object type colors (Point features) --- */
  --cad-obj-pole: #B45309;
  --cad-obj-cabinet: #0D9488;
  --cad-obj-splice: #F97316;
  --cad-obj-odf: #8B5CF6;
  --cad-obj-splitter: #D946EF;
  --cad-obj-camera: #6366F1;
  --cad-obj-node: #9CA3AF;

  /* --- Cable colors (theo số sợi) --- */
  --cad-cable-12: #94A3B8;
  --cad-cable-24: #38BDF8;
  --cad-cable-48: #FB923C;
  --cad-cable-96: #C084FC;
  --cad-cable-144: #F472B6;
  --cad-cable-288: #4ADE80;

  /* --- Sizing --- */
  --icon-sm: 16px;
  --icon-md: 20px;
  --icon-lg: 24px;
  --icon-xl: 32px;
  --btn-sm: 28px;
  --btn-md: 32px;
  --btn-lg: 40px;
}
```

```ts
// mapIconManifest.ts — nguồn icon DUY NHẤT cho Marker + Layer Tree + BOM Summary
export const MAP_ICON_MANIFEST = {
  pole:     { icon: "utility-pole", color: "var(--cad-obj-pole)" },
  cabinet:  { icon: "cabinet-custom", color: "var(--cad-obj-cabinet)" },
  splice:   { icon: "splice-capsule-custom", color: "var(--cad-obj-splice)" },
  odf:      { icon: "server", color: "var(--cad-obj-odf)" },
  splitter: { icon: "split", color: "var(--cad-obj-splitter)" },
  camera:   { icon: "camera", color: "var(--cad-obj-camera)" },
  node:     { icon: "circle-dot", color: "var(--cad-obj-node)" },
} as const;
```

---

## 6. LỘ TRÌNH TRIỂN KHAI CHI TIẾT (đã gắn đầu ra cụ thể)

| Giai đoạn | Công việc | Đầu ra | Ước lượng |
| :--- | :--- | :--- | :--- |
| **Phase 0 — Audit** | Grep toàn repo tìm hex hardcode (`#[0-9A-Fa-f]{3,6}`), liệt kê icon SVG rời rạc, tìm hết chỗ dùng `w-64`/`w-80` | File checklist `audit-report.md` | 1–2 ngày |
| **Phase 1 — Token Layer** | Tạo `design-tokens.css` (mẫu mục 5) + cập nhật Tailwind `@theme` | Token file merge vào `main` | 2–3 ngày |
| **Phase 2 — Icon System** | Cài `lucide-react`; vẽ 2 icon tự chế (Cabinet, Splice) theo Specsheet; tạo `mapIconManifest.ts` | Icon manifest dùng chung | 3–4 ngày |
| **Phase 3 — Refactor Component** | Áp token vào TitleBar, Ribbon, Left Dock (chốt `w-72`), Property Panel, BOM, Box Selection | PR theo từng module, review theo checklist Governance | 5–7 ngày |
| **Phase 4 — QA 2 Theme** | Kiểm tra contrast WCAG AA cho từng cặp token trên Dark/Light, kiểm tra icon rõ nét ở `icon-sm` 16px | Báo cáo QA + fix lỗi phát sinh | 2 ngày |
| **Phase 5 — Style Guide & Governance** | Viết `STYLE_GUIDE.md` tổng hợp toàn bộ bảng ở tài liệu này + checklist PR bắt buộc | Tài liệu chính thức, gắn vào quy trình review | 1–2 ngày |

**Tổng ước lượng:** ~14–20 ngày làm việc (1 dev full-time), có thể rút ngắn nếu chia song song Phase 2 và Phase 3 cho 2 người.

---

## 7. CHECKLIST GOVERNANCE (bắt buộc từ sau khi hoàn thiện)

- [ ] Icon mới có nằm trong `mapIconManifest.ts` hoặc thư viện Lucide không? (không tự vẽ SVG rời trong component)
- [ ] Màu mới có phải là 1 trong các token ở mục 3 không? (không hardcode hex mới)
- [ ] Nếu là màu trạng thái mới — có tuân thủ nguyên tắc "state = viền/overlay, không đổi fill" không?
- [ ] Kích thước mới có thuộc thang `4/8/12/16/20/24/32px` không?
- [ ] Đã test cả 2 theme (Dark/Light) chưa?

---

## 8. TỔNG KẾT

Tài liệu này chốt đầy đủ:
- **28 icon cụ thể** cho toàn bộ UI Chrome (dùng Lucide có sẵn).
- **7 icon vật tú kỹ thuật** cho bản đồ (2 icon tự vẽ, 5 icon tái dùng từ Lucide).
- **8 token màu trạng thái**, **7 token màu loại vật tư**, **6 token màu cáp theo số sợi**, **3 token màu vùng**.
- **1 quyết định kích thước cuối cùng** cho Left Dock (`w-72`) chấm dứt tình trạng dao động.
- **Token file mẫu** sẵn sàng để dev copy và bắt đầu Phase 1 ngay.

Đội dev có thể bắt đầu triển khai từ **Phase 0 (Audit)** ngay hôm nay mà không cần chờ thêm quyết định nào khác.
