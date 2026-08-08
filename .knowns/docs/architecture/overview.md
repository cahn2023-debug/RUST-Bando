# Project Manager - Overall Architecture

Phần mềm Desktop chuyên dụng hỗ trợ Quản lý Hồ sơ Thiết kế, Quy hoạch Bản đồ (GIS Engine) và Vận hành Hạ tầng viễn thông/công trình.

## Core Tech Stack
- **Frontend**: React 19, TypeScript, MapLibre GL, Tailwind CSS v4, Zustand.
- **Backend Core**: Rust (Tauri v2) - Async Runtime (Tokio) + SQLite (rusqlite/FTS5) + Custom GIS Engine.
- **Data & Local Storage**: SQLite (`sqlite.db`) với full-text search FTS5 và spatial indexing.

## Directory Structure
- `src/`: Frontend React/TypeScript application.
  - `src/contracts/`: Type-safe contracts & schemas với Rust backend.
  - `src/core/`: Core basemap & base services.
  - `src/modules/`: Modular domain features (design, analytics, contract, map, tool).
  - `src/shared/`: Shared utilities & components.
- `src-tauri/`: Rust Backend application.
  - `src-tauri/crates/`: Modular Rust crates (`app_domain`, `gis_engine`, `module_gis`, `module_p2p`, `shared_kernel`).
  - `src-tauri/src/`: Main Tauri entrypoint & IPC command handlers.
- `docs/`: Tài liệu chi tiết kiến trúc, kế hoạch, đặc tả và hướng dẫn.
