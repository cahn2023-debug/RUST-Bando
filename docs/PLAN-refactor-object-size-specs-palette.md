# PLAN: Refactor chỉnh sửa kích thước đối tượng ở Palette "Thông số kỹ thuật" (PropertyPanel)

> **Mục tiêu**: Nâng cấp giao diện và trải nghiệm người dùng khi chỉnh sửa kích thước biểu tượng (Point Symbol Size) và độ dày nét vẽ (Polyline Stroke Weight) trong Palette "Thông số kỹ thuật" (`PropertyPanel`).

---

## 1. Goal & Scope (Mục tiêu & Phạm vi tác động)

### Mục tiêu:
1. Nâng cấp khu vực chỉnh sửa **Styling & Symbols** trong `PropertyPanel.tsx` với bộ điều khiển trực quan:
   - **Range Slider**: Thanh trượt điều chỉnh kích thước mượt mà.
   - **Stepper buttons**: Nút `+` và `-` để tăng/giảm kích thước chính xác từng bước (Point step 2px/4px, Line step 1px).
   - **Preset Quick Buttons**: Các nút chọn nhanh kích thước chuẩn:
     - Point: `Nhiều (16px)`, `Trung bình (32px)`, `Lớn (48px)`, `Rất lớn (64px)`.
     - Polyline: `Mảnh (2px)`, `Vừa (4px)`, `Dày (8px)`, `Đặc biệt (12px)`.
   - **Debounced Realtime Preview**: Cập nhật bản vẽ chính và các palette liên quan tức thì khi thao tác (debounce nhẹ ~30-50ms) bằng `setPreview`.
2. Giữ nguyên tính năng lưu chính thức khi nhấn nút **SAVE SPECS** vào CSDL và hệ thống Event Queue (`FeatureUpdated`).
3. Đảm bảo hỗ trợ đầy đủ accessibility (`aria-label`, keyboard navigation) và giao diện CAD theme (`cad-bg`, `cad-border`, `cad-accent`).

### Phạm vi tác động:
- `src/modules/design/components/core/PropertyPanel.tsx`: Thêm UI control suite cho kích thước & stroke weight.
- `src/modules/design/components/core/PropertyPanel.test.tsx`: Cập nhật & bổ sung unit tests cho bộ điều khiển kích thước mới (Slider, Stepper, Presets, Preview).

---

## 2. Component Boundaries & API Contract

### Component: `PropertyPanel.tsx`
- **Current State**:
  - `localMeta.size` / `localMeta.gis.size` / `localMeta.weight` / `localMeta.stroke`.
  - Single numeric `<input type="number">` bounded by `POINT_SYMBOL_SIZE_MIN` (4) to `POINT_SYMBOL_SIZE_MAX` (100) for Point, or `LINE_STROKE_SIZE_MIN` (1) to `LINE_STROKE_SIZE_MAX` (32) for Polyline.
- **Enhanced Contract**:
  - Tạo sub-component hoặc helper UI `SizeControl`:
    - Numeric input (chỉnh trực tiếp con số exact).
    - Slider range input (`min`, `max`, `step`).
    - Quick preset buttons (`16px`, `32px`, `48px`, `64px` đối với Point; `2px`, `4px`, `8px`, `12px` đối với Line).
    - Stepper increment/decrement buttons (`-` và `+`).
  - Tự động gọi `updateSymbolSize` đồng bộ với `setPreview(selectedFeatureId, nextMeta, localName)`.

---

## 3. Implementation Steps (Terra Lane)

1. **Bước 1: Thiết kế & Xây dựng Sub-component / Section `SizeControl` trong `PropertyPanel.tsx`**:
   - Định nghĩa danh sách Presets cho Point (`[16, 32, 48, 64]`) và Polyline (`[2, 4, 8, 12]`).
   - Xây dựng layout gồm:
     - Header label (`Size` hoặc `Stroke Weight`) kèm ô nhập số & stepper `+` / `-`.
     - Thanh trượt Range Slider (`<input type="range">`) ăn theo `min`, `max`, `step`.
     - Hàng nút bấm Presets linh hoạt.
   - Kết nối với `updateSymbolSize` để gửi giá trị mới tức thì.

2. **Bước 2: Tối ưu hóa Realtime Preview & Debounce**:
   - Sử dụng `useCallback` / `useRef` cho `updateSymbolSize` để phát preview nhẹ nhàng (30ms debounce) giúp bản vẽ và các palette khác (`CameraViewPanel`, `DeviceConfigPanel`) cập nhật realtime không bị giật lag.

3. **Bước 3: Viết Unit Tests kiểm thử**:
   - Cập nhật `PropertyPanel.test.tsx` kiểm tra render của Slider, Stepper nút `+`/`-`, các nút Preset, và việc gọi `setPreview` khi kích thước thay đổi.

---

## 4. Verification Plan (Fresh Sol Reviewer)

- **Automated Verification**:
  - Run `npm test PropertyPanel.test.tsx` (hoặc `npx jest src/modules/design/components/core/PropertyPanel.test.tsx`).
  - Run `npm run typecheck` hoặc test suite liên quan.

- **Manual Verification Checklist**:
  - Chọn 1 đối tượng Point ➔ Mở Palette "Thông số kỹ thuật" (PropertyPanel) ➔ Thử kéo slider ➔ Kiểm tra biểu tượng trên bản vẽ co giãn theo realtime.
  - Thử bấm nút Preset (`32px`, `48px`...) ➔ Kích thước thay đổi ngay lập tức.
  - Thử chọn đối tượng Polyline ➔ Kéo slider độ dày nét vẽ ➔ Đường line trên bản vẽ đổi độ dày realtime.
  - Bấm nút **SAVE SPECS** ➔ Dữ liệu được ghi nhận vào event stream và DB thành công.

---

## 5. Acceptance Criteria

- [x] Giao diện điều chỉnh kích thước có đầy đủ Range Slider, Input số, Nút `+`/`-` và các nút Presets chuẩn.
- [x] Phản hồi realtime trên bản vẽ và các palette mở đồng thời khi thay đổi kích thước.
- [x] Giữ nguyên tính năng lưu chính thức qua nút SAVE SPECS mà không vỡ bất kỳ logic cũ nào.
- [x] Tất cả unit tests liên quan pass 100%.
