# PLAN-analysis-sync-fix.md

## Mục tiêu
Sửa lỗi lệch dữ liệu "Mã hiệu" (Code/ID) giữa bản đồ (hiển thị 500) và bảng Analysis (hiển thị 125).

## Phân tích hiện trạng
- Ảnh chụp màn hình cho thấy Marker trên bản đồ có label là `500`.
- Bảng Analysis dòng tương ứng lại hiển thị `125`.

## Kế hoạch thực hiện
### Phase 1: Research & Diagnosis
- Tìm file định nghĩa Marker Label trên Map (LocationMarker.tsx).
- Tìm file flattening dữ liệu cho bảng Analysis (dataFlattening.ts).
- So sánh code trích xuất Mã hiệu/STT ở cả 2 bên.

### Phase 2: Implementation (Logic Lord & Architect)
- Đồng nhất cách lấy "Mã hiệu" ưu tiên: `name` -> `metadata.stt` -> `metadata.display_order`.
- Đảm bảo khi sửa `Mã hiệu` trong bảng Analysis, nó cập nhật đúng vào trường mà Map đang dùng để render.

### Phase 3: Verification
- Chạy regression tests.
- Kiểm tra thủ công bằng cách sửa STT và quan sát label trên map.

Next steps:
- Review the plan
- Run `/create` to start implementation
- Or modify plan manually
