# 🗺️ Kế Hoạch Triển Khai: Sửa Lỗi Gom Nhóm Bản Đồ & Mất Biểu Tượng Khi Zoom

> **Mã công việc**: `map-clustering-fix`  
> **Tổ chức**: Sol-Advisor Architect Specification  
> **Ngày cập nhật**: 2026-08-06  

---

## 1. Goal & Scope (Mục Tiêu & Phạm Vi)

### Mục tiêu
1. Khắc phục triệt để lỗi mất toàn bộ biểu tượng (icon) khi zoom qua lại giữa các mức zoom (do lỗi cache `lastClusterSetDataKeyRef` không được reset khi nguồn GeoJSON bị khởi tạo lại).
2. Điều chỉnh ngưỡng Zoom theo yêu cầu:
   - **Gom nhóm (Cluster)**: `MAP_POINT_CLUSTER_HIDE_AT_ZOOM = 13` (Zoom < 13 gom nhóm, Zoom ≥ 13 hiển thị điểm đơn lẻ).
   - **Nút Giao Con (Intersection Child)**: `MAP_INTERSECTION_CHILD_MIN_ZOOM = 15` (Zoom ≥ 15 hiển thị chi tiết đối tượng con trong nút giao).

### Phạm vi ảnh hưởng
- `src/modules/design/features/map/mapDisplayPolicy.ts`
- `src/modules/design/features/map/MapLibreFastRenderer.tsx`
- `src/modules/design/features/map/mapLibreFastAdapter.ts`
- Unit tests liên quan.

---

## 2. Implementation Steps

1. Cập nhật các hằng số ngưỡng zoom trong `mapDisplayPolicy.ts`.
2. Reset ref key cache trong `MapLibreFastRenderer.tsx` khi tái tạo layer/source.
3. Chạy unit tests và tsc typecheck để đảm bảo chất lượng.
