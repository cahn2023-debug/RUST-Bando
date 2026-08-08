# Backend Rust Architecture

## Overview
Backend được viết bằng **Rust** chạy trên framework **Tauri v2** sử dụng **Tokio async runtime**.

## Modular Crates (`src-tauri/crates/`)
- **`app_domain`**: Business logic chính của ứng dụng quản lý hồ sơ và thiết kế.
- **`gis_engine`**: Engine xử lý tọa độ, không gian, tính toán hình học GIS và xuất nhập GeoJSON/Shapefile.
- **`module_gis`**: Quản lý dữ liệu bản đồ GIS và kết nối database SQLite.
- **`module_p2p`**: Xử lý đồng bộ dữ liệu mạng ngang hàng / P2P nếu kích hoạt.
- **`shared_kernel`**: Các hàm dùng chung, error handling, logging và utilities.

## Quality & Checks
- `npm run check:backend`: Chạy `cargo fmt`, `cargo check`, `cargo test` và `cargo clippy`.
