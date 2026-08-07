# PLAN: Refactor toàn bộ hệ thống (Frontend & Backend), Tái cấu trúc thư mục & Cập nhật Docs

## 1. Mục tiêu
- Refactor toàn diện Frontend React/TypeScript (`src/`) và Rust Backend (`src-tauri/`).
- Chuẩn hóa cấu trúc thư mục theo mô hình Domain-Driven Modular Architecture.
- Dọn dẹp thư mục rác, file backup (`BAK/`, tạm).
- Tái cấu trúc và gom nhóm hệ thống tài liệu (`docs/`) với bản đồ chỉ mục `docs/INDEX.md` mới.

## 2. Các bước thực hiện
1. **Frontend**: Tái cấu trúc `src/modules/*`, `src/shared/*`, `src/contracts/`.
2. **Backend**: Tái cấu trúc `src-tauri/crates/*` và `src-tauri/src/`.
3. **Docs**: Phân loại 110+ docs vào `architecture/`, `specs/`, `plans/`, `guides/`, `archive/` và cập nhật `docs/INDEX.md` + `README.md`.
4. **Kiểm tra**: Chạy `npm run typecheck`, `npm run lint`, `vitest`, và `cargo check`.
