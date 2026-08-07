# [OK] Plan created: docs/PLAN-database-metadata.md

## 🔴 Tổng quan nhiệm vụ
Thiết kế tài liệu đặc tả (Technical Specification) cho hệ thống lưu trữ `.pmp` (SQLite).

## 📋 Task Breakdown

### Phase 1: Context & Brand Alignment
- [ ] Định nghĩa bảng màu Anthropic trong header tài liệu.
- [ ] Thiết lập hệ thống Heading và Typography.

### Phase 2: Database Schema Documentation
- [ ] Tài liệu hóa bảng `projects` (Metadata dự án).
- [ ] Tài liệu hóa bảng `files` (Chỉ mục tệp và Metadata JSON).
- [ ] Tài liệu hóa các bảng phụ: `tasks`, `notes`, `project_folders`.
- [ ] Vẽ sơ đồ Mermaid cho quan hệ giữa các bảng.

### Phase 3: Metadata JSON Specification
- [ ] Mô tả các key phổ biến trong `metadata_json`.
- [ ] Ví dụ về cấu trúc JSON thực tế.

### Phase 4: Verification
- [ ] Kiểm tra tính chính xác của các kiểu dữ liệu (INTEGER, TEXT, TIMESTAMP).
- [ ] Đảm bảo các link file được gán đúng.

## 👥 Agent Assignments
- **Architect/Spec-writer**: Đảm nhận nội dung kỹ thuật.
- **UI/UX Designer (Anthropic Style)**: Đảm nhận phần trình bày CSS/Markdown.

## ✅ Verification Checklist
- [ ] Mermaid diagram render thành công.
- [ ] Database fields khớp với code Rust (`rusqlite`).
- [ ] Màu sắc đúng mã Hex của Anthropic.
