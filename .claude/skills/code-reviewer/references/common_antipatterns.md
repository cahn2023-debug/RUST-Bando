# Common Anti-patterns (Rust & Tauri)

## 🦀 Rust Anti-patterns

### 1. The "Panic" Habit
- **Anti-pattern:** Sử dụng `.unwrap()` hoặc `.expect()` khắp nơi.
- **Why:** Khiến ứng dụng dễ bị crash bất ngờ.
- **Fix:** Sử dụng `match`, `if let`, hoặc `?` operator để xử lý lỗi một cách an toàn.

### 2. Excessive Cloning
- **Anti-pattern:** Gọi `.clone()` mỗi khi trình biên dịch báo lỗi Ownership.
- **Why:** Gây tốn bộ nhớ và giảm hiệu suất nếu dữ liệu lớn.
- **Fix:** Xem xét sử dụng references `&`, `Rc`, hoặc `Arc` nếu cần chia sẻ dữ liệu.

### 3. Ignoring Compiler Warnings
- **Anti-pattern:** Để mặc các cảnh báo `unused_variables`, `dead_code`.
- **Why:** Làm code bị nhiễu, khó bảo trì và có thể che giấu lỗi thực sự.
- **Fix:** Sử dụng `_` cho biến không dùng, hoặc xóa bỏ code thừa.

## 🚀 Tauri Anti-patterns

### 1. Blocking the Main Thread
- **Anti-pattern:** Chạy các tác vụ I/O nặng hoặc tính toán phức tạp trực tiếp trong hàm command mà không dùng async.
- **Why:** Làm UI bị đóng băng (frozen).
- **Fix:** Sử dụng `async fn`, `tokio::spawn`, hoặc `tauri::async_runtime::spawn`.

### 2. Over-complicated Command Payloads
- **Anti-pattern:** Truyền quá nhiều dữ liệu không cần thiết qua IPC giữa JS và Rust.
- **Why:** Giảm hiệu suất truyền tin.
- **Fix:** Chỉ truyền những ID hoặc dữ liệu tối thiểu cần thiết cho xử lý backend.

### 3. Insecure IPC Commands
- **Anti-pattern:** Expose các command cho phép truy cập file hệ thống hoặc thực thi lệnh mà không có validation.
- **Why:** Rủi ro bảo mật nghiêm trọng.
- **Fix:** Kiểm tra kỹ path, sanitize input và áp dụng whitelist.
