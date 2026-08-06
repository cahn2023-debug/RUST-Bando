# 🗺️ Kế Hoạch Triển Khai: Hoàn Thiện Tính Năng Gom Nhóm (Map Clustering)

> **Mã công việc**: `map-clustering`  
> **Tổ chức**: Sol-Advisor Architect Specification  
> **Ngày tạo**: 2026-08-06  

---

## 1. Goal & Scope (Mục Tiêu & Phạm Vi)

### Mục tiêu
Hoàn thiện cơ chế gom nhóm đối tượng trên bản đồ (Map Clustering) với các quy tắc kinh doanh cụ thể:
1. **Gom nhóm khi zoom xa**: Các đối tượng điểm đứng gần nhau sẽ tự động gom nhóm thành bong bóng số lượng (`point_count`). Khi nhấp vào bong bóng gom nhóm, bản đồ sẽ tự động phóng to (zoom in) đến cấp độ phân rã nhóm (`getClusterExpansionZoom`).
2. **Loại trừ tuyến (Route / Line / Cable)**: Các đối tượng dạng tuyến (Route, LineString, Polyline, cáp, đường dẫn) tuyệt đối không tham gia gom nhóm.
3. **Loại trừ đối tượng trong nút giao (Intersection child objects)**: Các đối tượng con thuộc nút giao (như camera, cảm biến, thiết bị nằm trong nút giao có `isMapIntersectionChild = true` hoặc thuộc nhóm nút giao `INTERSECTION` / `NUT_GIAO`) không được tính số lượng hay đưa vào nguồn gom nhóm (`POINT_CLUSTER_SOURCE_ID`).

### Phạm vi ảnh hưởng
- `src/modules/design/features/map/mapDisplayPolicy.ts`
- `src/modules/design/features/map/mapLibreFastAdapter.ts`
- `src/modules/design/features/map/mapLibreFastTypes.ts`
- `src/modules/design/features/map/MapLibreFastRenderer.tsx`
- Unit tests & Integration tests liên quan trong `src/modules/design/features/map/MapLibreFastRenderer.test.tsx` và `mapLibreFastAdapter.test.ts`.

---

## 2. Component Boundaries & API Contract

### Modules & Files

1. **`src/modules/design/features/map/mapLibreFastTypes.ts`**
   - Bổ sung thuộc tính `isIntersectionChild?: boolean` vào `MapLibreRenderFeatureProperties` để lưu vết rõ ràng các điểm thuộc nút giao.

2. **`src/modules/design/features/map/mapLibreFastAdapter.ts`**
   - Khi chuyển đổi `FeatureState` sang `MapLibreRenderFeature` trong `toRenderFeatures`: tính toán `isIntersectionChild = isMapIntersectionChild(feature, group, metadata, displayInfo)` và truyền vào `properties`.

3. **`src/modules/design/features/map/MapLibreFastRenderer.tsx`**
   - Cập nhật hàm lọc điểm gom nhóm `onlyPointFeatures` thành `onlyClusterablePointFeatures`:
     - Kiểm tra `geometry.type === 'Point' || 'MultiPoint'`
     - Loại trừ các đối tượng không phải điểm hoặc thuộc loại tuyến (`geomType !== 'line'`)
     - Loại trừ các đối tượng nằm trong nút giao (`!properties.isIntersectionChild`)

---

## 3. Implementation Steps (Các Bước Thực Thi Chính)

### Bước 1: Cập nhật Type Contract (`mapLibreFastTypes.ts`)
- Thêm `isIntersectionChild?: boolean` vào interface `MapLibreRenderFeatureProperties`.

### Bước 2: Gắn cờ đối tượng nút giao trong Adapter (`mapLibreFastAdapter.ts`)
- Trong `toRenderFeatures`:
  - Gọi `isIntersectionChild = isMapIntersectionChild(feature, group, metadata, displayInfo)`
  - Đưa `isIntersectionChild` vào object `properties` của render feature.

### Bước 3: Lọc đối tượng gom nhóm chuẩn xác trong Renderer (`MapLibreFastRenderer.tsx`)
- Thay thế / Nâng cấp hàm `onlyPointFeatures` thành hàm lọc đối tượng gom nhóm an toàn:
  ```typescript
  const onlyClusterablePointFeatures = (
      collection: MapLibreRenderFeatureCollection
  ): MapLibreRenderFeatureCollection => ({
      ...collection,
      features: collection.features.filter(feature => {
          const props = feature.properties as Record<string, any>;
          const isPoint = feature.geometry.type === 'Point' || feature.geometry.type === 'MultiPoint';
          const isLine = props?.geomType === 'line';
          const isIntersectionChild = Boolean(props?.isIntersectionChild);
          return isPoint && !isLine && !isIntersectionChild;
      }),
  });
  ```
- Sử dụng `onlyClusterablePointFeatures(displayCollection)` khi tạo `clusterCollection` cho `POINT_CLUSTER_SOURCE_ID`.

### Bước 4: Viết và cập nhật Kiểm thử tự động (Unit Tests)
- Bổ sung test case kiểm tra đối tượng tuyến (`LineString`) không nằm trong `clusterSource`.
- Bổ sung test case kiểm tra đối tượng thuộc nút giao (`isIntersectionChild`) không bị đưa vào `clusterSource` và không tính vào `point_count`.
- Chạy toàn bộ test suite để đảm bảo không bị vỡ regression.

---

## 4. Verification Plan (Kế Hoạch Kiểm Thử)

### Automated Tests
1. Chạy TypeCheck: `npm run typecheck` (hoặc `npx tsc --noEmit`)
2. Chạy Vitest cho map renderer: `npx vitest run src/modules/design/features/map/MapLibreFastRenderer.test.tsx`
3. Chạy toàn bộ unit test suite: `npm test`

### Manual Verification
- Render thử bản đồ với nhiều đối tượng điểm, đối tượng tuyến (routes) và các đối tượng nằm trong nút giao.
- Kiểm tra số lượng gom nhóm trên các bong bóng (cluster badge count) hiển thị đúng, chỉ đếm các điểm tự do, không tính điểm tuyến và không tính điểm nút giao con.

---

## 5. Acceptance Criteria (Tiêu Chí Nghiệm Thu)

- [x] Zoom xa: Các điểm gần nhau gom nhóm hiển thị bong bóng đếm. Click nhóm thì zoom in giải tán nhóm.
- [x] Các tuyến (Route / LineString / Cable) tuyệt đối không bị gom nhóm hay đếm vào cluster.
- [x] Các đối tượng nằm trong nút giao (`isIntersectionChild`) tuyệt đối không bị đếm vào số lượng gom nhóm.
- [x] Tất cả các test suite PASS 100% không phát sinh lỗi regression.
