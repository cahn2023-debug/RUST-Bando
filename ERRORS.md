# 🐛 Error Log - RUST

> Tập hợp tất cả lỗi xảy ra trong quá trình phát triển (Auto-generated).

---

## Thống kê nhanh
- **Tổng lỗi**: 4
- **Đã sửa**: 4

---

<!-- Errors sẽ được agent tự động ghi vào đây -->

## [2026-02-24 18:15] - Tauri Dialog Plugin Capability Missing
- **Type**: Configuration Error
- **Severity**: High
- **Root Cause**: Tauri v2 ACL capabilities for `dialog:default` were omitted, preventing prompts.
- **Fix Applied**: Appended `"dialog:default"` in `capabilities/default.json`.
- **Status**: Fixed

---

## [2026-02-24 18:23] - SQLite NOT NULL constraint failed: projects.root_path
- **Type**: Logic Error
- **Severity**: High
- **Root Cause**: `create_project` omitted `root_path`.
- **Fix Applied**: Auto-calculated `root_path` from file path parent.
- **Status**: Fixed

---

## [2026-02-24 18:56] - SQLite Dynamic Typing vs Rust Strict Typing Panic
- **Type**: Integration Error
- **Root Cause**: Legacy C# PMP stored integers in TEXT columns (e.g. project name `2234`). Rusqlite panicked when strict mapping `String`.
- **Fix Applied**: Modified `get_projects`, `get_tasks`, `get_notes` to `CAST(column AS TEXT)` to force SQLite to cast dynamically typed values before Rust sees them.
- **Status**: Fixed

---

## [2026-02-24 19:20] - Empty UI on Single-File Multiple-Project SQLite Db
- **Type**: Logic Error
- **Root Cause**: The UI auto-selected `projects[0]` based on `ORDER BY created_at DESC`. My `create_project` test accidentally appended an empty project record into `122.pmp` today, hiding the original 2025 project data.
- **Fix Applied**: Altered query to `ORDER BY id ASC` prioritizing the oldest/original project so data correctly loads.
- **Status**: Fixed
