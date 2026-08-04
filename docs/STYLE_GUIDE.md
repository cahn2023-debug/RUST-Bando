# DESIGN SYSTEM — STYLE GUIDE & GOVERNANCE

**Dự án:** RUST CAD & GIS Network Product (V1.2.0)
**Trạng thái:** Quy chuẩn chính thức

---

## 1. Nguyên Tắc Phân Lớp Màu (State vs Type Layering)

- **Màu Loại Vật Tư (Type Color)**: Thể hiện danh tính cố định của đối tượng (Cột = Nâu gỗ `#B45309`, ODF = Tím `#8B5CF6`, Tủ cáp = Teal `#0D9488`...). Luôn áp dụng cho icon/fill gốc.
- **Màu Trạng Thái (State Color)**: Thể hiện qua viền, ring hoặc glow overlay bao quanh đối tượng. Không bao giờ thay đổi fill gốc.
  - Selected (Đang chọn): Viền phát sáng Emerald `#10B981`.
  - Hover (Di chuột): Viền mảnh mờ `#E5E7EB` (Dark) / `#334155` (Light).
  - Draft / Drawing: Nét đứt Blue `#3B82F6`.
  - Box Select: Khung Cyan `#06B6D4` + Fill 15% opacity.
  - Warning / Error: Amber `#F59E0B` / Red `#EF4444`.

---

## 2. Thư Viện & Specsheet Icon

### 2.1. UI Chrome Icon
- **Thư viện chuẩn**: Lucide Icons (`lucide-react`).
- **Quy chuẩn hiển thị (Specsheet)**:
  - `ViewBox`: `0 0 24 24`
  - `stroke-width`: `1.75px`
  - `line-cap / line-join`: `round / round`
  - `Color`: Luôn dùng `currentColor`.
  - `Grid scale`: `16px` (sm), `20px` (md), `24px` (lg), `32px` (xl).

### 2.2. Map Point Feature Icons (`MAP_ICON_MANIFEST`)

| Vật tư | Icon | Token màu |
| :--- | :--- | :--- |
| Cột điện (Pole) | `UtilityPole` (Lucide) | `--cad-obj-pole` (`#B45309`) |
| Tủ cáp (Cabinet) | `CabinetIcon` (Custom) | `--cad-obj-cabinet` (`#0D9488`) |
| Măng xông (Splice) | `SpliceIcon` (Custom) | `--cad-obj-splice` (`#F97316`) |
| ODF | `Server` (Lucide) | `--cad-obj-odf` (`#8B5CF6`) |
| Splitter | `Split` (Lucide) | `--cad-obj-splitter` (`#D946EF`) |
| Camera CCTV | `Camera` (Lucide) | `--cad-obj-camera` (`#6366F1`) |
| Node giao cắt | `CircleDot` (Lucide) | `--cad-obj-node` (`#9CA3AF`) |

---

## 3. Bảng Token Màu Cáp Quang Theo Số Sợi (Sequential Line Scale)

- `12FO`: `--cad-cable-12` (`#94A3B8` Slate 400)
- `24FO`: `--cad-cable-24` (`#38BDF8` Sky 400)
- `48FO`: `--cad-cable-48` (`#FB923C` Orange 400)
- `96FO`: `--cad-cable-96` (`#C084FC` Purple 400)
- `144FO`: `--cad-cable-144` (`#F472B6` Pink 400)
- `288FO+`: `--cad-cable-288` (`#4ADE80` Green 400)

---

## 4. Chuẩn Kích Thước Bố Cục (Layout Scale)

- **TitleBar**: `h-10` (40px)
- **Ribbon Tab Rail**: `h-9` (36px)
- **Ribbon Action Band**: `h-[80px]`
- **Left Dock**: Cố định `w-72` (288px) (nằm trong khoảng resize [200px - 600px])
- **Right Dock**: `w-80` (320px)
- **Command Line**: `h-8` (32px)
- **Status Bar**: `h-[22px]`

---

## 5. Checklist Governance (Bắt Buộc Cho Code Review & PR)

- [ ] Icon mới có nằm trong `mapIconManifest.ts` hoặc `lucide-react` không? (Không viết SVG rời rạc trong component)
- [ ] Mã màu có dùng biến CSS/Tailwind Token không? (Không hardcode hex `#[0-9A-Fa-f]{3,6}`)
- [ ] Màu trạng thái có đúng nguyên tắc "viền/overlay, không đổi fill gốc" không?
- [ ] Kích thước có nằm trong thang chuẩn `4/8/12/16/20/24/32px` không?
- [ ] Đã kiểm thử hiển thị mượt mà ở cả 2 theme Dark & Light Mode chưa?
