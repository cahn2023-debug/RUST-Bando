# Implementation Log: GIS Import & Troubleshooting

## 📅 [2026-03-15] - GIS Import Pipeline & Connection Fix

### ✅ Tính năng mới & Sửa lỗi
- **GIS Import Pipeline**: Hỗ trợ Excel (.xlsx) và KML (.kml) với parallel processing.
- **Tauri v2 Compatibility**: Cập nhật import `@tauri-apps/api/core` và sửa lỗi `localhost` resolution trên Windows.
- **Regression Infrastructure**: Cài đặt `vitest` và bổ sung script `test` vào `package.json`.

### 🔄 Kế thừa & Bảo tồn
- Giữ nguyên cấu trúc `main.rs`, `commands.rs`, và các layer render cũ.
- Tích hợp thêm module `import` mà không phá vỡ logic map hiện có.

### 🧪 Kết quả Test
- **SimpleTest**: PASSED (Hệ thống file OK).
- **Auth Initialization**: PASSED.
- **Connectivity**: PASSED (Vite bind 127.0.0.1 thành công).
- **Street View Test**: PASSED (sau khi cài vitest).

### 💡 Lưu ý
- Nếu gặp lại lỗi `ERR_CONNECTION_REFUSED`, kiểm tra port 1420 xem có process nào bị treo không.
