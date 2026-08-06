# 🗺️ Kế Hoạch Triển Khai: Sửa Lỗi Gom Nhóm Bản Đồ & Trùng Lặp Nút Giao (Map Clustering Fix)

> **Mã công việc**: `map-clustering-fix`  
> **Tổ chức**: Sol-Advisor Architect Specification  
> **Ngày cập nhật**: 2026-08-06  

---

## 1. Goal & Scope (Mục Tiêu & Phạm Vi)

### Mục tiêu
Khắc phục triệt để hiện tượng các nút giao và biểu tượng điểm đơn lẻ vẫn hiển thị rời rạc đè lên hoặc bên ngoài cụm gom nhóm (cluster bubbles):
1. **Tách biệt Nguồn Dữ Liệu Gom Nhóm (`POINT_CLUSTER_SOURCE_ID`) & Nguồn Dữ Liệu Tĩnh (`SOURCE_ID`)**:
   - Khi chế độ gom nhóm kích hoạt (`clusterPoints = true`), nguồn dữ liệu chính (`SOURCE_ID`) chỉ chứa các đối tượng dạng Tuyến (LineString), Vùng (Polygon) và các đối tượng không gom nhóm.
   - Nguồn gom nhóm (`POINT_CLUSTER_SOURCE_ID`) giữ các điểm gom nhóm (Point/MultiPoint). MapLibre sẽ tự động gom các điểm đứng gần nhau thành cụm (`point_count >= 2`) và CHỈ hiển thị bong bóng đếm.
   - Gắn các layer điểm (`POINT_LAYER_ID`, `POINT_ICON_LAYER_ID`, `POINT_LABEL_LAYER_ID`, `POINT_GLOW_LAYER_ID`) sang nguồn `POINT_CLUSTER_SOURCE_ID` với bộ lọc `['!', ['has', 'point_count']]` để các điểm ĐÃ gom nhóm KHÔNG bị vẽ đè biểu tượng rời rạc.
2. **Phân biệt Nút Giao Cha (Parent Intersection) & Nút Giao Con (Intersection Child)**:
   - Các Nút giao cha (Parent Intersection node) là đối tượng điểm chuẩn, khi zoom xa (zoom < 15) BẮT BUỘC tham gia vào cụm gom nhóm (`POINT_CLUSTER_SOURCE_ID`).
   - Các đối tượng con trong nút giao (`isIntersectionChild = true`) ẩn khi zoom < 17 và chỉ hiển thị khi zoom in sâu (zoom >= 17).

### Phạm vi ảnh hưởng
- `src/modules/design/features/map/MapLibreFastRenderer.tsx`
- `src/modules/design/features/map/mapLibreFastAdapter.ts`
- Unit tests trong `src/modules/design/features/map/MapLibreFastRenderer.test.tsx` và `mapLibreFastAdapter.test.ts`.

---

## 2. Component Boundaries & API Contract

### Modules & Files

1. **`src/modules/design/features/map/MapLibreFastRenderer.tsx`**
   - Cập nhật định nghĩa các layer biểu tượng điểm (`POINT_LAYER_ID`, `POINT_ICON_LAYER_ID`, `POINT_LABEL_LAYER_ID`, `POINT_GLOW_LAYER_ID`) để liên kết với `POINT_CLUSTER_SOURCE_ID`.
   - Cập nhật logic `applyData`:
     - Khi `lodPolicy.clusterPoints = true`: `SOURCE_ID` nhận `withoutPointFeatures(displayCollection)` (chỉ tuyến & polygon), `POINT_CLUSTER_SOURCE_ID` nhận `onlyPointFeatures(displayCollection)` (tất cả các điểm gom nhóm).
     - Khi `lodPolicy.clusterPoints = false`: `SOURCE_ID` nhận `displayCollection`, `POINT_CLUSTER_SOURCE_ID` nhận `emptyCollection`.

2. **`src/modules/design/features/map/mapLibreFastAdapter.ts`**
   - Đảm bảo `onlyPointFeatures` và `withoutPointFeatures` phân loại chuẩn xác các điểm đại diện nút giao (Parent Intersections) để đưa vào `POINT_CLUSTER_SOURCE_ID`.

---

## 3. Implementation Steps (Các Bước Thực Thi Chính)

### Bước 1: Cập nhật liên kết Layer Nguồn trong `MapLibreFastRenderer.tsx`
- Đổi `source` của `POINT_GLOW_LAYER_ID`, `POINT_LAYER_ID`, `POINT_ICON_LAYER_ID`, `POINT_LABEL_LAYER_ID` từ `SOURCE_ID` sang `POINT_CLUSTER_SOURCE_ID`.
- Đảm bảo các layer này có bộ lọc `['!', ['has', 'point_count']]`.

### Bước 2: Tách Dữ Liệu GeoJSON cho 2 Source trong `MapLibreFastRenderer.tsx`
- Trong hàm `applyData`:
  ```typescript
  const mainCollection = lodPolicy.clusterPoints
      ? withoutPointFeatures(displayCollection)
      : displayCollection;
  const clusterCollection = lodPolicy.clusterPoints
      ? onlyPointFeatures(displayCollection)
      : emptyCollection;
  ```
- Cập nhật `source.setData(mainCollection)` và `clusterSource.setData(clusterCollection)`.

### Bước 3: Cập nhật & Bổ sung Unit Tests
- Thêm test case xác nhận khi `clusterPoints = true`, các điểm bị gom nhóm trong cụm không xuất hiện biểu tượng đơn lẻ từ `SOURCE_ID`.
- Chạy toàn bộ test suite để đảm bảo không vỡ regression.

---

## 4. Verification Plan (Kế Hoạch Kiểm Thử)

### Automated Tests
1. Chạy Vitest map tests: `npx vitest run src/modules/design/features/map/MapLibreFastRenderer.test.tsx src/modules/design/features/map/mapLibreFastAdapter.test.ts`
2. Chạy TypeScript Typecheck: `npx tsc --noEmit`

---

## 5. Acceptance Criteria (Tiêu Chí Nghiệm Thu)

- [ ] Khi zoom xa (zoom < 15), các điểm nút giao và biểu tượng điểm đứng gần nhau gom hoàn toàn vào cụm bong bóng đếm.
- [ ] KHÔNG còn biểu tượng nút giao / camera rời rạc hiển thị đè bên dưới hoặc xung quanh các cụm gom nhóm.
- [ ] Các đối tượng điểm đứng một mình ở xa vẫn hiển thị biểu tượng đơn lẻ bình thường.
- [ ] Khi zoom in sâu (zoom >= 15), giải tán cụm gom nhóm và hiển thị đầy đủ các điểm / nút giao chi tiết.
- [ ] Tất cả unit test suite PASS 100%.
