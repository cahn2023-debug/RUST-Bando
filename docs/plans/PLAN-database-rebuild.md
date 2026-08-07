# Kế hoạch nâng cấp Database Schema (V4)

Dự án yêu cầu mở rộng bộ Schema để hỗ trợ đầy đủ các tính năng GIS chuyên nghiệp, quản lý tài liệu đính kèm và nhật ký thay đổi (History Log).

## Các thay đổi đề xuất

### 1. Backend (Rust) - Database Migration
#### [MODIFY] [mod.rs](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/src-tauri/src/IMPLEMENT/db/mod.rs)
- Cập nhật hàm `apply_base_schema` để thêm các bảng:
    - `project_settings`: Lưu `epsg_code` (3857), `units`, v.v.
    - `design_styles`: Lưu Symbology (color, width, icons).
    - `audit_logs`: Lưu nhật ký thay đổi (`user_id`, `action`, `old_values`, `new_values`).
    - `feature_attachments`: Liên kết Feature với Files.
    - `roles` & `personnel_roles`: Quản lý quyền hạn.
- Cập nhật danh sách `migrations` trong `open_project_db` để tự động nâng cấp các file `.pmp` cũ.

#### [MODIFY] [models.rs](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/src-tauri/src/IMPLEMENT/commands/models.rs)
- Thêm các Struct tương ứng: `ProjectSettings`, `DesignStyle`, `AuditLog`, `FeatureAttachment`.

### 2. Logic & Synchronization
#### [MODIFY] [state.rs](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/src-tauri/src/IMPLEMENT/modules/design/design_events/state.rs)
- Cập nhật logic `apply_event` để ghi log vào bảng `audit_logs` khi có sự thay đổi dữ liệu GIS.

## Kế hoạch thực hiện

1. **Phase 1**: Cập nhật Schema & Migrations trong `db/mod.rs`.
2. **Phase 2**: Cập nhật Models trong `commands/models.rs`.
3. **Phase 3**: Khởi tạo dữ liệu mặc định (Seed data) cho hệ tọa độ và Styles căn bản.
4. **Phase 4**: Viết các Tauri Commands mới để quản lý Settings và Styles.

## Kiểm chứng (Verification)

### Kiểm thử tự động
- Chạy `cargo test` để đảm bảo migration không làm hỏng dữ liệu cũ.
- Thực hiện mở một file `.pmp` cũ để kiểm tra quá trình auto-migration.

### Kiểm thử thủ công
- Sử dụng SQLite Browser để kiểm tra các bảng mới đã được tạo đúng cấu trúc.
- Kiểm tra tính năng History Log bằng cách thực hiện một thao tác trên bản đồ và check bảng `audit_logs`.
