# PLAN-geotype-sync-fix.md

## Mục tiêu
Đồng bộ cột "Geo Type" trong bảng Analysis với Icon/Loại đối tượng hiển thị trên bản đồ.

## Phân tích hiện trạng (Council Review)
- **Logic Lord**: Bản đồ dùng `getFeatureDisplayType` (kiểm tra type, icon, group name), còn Bảng dùng `metadata.type || f.geom_type`. Sự khác biệt này khiến dữ liệu hiển thị không khớp.
- **Architect**: Cần dùng chung `source of truth` từ `featureUtils.ts` cho cả hai nơi.
- **Performance**: Việc gọi thêm hàm trong `useMemo` của bảng Analysis không ảnh hưởng đáng kể đến hiệu năng với số lượng bản ghi hiện tại.

## Kế hoạch thực hiện
### Phase 1: Cập nhật Data Flattening
- Sửa `src/utils/dataFlattening.ts`: Import `getFeatureDisplayType` và dùng nó để gán giá trị cho cột `geom_type`.

### Phase 2: Cập nhật Analysis Dialog
- Đảm bảo dropdown chọn loại đối tượng trong bảng khi save sẽ ghi đè lên `metadata.type`. 
- Kiểm tra xem có cần cập nhật `metadata.icon` cho các trường hợp đặc biệt không.

### Phase 3: Verification
- Sửa loại đối tượng từ "CCTV" sang "PTZ" trong bảng Analysis.
- Quan sát icon trên bản đồ thay đổi ngay lập tức.

Next steps:
- Review the plan
- Run `/create` to start implementation
