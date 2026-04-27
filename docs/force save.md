1. Giải pháp kỹ thuật: Quy trình "Force Save & Flush"
Để dữ liệu từ bộ nhớ hoặc file tạm (WAL) thực sự nằm gọn trong file .pmp, hệ thống phải thực hiện 4 bước sau:

Chốt chặn UI (Tauri Command): Khi bấm nút Save, Frontend gửi lệnh save_project xuống Rust.

Tín hiệu Actor (Signal): WriteQueueActor nhận lệnh ưu tiên cao nhất, tạm dừng nhận các yêu cầu mới và xử lý hết các Message còn tồn đọng trong mpsc::channel.

SQLite Checkpoint: Thực thi lệnh PRAGMA wal_checkpoint(TRUNCATE). Đây là lệnh quan trọng nhất để đẩy toàn bộ dữ liệu từ file .wal vào file .pmp chính.

Giải phóng Handle: Đóng hoặc reset connection để đảm bảo không còn tiến trình nào khóa file, giúp phần mềm "trơn tru" khi thực hiện các tác vụ quản lý file tiếp theo.

2. Chi tiết quá trình xử lý (Dành cho AI)
Bạn hãy sử dụng cấu trúc Prompt "Context - Action - Validation" dưới đây để ép AI đọc lại toàn bộ code và bổ sung tính năng:

Prompt: Triển khai cơ chế Force Save & Flush cho file .pmp

1. Phân tích bối cảnh:
"Tôi cần bổ sung tính năng 'Force Save'. Hãy đọc file src-tauri/src/main.rs (hoặc nơi định nghĩa command) và src-tauri/src/domain/implement/db/write_queue.rs. Hệ thống hiện tại đang gặp hiện tượng dữ liệu nằm ở file log/wal mà chưa vào file .pmp chính."

2. Yêu cầu lập trình:

Bước A (Tauri Command): Tạo một command force_save_project. Command này phải gửi một message WriterMessage::FlushAndSync đến WriteQueueActor.

Bước B (Actor Logic): Trong WriteQueueActor, khi nhận FlushAndSync, hãy sử dụng tokio::sync::oneshot để phản hồi lại cho Command sau khi đã ghi xong toàn bộ hàng đợi.

Bước C (SQLite Persistence): Thực thi lệnh SQL: conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?. Đảm bảo lệnh này được gọi sau khi events.log đã được flush xuống đĩa.

Bước D (UI Feedback): Command chỉ trả về Ok khi và chỉ khi SQLite trả về kết quả checkpoint thành công.

3. Rà soát an toàn:
"Hãy kiểm tra xem nếu người dùng nhấn Save liên tục thì hệ thống có bị deadlock không? Hãy sử dụng cơ chế Mutex hoặc Arc một cách cẩn thận để đảm bảo tính độc nhất của Writer."