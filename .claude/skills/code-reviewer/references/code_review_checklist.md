# Code Review Checklist (Rust & Tauri)

## 🦀 Rust Core Patterns

### 1. Ownership & Borrowing
- **Check:** Tránh sử dụng `.clone()` không cần thiết trừ khi thực sự cần sở hữu dữ liệu.
- **Check:** Ưu tiên sử dụng references (`&T`, `&mut T`) thay vì truyền giá trị nếu không cần chuyển đổi quyền sở hữu.
- **Check:** Kiểm tra lifetime annotations nếu code phức tạp, đảm bảo chúng rõ ràng và đúng đắn.

### 2. Error Handling
- **Check:** Tuyệt đối không dùng `.unwrap()` hoặc `.expect()` trong code production trừ khi có lý lẽ cực kỳ thuyết phục (và nên có comment giải thích).
- **Check:** Sử dụng `?` operator để chuyển tiếp lỗi.
- **Check:** Đảm bảo các lỗi custom được implement `Error` trait hoặc dùng `thiserror`.

### 3. Safety & Types
- **Check:** Hạn chế sử dụng `unsafe` blocks. Nếu có, phải có comment `// SAFETY:` giải thích tại sao nó an toàn.
- **Check:** Sử dụng Newtype pattern để tăng cường tính đóng gói và an toàn kiểu dữ liệu.

## 🚀 Tauri Specific Patterns

### 1. Tauri Commands (IPC)
- **Check:** Các hàm `#[tauri::command]` phải xử lý lỗi và trả về `Result<T, String>` hoặc các kiểu có thể serialize được.
- **Check:** Đảm bảo payload từ frontend được validate cẩn thận.
- **Check:** Sử dụng `State` để quản lý các tài nguyên dùng chung trong ứng dụng.

### 2. State Management
- **Check:** Tránh lock `Mutex` hoặc `RwLock` quá lâu gây nghẽn (deadlock hoặc performance drop).
- **Check:** Ưu tiên sử dụng async-friendly locks nếu module chạy trong Tokio runtime.

## 📊 Performance & Optimization
- **Check:** Kiểm tra các vòng lặp lớn, xem xét dùng `rayon` nếu có thể song song hóa.
- **Check:** Đảm bảo không có N+1 query hoặc lặp lại các tác vụ nặng trong main thread (dùng `spawn_blocking` nếu cần).
