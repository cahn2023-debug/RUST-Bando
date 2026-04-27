# Debug Log - Polyline Hidden Bug

## Hiện tượng
- User báo: "Đường polyline bị ẩn hẳn đi? Sai hoàn toàn yêu cầu của tôi."
- Sau khi fix ở Step 1039, logic visibility mới làm ẩn cả các Polyline ở mức zoom bình thường.

## Phân tích & Giả thuyết

### Giả thuyết A: Logic root-level bị sai (80% khả năng)
- Trong code hiện tại:
  ```tsx
  } else {
      if (currentZoom < expansionZoom) return null;
  }
  ```
- Với `depth = 0`, `expansionZoom = 19`.
- Vậy tất cả Polyline không có cha (root features) sẽ bị ẩn hoàn toàn khi `zoom < 19`.
- Điều này sai vì thông thường root features phải luôn hiển thị.

### Giả thuyết B: Depth calculation bị sai (10% khả năng)
- Có thể các Polyline có cha nhưng `depth` được tính toán không đúng, khiến `parentExpansionZoom` sai.

### Giả thuyết C: Hiểu sai yêu cầu "trong nút giao" (10% khả năng)
- User có thể muốn Polyline hiển thị cùng lúc với Nút giao ở một số mức zoom nhất định.

## Kế hoạch điều tra
1. Kiểm tra lại logic `DesignFeatures.tsx`.
2. Chỉnh sửa logic hiển thị: Chỉ áp dụng filter ẩn dựa trên `expansionZoom` nếu đối tượng là "con" (depth > 0) hoặc có yêu cầu đặc biệt.
3. Root-level polylines (`depth = 0`) nên hiển thị mặc định trừ khi có layer visibility chặn.

## Phương án sửa đổi dự kiến
- Bỏ filter `currentZoom < expansionZoom` cho Polyline/Polygon nếu `depth == 0`.
- Giữ logic `parentExpansionZoom` để ẩn con khi cha đang hiện.
