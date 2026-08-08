# Frontend Architecture

## Overview
Frontend ứng dụng được xây dựng trên **React 19 + TypeScript + Vite** kết hợp **MapLibre GL** cho hiển thị bản đồ GIS hiệu năng cao.

## Key Modules
- **Design Feature (`src/modules/design`)**: Quản lý bản vẽ thiết kế, hạ tầng, lớp phủ GIS (mapLibreFastAdapter, canvas renderers).
- **Contracts (`src/contracts`)**: Các kiểu dữ liệu đồng bộ 1-1 với Rust Structs để đảm bảo type-safe IPC qua Tauri invoke.
- **State Management**: Zustand stores quản lý trạng thái UI, bản đồ, lớp dữ liệu và cài đặt.
- **Styling**: Tailwind CSS v4 kết hợp CSS Variables và Lucide React icons.

## Quality & Scripts
- `npm run check:frontend`: Chạy check encoding, boundaries, typecheck, lint, test:ci và build.
- `npm run test`: Vitest cho unit test và integration test.
