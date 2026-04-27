# SPECIFICATION: .pmp Database Format (V2)

**Version**: 2.0.0  
**Status**: DRAFT / PROPOSED  
**Architect**: Antigravity Orchestrator  
**Tech Stack**: SQLite 3, Rust (Tauri), JSONB/Text JSON, FTS5

---

## 1. Tổng quan kiến trúc (Architecture Overview)

Định dạng `.pmp` V2 được thiết kế dựa trên triết lý **Local-first, Portable & Extensible**.

- **Storage**: SQLite 3 single-file.
- **Hybrid Data Model**: 
    - **Relational**: Dành cho core entities (Files, Projects, Tags) để đảm bảo Referential Integrity.
    - **Document-based (JSON)**: Dành cho Metadata động và Plugin data.
- **Portability**: Toàn bộ đường dẫn tệp được lưu ở dạng **Relative Path**, cho phép di chuyển cả thư mục dự án mà không hỏng database.
- **Search**: Tích hợp FTS5 để tìm kiếm nội dung và metadata siêu tốc.

---

## 2. Schema SQL đề xuất (Proposed Schema)

### Bảng Hệ thống (System)
```sql
CREATE TABLE sys_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Khởi tạo version
INSERT INTO sys_config (key, value) VALUES ('schema_version', '2.0.0');
PRAGMA user_version = 2;
```

### Bảng Dự án (Projects)
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY, -- UUID v4
    title TEXT NOT NULL,
    description TEXT,
    base_dir_hint TEXT,  -- Gợi ý root path khi ở máy cũ (để cảnh báo nếu lạc thư mục)
    metadata_json TEXT DEFAULT '{}', -- Thông tin bổ trợ dạng JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Bảng Tệp tin (Files)
```sql
CREATE TABLE files (
    id TEXT PRIMARY KEY, -- UUID v4
    project_id TEXT NOT NULL,
    rel_path TEXT NOT NULL, -- Đường dẫn tương đối (vd: data/docs/report.pdf)
    filename TEXT NOT NULL,
    extension TEXT,
    file_size INTEGER,
    hash_sha256 TEXT, -- Phục vụ deduplication và check integrity
    mime_type TEXT,
    status TEXT DEFAULT 'active', -- active, archived, missing
    metadata_json TEXT DEFAULT '{}', -- Metadata cực kỳ quan trọng (v2 standard)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_file_rel_path ON files (rel_path);
```

### Bảng Gắn thẻ (Taxonomy)
```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6a9bcc',
    category TEXT -- Grouping tags
);

CREATE TABLE file_tags (
    file_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (file_id, tag_id),
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

---

## 3. Metadata Design (Trái tim của V2)

Metadata sẽ được lưu ở dạng **Hybrid JSON**.

### Namespacing Rules:
- `system.*`: Do core app quản lý (ex: `system.last_index_time`).
- `analysis.*`: Kết quả từ AI/OCR (ex: `analysis.summary`, `analysis.entities`).
- `custom.*`: Của người dùng (ex: `custom.department`).
- `plugin_${name}.*`: Dữ liệu cho các plugin bên thứ 3.

### Ví dụ Metadata V2 Standard:
```json
{
  "meta_version": 2,
  "system": {
    "encoding": "UTF-8",
    "is_binary": true
  },
  "analysis": {
    "summary": "Bản thiết kế kỹ thuật cầu Lâm Đồng 2024",
    "ocr_content_snippet": "...",
    "detected_language": "vi"
  },
  "custom": {
    "contract_id": "HD-12345",
    "priority": "High"
  }
}
```

---

## 4. Versioning & Migration

### Chiến lược Migration:
1. **Detect Version**: Khi mở file, app gọi `PRAGMA user_version`.
2. **Version Mapping**:
   - `0`: Nâng cấp từ V1 (C# Legacy) lên V2.
   - `1`: V2 Alpha.
   - `2`: V2 Stable.
3. **Safe Migration**:
   - Chạy trong `TRANSACTION`.
   - Lưu `backup` tự động (tạo file `{name}.pmp.bak`) trước khi nâng cấp.
   - Sử dụng `ALTER TABLE` cho các trường mới.

---

## 5. File Storage Design (Relative Path Strategy)

### Quy trình tính toán Path:
1. **Root**: Vị trí file `.pmp` được coi là `Project Root`.
2. **RelPath**: Đường dẫn file thực tế tương đối với `Project Root`.
3. **Logic**:
   - `App Path = .pmp dir + rel_path`.
   - Nếu copy cả Folder dự án sang ổ đĩa khác, `.pmp dir` đổi nhưng `rel_path` giữ nguyên -> Vẫn chạy đúng.

---

## 6. Search System (FTS5)

Triển khai FTS5 để tìm kiếm mờ và không dấu.

```sql
-- Virtual table cho Full-text search
CREATE VIRTUAL TABLE fts_files_content USING fts5(
    file_id UNINDEXED, 
    content,
    tokenize="unicode61" -- Hỗ trợ Unicode
);

-- Trigger tự động sync nội dung khi thêm file
CREATE TRIGGER after_file_insert AFTER INSERT ON files BEGIN
    INSERT INTO fts_files_content(file_id, content) VALUES (new.id, new.filename);
END;
```

---

## 7. Flow Nâng cấp (Upgrade Flow)

1. **Check Integrity**: `PRAGMA integrity_check`.
2. **Identify V1**: Nếu table `projects` thiếu cột UUID hoặc có absolute path.
3. **Convert Path**: 
   - Lấy `root_path` cũ làm base.
   - Trừ đi base để ra `rel_path`.
4. **Seed Metadata**: Chuyển các field cũ vào `metadata_json`.

---

## 8. Chiến lược Mở rộng (Extensibility)

### Plugin-based Metadata:
Thay vì sửa schema cho từng loại file chuyên dùng (BIM, CAD), metadata JSON cho phép các Plugin tự định nghĩa cấu trúc:
```json
"plugin_cad_viewer": {
    "layer_count": 50,
    "thumbnail_ptr": "blob_id_123"
}
```

---

## 9. Ví dụ thực tế

### Insert một file mới với Metadata phức tạp:
```sql
INSERT INTO files (id, project_id, rel_path, filename, extension, metadata_json)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    '330e8400-e29b-41d4-a716-446655441111',
    'drawings/bridge_plan.dwg',
    'bridge_plan',
    'dwg',
    '{"analysis": {"type": "Blueprint"}, "custom": {"archived": false}}'
);
```

---
*Tài liệu được thiết kế bới Senior Database Designer Antigravity.*
