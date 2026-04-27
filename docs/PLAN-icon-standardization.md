# PLAN-icon-standardization.md

## Mục tiêu
Chuẩn hóa trường `icon` trong metadata và đưa vào hiển thị/chỉnh sửa trong bảng Analysis.

## Phân tích (Council Review)
- **Logic Lord**: Hiện tại `icon` nằm trong `SYSTEM_FIELDS` nên bị hàm `flattenFeature` bỏ qua. Cần trích xuất tường minh.
- **Architect**: Cần thêm cột `icon` vào định nghĩa columns của TanStack Table.
- **Quality**: Khi sửa Icon trong bảng, Map phải cập nhật ngay lập tức qua hệ thống broadcast hiện có.

## Kế hoạch thực hiện

### Phase 1: Cập nhật Data Layer
- Sửa `src/utils/dataFlattening.ts`: Thêm trường `icon` vào object `row` trả về từ `flattenFeature`.

### Phase 2: Cập nhật UI Layer
- Sửa `src/components/AnalysisDialog.tsx`: 
    - Thêm cột "BIỂU TƯỢNG" vào `useMemo` của columns.
    - Sử dụng `DropdownCell` với các giá trị: `cctv`, `ptz`, `speed`, `lpr`, `intersection`, `default`.

### Phase 3: Cập nhật Logic Sync
- Đảm bảo `handleUpdate` trong `AnalysisDialog.tsx` xử lý việc ghi đè `metadata.icon`.

### Phase 4: Verification
- Kiểm tra điểm bất kỳ trong bảng Analysis.
- Đổi "Biểu tượng" từ `cctv` sang `ptz`.
- Xác nhận icon trên bản đồ đổi sang PTZ.

Next steps:
- Review the plan
- Run `/trienkhai`
