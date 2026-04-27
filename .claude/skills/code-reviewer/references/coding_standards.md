# Rust Coding Standards

## 📏 Naming Conventions
- **Files & Modules:** `snake_case` (ví dụ: `module_storage.rs`).
- **Types (Structs, Enums, Traits):** `PascalCase` (ví dụ: `StorageManager`).
- **Functions & Variables:** `snake_case` (ví dụ: `get_file_list`).
- **Constants:** `SCREAMING_SNAKE_CASE` (ví dụ: `MAX_RETRY_COUNT`).

## 📚 Documentation
- Sử dụng `///` cho các phần tử public (struct, function, trait).
- Sử dụng `//!` để mô tả module ở đầu file.
- Documentation nên bao gồm phần `# Examples`, `# Errors` (nếu có trả về Result) và `# Safety` (nếu là unsafe).

## 🧩 Workspace & Dependency Management
- Chia nhỏ ứng dụng thành các module hoặc sub-crates nếu project lớn.
- Sử dụng `Cargo.toml` workspace để quản lý các crates dùng chung.
- Luôn giữ dependencies ở phiên bản phù hợp, tránh dùng `*` hoặc các bản alpha/beta thiếu ổn định trừ khi bắt buộc.

## ⚙️ CI/CD & Formatting
- Luôn chạy `cargo fmt` trước khi commit.
- Chạy `cargo clippy` và sửa hết cảnh báo.
- Ưu tiên sử dụng `cargo check` trong quá trình phát triển để giảm thời gian chờ.
