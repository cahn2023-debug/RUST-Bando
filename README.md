# Project Manager - Desktop Architecture

Phần mềm Desktop chuyên dụng hỗ trợ Quản lý Hồ sơ Thiết kế, Quy hoạch Bản đồ (GIS Engine) và Vận hành Hạ tầng viễn thông/công trình.

---

## 🏗️ Kiến trúc Công nghệ (Architecture)

- **Frontend**: React 19 + TypeScript + MapLibre GL + Tailwind CSS v4 + Zustand
- **Backend Core**: Rust (Tauri v2) - Async Runtime (Tokio) + SQLite (rusqlite/FTS5) + Custom GIS Engine
- **Modular Structure**:
  - Frontend: `src/modules/*` (domain features), `src/shared/*`, `src/contracts/*`
  - Backend: `src-tauri/crates/*` (app_domain, gis_engine, module_gis, module_p2p, shared_kernel)

---

## 📁 Cấu trúc Thư mục Hệ thống

```
RUST/
├── docs/                        # Tài liệu dự án (Tái cấu trúc theo domain)
│   ├── architecture/            # Đặc tả kiến trúc Frontend & Backend Rust
│   ├── plans/                   # Kế hoạch nâng cấp hệ thống (PLAN-*.md)
│   ├── specs/                   # Đặc tả yêu cầu tính năng & hợp đồng (SPEC_*.md)
│   ├── guides/                  # Hướng dẫn phát triển, vận hành & quy trình
│   ├── archive/                 # Kho lưu trữ tài liệu kế hoạch cũ
│   └── INDEX.md                 # Bản đồ chỉ mục toàn bộ tài liệu dự án
├── src/                         # Frontend React/TypeScript
│   ├── contracts/               # Type-safe Contracts & Schemas với Backend
│   ├── core/                    # Core basemap & services
│   ├── modules/                 # Modular Domain Features (design, analytics, contract, tool...)
│   └── shared/                  # Utilities & Shared Services
├── src-tauri/                   # Rust Backend (Tauri App)
│   ├── crates/                  # Modular Rust Crates (gis_engine, app_domain...)
│   └── src/                     # Main Tauri Application & Command Handlers
```

---

## 🚀 Khởi chạy Môi trường Phát triển (Local Development)

```bash
# Cài đặt thư viện Frontend
npm install

# Khởi chạy giao diện Dev (Vite)
npm run dev

# Khởi chạy toàn bộ ứng dụng Tauri (Frontend + Rust Backend)
npm run tauri dev

# Kiểm tra TypeCheck & Tests
npm run typecheck
npm run test:ci
```

---

## 📚 Tài liệu Chi tiết

Truy cập [docs/INDEX.md](file:///d:/Code%20Antinigaty/RUST/docs/INDEX.md) để tìm hiểu thêm chi tiết kiến trúc, quy trình vận hành và tài liệu kỹ thuật của dự án.
