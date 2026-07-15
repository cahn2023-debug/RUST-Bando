# 🚨 Plan Fix Lỗi Tạo File `.pmp` Mới
## Error: `no such table: pmp_metadata`

> **Mục tiêu**: Khắc phục lỗi khi tạo project mới, đảm bảo schema V2 được áp dụng đúng cách trước khi insert dữ liệu vào bảng `pmp_metadata`.

---

## 📋 Mục Lục

1. [Phân tích nguyên nhân gốc rễ](#-phân-tích-nguyên-nhân-gốc-rễ)
2. [Plan Fix Theo Priority](#-plan-fix-theo-priority)
3. [Checklist Hoàn Thành](#-checklist-hoàn-thành)
4. [Quick Fix (Hotfix 15 phút)](#-quick-fix-hotfix-15-phút)
5. [Tham chiếu Knowledge Graph](#-tham-chiếu-knowledge-graph)

---

## 🔍 Phân tích nguyên nhân gốc rễ

```
CreateProjectModal.tsx:48 → Failed to set project_id in metadata: no such table: pmp_metadata
```

| Nguyên nhân khả dĩ | Mô tả | File liên quan |
|---|---|---|
| **❌ Schema V2 chưa được áp dụng** | Khi tạo project mới, DB được khởi tạo nhưng `apply_v2_schema()` chưa chạy → table `pmp_metadata` chưa tồn tại | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` |
| **❌ Dùng legacy DB init path** | Code gọi `initialize_database()` (V1) thay vì `open_v2_connection()` + `apply_v2_schema()` (V2) | `src-tauri/src/domain/implement/db/mod.rs` vs `v2/storage/db_config.rs` |
| **❌ Race condition** | Insert vào `pmp_metadata` xảy ra trước khi transaction tạo table hoàn tất | `project_v2_commands.rs` → `schema.rs` |
| **❌ Missing migration step** | Project mới không qua bước `V1ToV2Migrator` để đảm bảo schema chuẩn | `v2/migration/engine.rs` |

---

## 🛠️ Plan Fix Theo Priority

### ✅ Phase 1: Xác minh & Reproduce (30 phút)

```bash
# 1. Kiểm tra DB file có được tạo không
ls -la "D:\Code Antinigaty\Phan mem quan ly file V4\Du_an_165.pmp"

# 2. Mở DB bằng DuckDB CLI để verify tables
duckdb "Du_an_165.pmp" -c ".tables"

# 3. Kiểm tra xem pmp_metadata có tồn tại không
duckdb "Du_an_165.pmp" -c "SELECT name FROM sqlite_master WHERE type='table' AND name='pmp_metadata';"
```

**Expected result**: Nếu `pmp_metadata` không xuất hiện → confirm schema V2 chưa được áp dụng.

---

### ✅ Phase 2: Fix Backend – Đảm bảo Schema V2 được áp dụng khi tạo project mới

#### 🔧 Step 2.1: Sửa `project_v2_commands.rs` (CreateProjectV2)

**File**: `src-tauri/src/domain/implement/commands/project_v2_commands.rs`

```rust
// BEFORE (có thể thiếu bước apply schema)
pub async fn create_project_v2(
    request: CreateProjectV2Request,
) -> Result<CreateProjectV2Response, AppError> {
    let db = get_v2_db(&request.project_path)?;
    // ❌ Thiếu: apply_v2_schema(&db)?;
    
    // Insert vào pmp_metadata → FAIL nếu table chưa tồn tại
    db.execute("INSERT INTO pmp_metadata ...", params![])?;
    // ...
}

// AFTER (fix)
use crate::domain::implement::modules::v2::storage::schema::apply_v2_schema;

pub async fn create_project_v2(
    request: CreateProjectV2Request,
) -> Result<CreateProjectV2Response, AppError> {
    let db = open_v2_connection(&request.project_path)?; // ✅ Dùng V2 connection
    
    // ✅ Áp dụng schema NGAY SAU khi mở DB mới
    apply_v2_schema(&db)?;
    apply_performance_pragmas(&db)?; // ✅ Tối ưu performance
    
    // ✅ Đảm bảo pmp_metadata tồn tại trước khi insert
    ensure_pmp_metadata(&db, &request.project_id)?;
    
    // Insert an toàn
    db.execute("INSERT INTO pmp_metadata (project_id, ...) VALUES (?, ...)", 
        params![request.project_id, ...])?;
    
    Ok(CreateProjectV2Response { success: true, ... })
}
```

#### 🔧 Step 2.2: Update `helpers.rs` – Chuẩn hóa `get_v2_db`

**File**: `src-tauri/src/domain/implement/commands/helpers.rs`

```rust
// Đảm bảo get_v2_db luôn trả về DB đã qua schema init
pub fn get_v2_db(project_path: &str) -> Result<Connection, AppError> {
    let db = open_v2_connection(project_path)?;
    
    // ✅ Luôn check & apply schema nếu là DB mới
    if !is_standard_v2(&db)? {
        apply_v2_schema(&db)?;
        seal_as_v2_standard(&db)?; // ✅ Đánh dấu DB đã chuẩn V2
    }
    
    Ok(db)
}
```

---

### ✅ Phase 3: Fix Frontend – Handle error & retry logic

#### 🔧 Step 3.1: Update `CreateProjectModal.tsx`

**File**: `src/modules/implement/features/project-management/CreateProjectModal.tsx`

```typescript
// BEFORE
const handleSubmit = async () => {
  try {
    await invoke('create_project_v2', { request });
    // ❌ Không handle lỗi schema
  } catch (err) {
    console.error('Failed to set project_id in meta', err);
  }
};

// AFTER
const handleSubmit = async () => {
  try {
    const response = await invoke<CreateProjectV2Response>('create_project_v2', { 
      request: {
        project_id: newProjectId,
        project_path: projectPath,
        // ... other fields
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Unknown error');
    }
    
    // ✅ Success: load project vào store
    await loadProject(newProjectId);
    
  } catch (err: any) {
    // ✅ Handle specific schema error
    if (err.message?.includes('no such table: pmp_metadata')) {
      // Retry với force schema init
      try {
        await invoke('apply_v2_schema_force', { project_path: projectPath });
        // Retry create
        await invoke('create_project_v2', { request });
      } catch (retryErr) {
        showError('Failed to initialize project database. Please try again.');
      }
    } else {
      showError(`Create project failed: ${err.message}`);
    }
  }
};
```

#### 🔧 Step 3.2: Add IPC command mới (optional nhưng recommended)

**File**: `src-tauri/src/domain/implement/commands/project_v2_commands.rs`

```rust
#[tauri::command]
pub async fn apply_v2_schema_force(
    project_path: String,
) -> Result<bool, String> {
    let db = open_v2_connection(&project_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    
    apply_v2_schema(&db)
        .map_err(|e| format!("Failed to apply schema: {}", e))?;
    
    seal_as_v2_standard(&db)
        .map_err(|e| format!("Failed to seal DB: {}", e))?;
    
    Ok(true)
}
```

Và register trong `mod.rs`:

```rust
// src-tauri/src/domain/implement/commands/mod.rs
pub use project_v2_commands::{
    create_project_v2, search_v2, apply_v2_schema_force, // ✅ Add new command
    // ... other exports
};
```

---

### ✅ Phase 4: Test & Validate

#### 🧪 Test Case 1: Tạo project mới hoàn toàn

```bash
# Clean test environment
rm -rf "D:\Code Antinigaty\Phan mem quan ly file V4\Test_New_Project.pmp"

# Run app và tạo project mới qua UI
# ✅ Expected: Project created successfully, no "no such table" error

# Verify DB structure
duckdb "Test_New_Project.pmp" -c ".tables"
# ✅ Expected output includes: pmp_metadata, projects, tasks, features, ...
```

#### 🧪 Test Case 2: Mở project cũ (V1 → V2 migration)

```bash
# Copy project V1 cũ
cp "old_project_v1.pmp" "migrated_test.pmp"

# Open trong app V2
# ✅ Expected: Auto-migration chạy, pmp_metadata được tạo, project load bình thường
```

#### 🧪 Test Case 3: Stress test – tạo nhiều project liên tiếp

```typescript
// Test script
for (let i = 0; i < 10; i++) {
  await createProject(`Test_Project_${i}`);
  // ✅ All should succeed without schema errors
}
```

---

## ✅ Checklist Hoàn Thành

- [ ] **Backend**: `create_project_v2` gọi `apply_v2_schema()` trước khi insert
- [ ] **Backend**: `get_v2_db()` đảm bảo schema init cho DB mới
- [ ] **Backend**: Thêm `ensure_pmp_metadata()` helper để safe insert
- [ ] **Frontend**: `CreateProjectModal.tsx` handle lỗi `no such table` + retry logic
- [ ] **IPC**: Register command mới `apply_v2_schema_force` (optional)
- [ ] **Test**: Verify `.tables` trong DuckDB có `pmp_metadata` sau khi tạo project
- [ ] **Test**: Tạo 5-10 project mới liên tiếp không lỗi
- [ ] **Test**: Mở project V1 cũ → migration tự động thành công
- [ ] **Build**: `cargo clean && cargo build --release` thành công
- [ ] **Type-check**: `npm run type-check` không warning/error

---

## ⚡ Quick Fix (Nếu cần hotfix ngay)

Nếu bạn cần fix nhanh trong 15 phút:

### 1️⃣ Sửa ngay `project_v2_commands.rs`

```rust
// Thêm dòng này NGAY SAU khi mở DB trong create_project_v2:
apply_v2_schema(&db)?;  // ← Dòng quan trọng nhất
```

### 2️⃣ Rebuild backend

```bash
cd src-tauri && cargo build --release
```

### 3️⃣ Test lại tạo project

→ Lỗi `no such table: pmp_metadata` sẽ biến mất.

---

## 🔗 Tham chiếu Knowledge Graph

| Component | File Path | Vai trò trong fix |
|---|---|---|
| `apply_v2_schema` | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` | ✅ Tạo table `pmp_metadata` + các table V2 |
| `open_v2_connection` | `src-tauri/src/domain/implement/modules/v2/storage/db_config.rs` | ✅ Mở connection DuckDB chuẩn V2 |
| `ensure_pmp_metadata` | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` | ✅ Safe insert vào metadata |
| `seal_as_v2_standard` | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` | ✅ Đánh dấu DB đã chuẩn V2 |
| `CreateProjectV2Request` | `src-tauri/src/domain/implement/commands/project_v2_commands.rs` | ✅ IPC payload tạo project |
| `CreateProjectModal.tsx` | `src/modules/implement/features/project-management/CreateProjectModal.tsx` | ✅ Frontend trigger + error handle |
| `is_standard_v2` | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` | ✅ Check DB đã chuẩn chưa |
| `PmpMetadata` | `src-tauri/src/domain/implement/modules/v2/storage/schema.rs` | ✅ Struct định nghĩa bảng metadata |

---

## ⚠️ Lưu ý quan trọng

> 💡 **Sau khi fix, hãy xóa cache DB test trước khi test lại**, vì DuckDB có thể cache schema. Dùng `cargo clean` + xóa file `.pmp` cũ để đảm bảo test sạch.

> ⚠️ **Không xóa `V1ToV2Migrator`** cho đến khi 100% user đã convert project cũ. Giữ nó như CLI tool nội bộ.

> 🔐 **Frontend type safety**: Dùng `zod` hoặc strict type-check để ép buộc JSON response match struct Rust V2, tránh crash do mismatch.

---

## 📎 Phụ lục: DuckDB Commands Hữu Ích

```sql
-- Xem tất cả tables trong DB
.tables

-- Xem schema của table pmp_metadata
.schema pmp_metadata

-- Kiểm tra version schema
SELECT * FROM pmp_metadata LIMIT 1;

-- Count số records
SELECT COUNT(*) FROM pmp_metadata;

-- Export schema ra file
.output schema_dump.sql
.schema
.output stdout
```

---

> **Tác giả**: BK-Graph Engine + Assistant  
> **Ngày tạo**: {{CURRENT_DATE}}  
> **Phiên bản**: 1.0  
> **Status**: ✅ Ready for implementation

---

*Bạn có thể lưu file này thành `FIX_PMP_METADATA_ERROR.md` trong thư mục docs của project để team cùng tham khảo.* 🚀