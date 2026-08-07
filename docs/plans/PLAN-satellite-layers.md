# Kế hoạch Sol-Advisor: Nâng cấp Layer cho Bản đồ Vệ tinh (docs/PLAN-satellite-layers.md)

## 1. Goal & Scope
- **Mục tiêu**: Khi bật các layer (Line, Label, Polygon, POI, Label/Visible) trên bảng điều khiển MAP LAYERS, bản đồ vệ tinh sẽ hiển thị nhãn/đường đi tương ứng trực tiếp trên nền ảnh vệ tinh Google (chuyển `satellite` sang Google Hybrid `lyrs=y` và bật `supportsApiStyle: true`).
- **Phạm vi tác động**:
  - `src/core/basemap/presets.ts`
  - `src/core/basemap/style.ts`
  - `src/core/basemap/basemapStyle.test.ts`
  - `src/modules/design/features/map/useMapStyles.test.ts`

## 2. Component Boundaries & API Contract
- `BASEMAP_PRESETS` trong `presets.ts`:
  - `satellite` preset: `tileLyr` đổi từ `'s'` sang `'y'`, `supportsApiStyle` đổi từ `false` sang `true`.
- `getStyledBasemapTiles` trong `style.ts`:
  - Khi preset có `supportsApiStyle: true` và `tileLyr: 'y'`, hàm sẽ nối các tham số `&apistyle=...` được tạo từ `getBasemapApiStyleRules(preferences)`.

## 3. Implementation Steps (Terra Lane)
1. **Sửa `presets.ts`**:
   - Cập nhật preset `satellite` thành `tileLyr: 'y'`, `supportsApiStyle: true`.
2. **Sửa `useMapStyles.test.ts`**:
   - Cập nhật test case kiểm tra `satellite` tile URL chuyển sang `lyrs=y` và kiểm tra có áp dụng `apistyle` đúng quy tắc.
3. **Sửa `basemapStyle.test.ts`**:
   - Cập nhật test assertion cho `satellite` style.
4. **Chạy Unit Test**:
   - Chạy `npx vitest run src/core/basemap/` và `npx vitest run src/modules/design/features/map/`.

## 4. Verification Plan
- Chạy vitest test suites:
  - `npx vitest run src/core/basemap/basemapStyle.test.ts`
  - `npx vitest run src/modules/design/features/map/useMapStyles.test.ts`
- Phân tích diff git (`git diff`).

## 5. Acceptance Criteria
- Preset `satellite` mang `tileLyr: 'y'` và `supportsApiStyle: true`.
- `getStyledBasemapTiles('satellite', { roads: false })` trả về URL tile chứa `lyrs=y` và `apistyle=...` phù hợp.
- Tất cả unit test liên quan đều PASS 100%.
