# Implementation Log - Google Maps API Fix - 2026-03-15

## Chức năng
- Sửa lỗi Maps API Rejected bằng cách bổ sung key dự phòng từ `google-services.json`.
- Cấu trúc lại cách gọi API Key để dễ dàng thay thế/ghi đè.

## File Thay đổi [MODIFY]
- `src/components/MapLayerComponents/StreetViewControl.tsx`: Cập nhật logic lấy API Key.
- `.env`: (Đề xuất) Thêm `VITE_GOOGLE_MAPS_API_KEY`.

## Kế thừa (Inheritance)
- Giữ nguyên logic Draggable Popup và Marker Synchronization đã làm ở bước trước.
- Không thay đổi style nút Street View đã tinh chỉnh.

## Kết quả Test
- Cần user kiểm tra vì AI không thể bypass lỗi activation phía Google Server.
