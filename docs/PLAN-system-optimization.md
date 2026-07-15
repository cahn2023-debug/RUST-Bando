# Chiến lược Tối ưu hóa Hệ thống Bando V2

Kế hoạch này thực hiện tối ưu hóa toàn diện dự án theo 6 giai đoạn, tập trung vào hiệu năng (Rust/SQLite), giảm tech debt (Frontend/TSC) và chuẩn hóa theo kiến trúc V2.

## User Review Required

> [!IMPORTANT]
> - **Giai đoạn 2 (SQLite WAL/Pragma)**: Thay đổi cấu hình SQLite có thể ảnh hưởng đến file .pmp cũ. Cần backup trước khi thực hiện.
> - **Giai đoạn 3 (Debounce IPC)**: Có thể thay đổi cảm giác UI (tính phản hồi tức thì vs độ trễ batch).
> - **Giai đoạn 5 (Xóa code)**: Sẽ xóa các component/utils cũ. Cần xác nhận không có tính năng ẩn nào đang phụ thuộc.

## Proposed Changes

### Phase 1: Audit & Phân tích tĩnh (ĐANG THỰC HIỆN)
- [x] Chạy `cargo tree --duplicates` tìm library trùng.
- [x] Chạy `cargo clippy -- -W dead_code` tìm code chết backend.
- [x] Chạy `tsc --noEmit` tìm lỗi type & code chết frontend.
- [ ] Lập danh sách file/module cần xóa.

### Phase 2: Tối ưu Backend (Rust/Actor/SQLite)
- [ ] **Pipepline**: Chuyển sang bounded channels, giảm `Arc::clone`.
- [ ] **SQLite**: Bật WAL mode, tối ưu `PRAGMA`.
- [ ] **StorageWorker**: Batch metadata updates dùng transaction.

### Phase 3: Tối ưu Frontend & IPC
- [ ] **IPC Bridge**: Implement debounce/throttle cho `update_metadata`.
- [ ] **State Management**: Xóa state dư thừa, chuyển sang derived state.
- [ ] **React**: memoize component nặng trong `CADPanels`.

### Phase 4: GIS & Core Modules
- [ ] **GIS Engine**: Cache kết quả topology.
- [ ] **Calculations**: Vector hóa tọa độ dùng `ndarray`/`rayon`.

### Phase 5: Dọn dẹp & Chuẩn hóa
- [ ] **Cleanup**: Xóa toàn bộ code chết đã xác định ở Phase 1.
- [ ] **Naming**: Chuẩn hóa snake_case backend/camelCase frontend qua serde.
- [ ] **Specta**: Auto-generate types từ Rust sang TS.

### Phase 6: Xác minh & SSOT
- [ ] Chạy Integration tests.
- [ ] Cập nhật `project_index.html`.
- [ ] Thiết lập Pre-commit hooks.

## Verification Plan

### Automated Tests
- `cargo test` cho logic Actor & Storage.
- Benchmark latency IPC dùng `tauri-action` hoặc script custom.
- `tsc --noEmit` phải đạt 0 lỗi.

### Manual Verification
- Kiểm tra tính ổn định của file .pmp khi tạo/mở dự án.
- Verify Search V2 (FTS5) hoạt động nhanh hơn.
