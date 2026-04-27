# Phân tích lỗi OS Error 2 (File Not Found)

## 🔍 Phát hiện (Detection)
Lỗi xảy ra trong `DrawingExplorer.tsx` khi người dùng cố gắng import file. Mã nguồn hiện tại tạo một phần tử `<input type="file">` ẩn và lấy `file.name` để truyền xuống Backend.
- **Vấn đề**: `file.name` chỉ trả về tên file (ví dụ: `data.xlsx`), không phải đường dẫn tuyệt đối.
- **Hậu quả**: Backend Rust cố gắng mở file đó ở thư mục làm việc hiện tại của ứng dụng và thất bại với lỗi `os error 2` (The system cannot find the file specified).

## 🛠️ Giải pháp (Solution)
Thay thế việc sử dụng `<input type="file">` bằng Tauri Dialog API (`open`) để lấy được đường dẫn tuyệt đối của file trên hệ điều hành Windows.

## 📋 Danh sách sửa đổi
1. Import `open` từ `@tauri-apps/plugin-dialog` trong `DrawingExplorer.tsx`.
2. Thay thế logic trong `handleImportToGroup` để gọi `open()`.
3. Đảm bảo `importService` nhận vào đường dẫn tuyệt đối.
