# PFMS - Project Financial Management System

Hệ thống quản lý tài chính dự án chuyên dụng chạy trên Rust (Axum + SQLx).

## Tính năng
- Đối chiếu Doanh thu và Chi phí đa chiều (Many-to-Many).
- Kiểm soát Cấp phát (Allocation) nghiêm ngặt tại tầng DB.
- Phát hiện bất thường (Anomaly Detection) dùng AI local.
- Dashboard tích hợp: Output View, Input View, Project Summary.

## Cài đặt
1. Cấu hình PostgreSQL và tạo DB.
2. Sao chép `.env.example` thành `.env` và cập nhật `DATABASE_URL`.
3. Chạy migrations: `sqlx migrate run` (hoặc chạy file SQL trong `migrations/`).
4. Chạy server: `cargo run`.

## Kiến trúc
- `domain`: Định nghĩa Entity và kiểu dữ liệu tài chính (rust_decimal).
- `repository`: Tầng truy cập dữ liệu với cơ chế khóa hàng (Row Locking).
- `service`: Tầng xử lý logic nghiệp vụ và tính toán.
- `ai_engine`: Tích hợp ONNX Runtime cho các gợi ý thông minh.
- `api`: Các endpoint RESTful.
