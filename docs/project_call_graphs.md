# Project Call Graphs (Graph-it-Live Compatible)

Tài liệu này cung cấp các sơ đồ luồng gọi hàm (Call Graph) chi tiết cho các tính năng cốt lõi của dự án, được thiết kế để hiển thị "live" qua extension **Graph-it-Live**.

## 1. Luồng Nạp Dự Án (.pmp)
Sơ đồ mô tả quá trình từ khi người dùng chọn file đến khi Database và UI được cập nhật.

```mermaid
sequenceDiagram
    participant Frontend as UI (Vite/TS)
    participant IPC as Tauri Command (lib.rs)
    participant ProjectCmd as commands::project::load_pmp_file
    participant DB as db::open_project_db
    participant Schema as db::schema::apply_base_schema
    participant Config as modules::core::config::save_config
    participant Event as Emitter (project-opened)

    Frontend->>IPC: invoke("load_pmp_file", {path})
    IPC->>ProjectCmd: call load_pmp_file
    ProjectCmd->>DB: execute open_project_db
    DB->>DB: Clear old connection & locks
    DB->>Schema: apply_base_schema (SQLite DDL)
    ProjectCmd->>Config: save_config_internal (Save last opened)
    ProjectCmd->>Event: emit("project-opened", project_data)
    ProjectCmd-->>Frontend: Return Project Object
```

## 2. Luồng Lấy Cấu Trúc File (File Tree)
Mối quan hệ giữa Project State và hệ thống File System.

```mermaid
graph LR
    subgraph Frontend
        TreeView[File Tree View]
    end

    subgraph Backend_Commands
        GetTree[file_tree::get_project_tree]
    end

    subgraph Logic_Layer
        Ingest[ingestion::doc_parser]
    end

    subgraph Persistence
        SQLite[(SQLite projects.db)]
    end

    TreeView -->|Request| GetTree
    GetTree -->|Query| SQLite
    GetTree -->|Scan FS| Ingest
    Ingest -->|Return Metadata| GetTree
    GetTree -->|JSON| TreeView
```

## 3. Luồng Phân Tích AI & Contract
Sơ đồ tương tác giữa AI Engine và dữ liệu Hợp đồng.

```mermaid
graph TD
    subgraph AI_Feature [Feature: AI Analysis]
        AIA[commands::contract_analysis::analyze_contract_advanced]
    end

    subgraph AI_Engine
        Model[Qwen 0.5B ONNX]
        Memory[implement::modules::core::config::release_ai_memory]
    end

    subgraph Results
        BOM[get_project_bom_table]
        DB_Save[save_contract_analysis]
    end

    AIA -->|Execute Inference| Model
    Model -->|Output JSON| AIA
    AIA -->|Persist| DB_Save
    DB_Save -.->|Update| BOM
    AIA -->|Cleanup| Memory
```

## Giải thích kỹ thuật cho Graph-it-Live:
- **Automatic Parsing**: Extension sẽ tự động parse các file `.rs` và `.ts` của sếp. Tuy nhiên, các sơ đồ trên giúp tóm tắt **mối quan hệ bắc cầu** giữa các tầng mà công cụ tự động có thể bỏ sót.
- **Cross-file Sync**: Các tham chiếu trong sơ đồ Mermaid khớp chính xác với tên hàm và module trong mã nguồn (`src-tauri/src`).
