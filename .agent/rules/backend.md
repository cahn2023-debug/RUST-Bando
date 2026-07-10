---
trigger: glob
glob: "**/*.{py,js,ts,go,rs,sql,php,java,dockerfile,tf,yaml,yml}"
---

# BACKEND.MD - Systems & Logic Standards

> **Mục tiêu**: Một bộ luật duy nhất quản lý toàn bộ Logic, Dữ liệu và Hạ tầng. Hiệu suất cao - Không chồng chéo.

---

## 🏗️ 1. ARCHITECTURE & EVENT SOURCING

1. **V2 Pattern (Event Sourcing)**: 
   - `EventStore` là source of truth duy nhất.
   - `Projections` chỉ là dữ liệu dẫn xuất (Read Model).
   - Tuyệt đối không xóa/sửa event trong log.
2. **Command Handling**: Command phải atomic, kiểm tra precondition trước khi phát event.
3. **API Contracts**: Response thống nhất `{ success: true, data: any, error: string | null }`.

---

## 🗄️ 2. DATABASE: SQLITE & DUCKDB

1. **SQLite (OLTP)**: Lưu trữ cấu trúc và Event log. Chuẩn hóa 3NF cho Read Model.
2. **DuckDB (OLAP)**: 
   - Dùng cho truy vấn phân tích GIS và báo cáo dữ liệu lớn.
   - Đồng bộ dữ liệu định kỳ hoặc theo lô từ SQLite sang DuckDB.
3. **Indexing Strategy**: Bắt buộc Index cho FK và các trường truy vấn Map (Feature ID, Layer ID).

---

## ☁️ 3. DEVOPS & SYSTEMS

1. **Config**: 12-Factor App. Dùng biến môi trường cho bí mật (Secrets).
2. **Cargo (Rust)**: Tối ưu Release profile (LTO, codegen-units) để đạt hiệu năng tối đa.
3. **CI/CD**: Tự động test logic Event sourcing trước khi deploy.

---

## 🛡️ 4. ERROR & OBSERVABILITY

1. **Structured Logs**: Sử dụng JSON logging cho sản phẩm.
2. **Graceful Degradation**: Nếu AI Engine hoặc DuckDB lỗi, hệ thống phải fallback về SQLite truyền thống mà không làm crash app.
