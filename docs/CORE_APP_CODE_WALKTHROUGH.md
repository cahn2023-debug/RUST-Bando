# Core App Code Walkthrough

## Refactor Update (2026-04-05)

Current canonical path mapping after the refactor:

- `src/main.tsx` -> `src/HOME/main.tsx`
- `src/App.tsx` -> `src/HOME/App.tsx`
- `src/hooks/useProjectManager.ts` -> `src/IMPLEMENT/hooks/useProjectManager.ts`
- `src/hooks/useProjectData.ts` -> `src/IMPLEMENT/hooks/useProjectData.ts`
- `src/stores/useDesignSync.ts` -> `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/components/ui/Ribbon.tsx` -> `src/DESIGN/components/ui/Ribbon.tsx`
- `src/features/project-management/ProjectDetail.tsx` -> `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`
- `src/features/contract/*` -> `src/IMPLEMENT/features/contract/*`
- `src/features/files/*` -> `src/IMPLEMENT/features/files/*`
- `src/features/inventory/*` -> `src/IMPLEMENT/features/inventory/*`
- `src/lib/firebase.ts` -> `src/IMPLEMENT/lib/firebase.ts`
- `src/lib/tauri.ts` -> `src/IMPLEMENT/lib/tauri.ts`
- `src-tauri/src/commands/*` -> `src-tauri/src/IMPLEMENT/commands/*`
- `src-tauri/src/modules/*` -> `src-tauri/src/IMPLEMENT/modules/*`

Backend ownership after the refactor:

- `src-tauri/src/main.rs` is now a thin entrypoint.
- The Tauri builder is owned by `src-tauri/src/lib.rs`.
- Runtime bootstrap is owned by `src-tauri/src/IMPLEMENT/modules/bootstrap.rs`.

## Tóm tắt

Tài liệu này tổng hợp phần ứng dụng chính của repo, tập trung vào:

- `src/`: frontend React + TypeScript
- `src-tauri/src/`: backend Tauri + Rust
- `financial_system/`: hệ Rust phụ trợ chạy độc lập cho bài toán tài chính dự án

Phạm vi ở đây là chức năng, luồng xử lý, cấu trúc module và các đoạn code trọng yếu cần hiểu để onboarding hoặc tiếp tục phát triển. Tài liệu không giải thích từng dòng toàn repo.

## 1. Bức tranh kiến trúc

Đây là một ứng dụng desktop Tauri với kiến trúc hai tầng:

- Frontend: React 19, TypeScript, Zustand, Vite, Tailwind.
- Backend desktop: Rust/Tauri, SQLite, command-based IPC qua `invoke`.
- Core CAD/map state: event sourcing + snapshot/binary hydration.
- AI: bật/tắt bằng cấu hình (`enable_ai`), chỉ khởi tạo khi cần.
- Multi-window: app chính có thể mở cửa sổ phụ `analysis`, `print`, `streetview`.

### Các trụ cột chức năng đang hiện diện trong code

- Quản lý project/workspace `.pmp`
- Quản lý task, note, contract, material
- Thiết kế CAD/GIS trên nền bản đồ
- Quản lý cây file và preview tài liệu
- Phân tích hợp đồng/BOM, có lớp AI và cache metadata
- Import dữ liệu từ Excel/KML/KMZ
- Export ZIP/KMZ/Excel, in ấn, cửa sổ phân tích riêng
- Cấu hình app, auth Firebase/Google, AI model lifecycle

## 2. Entrypoint và bootstrap

### Frontend bootstrap: `src/HOME/main.tsx`

`src/HOME/main.tsx` là entrypoint của frontend. File này:

- tải CSS và i18n
- gắn `ErrorBoundary`
- lazy-load theo query string `view`
- render một trong bốn chế độ:
  - `App`
  - `AnalysisWindow`
  - `PrintWindow`
  - `StreetViewPage`

Ý nghĩa kỹ thuật:

- một bundle frontend phục vụ nhiều webview/window
- startup tối ưu bằng `lazy` + `Suspense`
- tắt context menu mặc định toàn cục để tạo cảm giác native hơn

### Main app shell: `src/HOME/App.tsx`

`src/HOME/App.tsx` là shell của cửa sổ chính. File này giữ những nhánh điều hướng quan trọng nhất:

- tải settings ban đầu từ `useSettingsStore`
- chặn bằng auth gate từ `useAuthStore`
- quản lý project hiện tại qua `useProjectManager`
- tự chuyển từ `HOME` sang `DESIGN` khi đã có project
- lắng nghe event `open-pmp` từ backend để mở file `.pmp` khi app được launch qua file association
- hiển thị `TitleBar`, `Ribbon`, `StatusBar`, modal tạo/xóa project, progress export, performance overlay

Nếu chưa chọn project, app hiển thị `RecentWorkspaces`. Nếu đã có project và tab không phải `HOME`, app mount `ProjectDetail`.

### Backend bootstrap: `src-tauri/src/main.rs` + `src-tauri/src/lib.rs`

`src-tauri/src/main.rs` là entrypoint backend Tauri thực tế. File này:

- nạp `.env`
- xác định `app_data_dir`
- load `AppConfig`
- khởi tạo `AIManager` nếu feature/cấu hình cho phép
- khởi tạo database hệ thống qua `initialize_database`
- khởi tạo `MapState` in-memory cho design events
- đăng ký preview protocol `preview://`
- xử lý đối số dòng lệnh để mở `.pmp`
- đăng ký toàn bộ Tauri commands qua `invoke_handler`

Điểm quan trọng:

- frontend không gọi DB/file system trực tiếp, mà đi qua command Rust
- phần design sync được giữ cả ở DB lẫn in-memory state để tối ưu hiệu năng

## 3. Frontend structure theo module

### 3.1 Project/workspace management

Các file trung tâm:

- `src/IMPLEMENT/hooks/useProjectManager.ts`
- `src/IMPLEMENT/features/project-management/RecentWorkspaces.tsx`
- `src/IMPLEMENT/features/project-management/CreateProjectModal.tsx`
- `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`

`useProjectManager` là lớp orchestration cho project:

- lấy recent projects từ local storage và backend config
- kiểm tra `get_active_project` để hydrate lại phiên làm việc sau reload
- mở `.pmp` bằng `load_pmp_file`
- lưu recent project và `last_opened_pmp`
- trigger `index_project_files` nền sau khi mở project
- hỗ trợ restore danh sách recent từ backend config

`ProjectDetail.tsx` là hub của project đang mở:

- nạp cây file
- nạp content types động
- khởi tạo `useDesignSync.initialize(project.id)`
- nạp BOM tổng hợp của project
- tách giao diện theo tab `DESIGN`, `CONTRACT`, `RESOURCES` hoặc content type động

### 3.2 Design / CAD / GIS

Các file trung tâm:

- `src/DESIGN/components/core/CADCanvas.tsx`
- `src/DESIGN/components/core/CADPanels/DrawingExplorer.tsx`
- `src/DESIGN/components/core/PropertyPanel.tsx`
- `src/DESIGN/components/ui/Ribbon.tsx`
- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/IMPLEMENT/stores/useLayoutStore.ts`
- `src/IMPLEMENT/features/map/MapLayer.tsx`
- `src/IMPLEMENT/features/map/MapLayerComponents/*`

`useDesignSync.ts` là store lõi của toàn bộ module thiết kế:

- giữ `MapState`
- hydrate bằng binary IPC từ Rust qua `load_design_state`
- dispatch event đơn/lô qua `dispatch_design_event` và `dispatch_design_events`
- hỗ trợ undo/redo/deduplicate
- quản lý selection, multi-select, drawing mode, snap point, box selection, print area
- phát event đồng bộ nhiều cửa sổ như `sync-map-state`, `sync-drawing-mode`, `sync-print-area`

Quyết định kỹ thuật nổi bật:

- hydration dùng binary decode (`BincodeDecoder`) thay vì JSON để giảm chi phí IPC
- patch state cục bộ sau mỗi event thay vì reload full snapshot
- throttling inbound/outbound update để tránh render storm
- selection, preview, DORI layer và zoom signal đều có cross-window sync

`useLayoutStore.ts` quản lý hệ palette:

- dock/floating
- width/height/flex
- reorder
- persisted layout migrations qua `zustand/persist`

`Ribbon.tsx` là control surface chính của tab `DESIGN`:

- undo/redo
- bật/tắt palette
- chọn drawing mode
- visibility tools
- mở analysis/print/export
- bật/tắt AI và release memory

### 3.3 Contract / BOM / metadata analysis

Các file trung tâm:

- `src/IMPLEMENT/features/contract/ContractSidebar.tsx`
- `src/IMPLEMENT/features/contract/ContractManager.tsx`
- `src/IMPLEMENT/features/contract/ContractAnalysisView.tsx`
- `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`
- `src/IMPLEMENT/hooks/useProjectData.ts`

Luồng chính:

- `ContractSidebar` hoặc file tree chọn file hợp đồng
- `ProjectDetail` gọi `analyze_contract_metadata`
- kết quả `ContractMetadata` đổ vào `ContractAnalysisView`
- người dùng sửa metadata/BOM rồi lưu bằng `save_contract_analysis`
- backend đồng bộ ngược về bảng `projects`, `contracts`, `files` và emit `metadata-updated`, `sync-finished`
- `ProjectDetail` nghe event để reload metadata/BOM tổng hợp

Ngoài phân tích từng file, module còn có:

- `get_project_bom_table`: BOM tổng hợp cấp project
- `analyze_all_project_files`: bulk sync toàn bộ file contract đã liên kết
- `save_project_bom_table`: lưu pseudo-file BOM tổng hợp
- execution groups cho nhóm triển khai gắn với `bom_item_uids`

### 3.4 Task / note / contract / material data

Các file trung tâm:

- `src/IMPLEMENT/hooks/useProjectData.ts`
- `src/IMPLEMENT/features/project-management/ProjectDetailPanels/*`
- `src/IMPLEMENT/features/inventory/MaterialManager.tsx`

`useProjectData.ts` gom dữ liệu nghiệp vụ cấp project:

- tasks
- notes
- contracts
- task dependencies

Hook này cũng chứa action chính:

- create/delete task
- update task status/date
- create/delete note
- create/delete contract

Nếu AI được bật, `handleCreateTask` gọi `predict_task` để dự đoán số ngày rồi tự sinh thời gian bắt đầu/kết thúc.

### 3.5 Dynamic content system

Các file trung tâm:

- `src/IMPLEMENT/features/files/DynamicContentManager.tsx`
- `src-tauri/src/IMPLEMENT/commands/content.rs`

Đây là hệ metadata động theo `content_type`:

- lấy danh sách loại nội dung
- lấy field theo loại
- lấy item theo loại và project
- lưu/xóa item

Trong `ProjectDetail`, các content type được render thành tab động ngoài các tab cứng như `DESIGN`, `CONTRACT`, `RESOURCES`.

### 3.6 Import / export / print / analysis window

Các file trung tâm:

- `src/IMPLEMENT/features/files/ImportDialog.tsx`
- `src/IMPLEMENT/services/importService.ts`
- `src/IMPLEMENT/services/exportService.ts`
- `src/IMPLEMENT/services/analysisService.ts`
- `src/IMPLEMENT/features/analysis/AnalysisWindow.tsx`
- `src/IMPLEMENT/features/print/PrintWindow.tsx`

`importService.ts` là bridge mỏng tới backend:

- `analyze_import_file`
- `start_import_task`

Backend parser hiện hỗ trợ:

- Excel
- KML
- KMZ

`exportService.ts` tạo gói export phân cấp:

- Excel metadata
- KML/KMZ
- ảnh trích từ metadata
- ZIP cuối cùng lưu qua `save_binary_file`

`analysisService.ts` hỗ trợ import/export Excel cho dữ liệu phân tích. File này có dùng `read_binary_file`; cần kiểm tra lại registry command khi tiếp tục phát triển vì command đó không nằm trong `src-tauri/src/main.rs` hiện tại.

### 3.7 Auth / settings / AI control

Các file trung tâm:

- `src/IMPLEMENT/stores/useAuthStore.ts`
- `src/IMPLEMENT/stores/useSettingsStore.ts`
- `src/IMPLEMENT/lib/firebase.ts`
- `src/IMPLEMENT/lib/tauri.ts`

`useAuthStore.ts` xử lý:

- email/password login
- sign up
- logout
- Google login qua Tauri loopback flow (`google_login_flow`)
- phân biệt main window và standalone window
- session guard để tránh cửa sổ phụ bị đá về trạng thái chưa đăng nhập quá sớm

`useSettingsStore.ts` xử lý:

- `enableAi`
- `lowPowerMode`
- FOV filter types
- load/save app config qua backend

## 4. Backend structure theo module

### 4.1 Command registry

File `src-tauri/src/main.rs` đăng ký các nhóm command sau:

- Project: `project.rs`, `project_v4.rs`
- Task: `task.rs`
- Search/document indexing: `search.rs`
- File utilities và preview: `utils.rs`, `file_tree.rs`
- Note: `note.rs`
- Contract/BOM: `contract.rs`, `contract_analysis.rs`
- Material: `material.rs`
- Map: `map.rs`
- Import: `import.rs`
- Auth: `auth.rs`
- Dynamic content: `content.rs`
- AI learning: `ai_learning.rs`
- AI operational commands: `ai.rs`
- Core config: `IMPLEMENT/modules/core/config.rs`
- Design event system: `IMPLEMENT/modules/design/design_events/mod.rs`

### 4.2 Design event backend

Các file trung tâm:

- `src-tauri/src/IMPLEMENT/modules/design/design_events/mod.rs`
- `src-tauri/src/IMPLEMENT/modules/design/design_events/state.rs`
- `src-tauri/src/IMPLEMENT/modules/design/design_events/topology.rs`
- `src-tauri/src/IMPLEMENT/modules/design/design_events/camera.rs`
- `src-tauri/src/IMPLEMENT/modules/design/geometry/*`

Vai trò:

- load/save snapshot thiết kế
- apply event vào state
- undo/redo
- spatial query
- nearest snap point
- topology side effects
- camera/FOV related side effects

Đây là lõi phức tạp nhất của hệ thống. Frontend `useDesignSync` chỉ là lớp điều phối phía client; logic nguồn sự thật nằm trong Rust.

### 4.3 Project / task / note / material / file system

Nhóm command nổi bật:

- Project: `get_projects`, `create_project`, `update_project_details`, `load_pmp_file`, `create_pmp_file`, `delete_project`, `add_project_folder`, `remove_project_folder`, `get_active_project`
- Project v4/settings: `get_project_settings`, `update_project_settings`, `list_design_styles`, `get_audit_logs`
- Task: `get_tasks`, `create_task`, `toggle_task`, `update_task_status`, `update_task_dates`, `update_task_parent`, `get_task_dependencies`, `add_task_dependency`, `assign_file_to_task`, `delete_task`, `predict_task`
- Note: `get_notes`, `create_note`, `delete_note`
- Material: `get_materials`, `create_material`, `delete_material`, `list_work_items`, `add_work_item`, `delete_work_item`
- File tree: `get_project_tree`, `move_fs_item`
- Utils: `read_file_content`, `preview_document_text`, `save_binary_file`, `open_containing_folder`, `open_file_external`

### 4.4 Contract analysis backend

File trọng tâm: `src-tauri/src/IMPLEMENT/commands/contract_analysis.rs`

Module này làm nhiều việc:

- trích text từ PDF/DOCX
- parse metadata hợp đồng bằng regex/heuristic
- parse BOM từ text hoặc Excel
- cache phân tích trong bảng `files`
- bulk analyze các contract files đã liên kết với project
- đồng bộ metadata ngược về `projects` và `contracts`
- lưu BOM tổng hợp kiểu pseudo-file `project://{id}/global_bom`
- quản lý `contract_execution_groups`

Khi feature `ai` bật, module còn:

- áp learned corrections từ bảng `ai_corrections`
- hỗ trợ `analyze_contract_advanced` qua model LLM

### 4.5 AI backend

Các file trung tâm:

- `src-tauri/src/IMPLEMENT/commands/ai.rs`
- `src-tauri/src/IMPLEMENT/commands/ai_learning.rs`
- `src-tauri/src/IMPLEMENT/modules/ai/*`

Phân lớp:

- `IMPLEMENT/commands/ai.rs`: command điều khiển AI từ UI
- `IMPLEMENT/commands/ai_learning.rs`: lưu correction để tái sử dụng
- `IMPLEMENT/modules/ai/ai_engine/*`: embedding, OCR, Phi-3, YOLO, downloader, sync, trainer, self-heal

Đặc điểm vận hành:

- AI bị feature-gated ở compile time và config-gated ở runtime
- `check_ai_status` và `check_and_download_models` dùng `AIManager`
- `normalize_metadata` trả về text chuẩn hóa + vector embedding
- `release_ai_memory` giải phóng tài nguyên model khi cần

## 5. Frontend ↔ Tauri command map

| Frontend area | File chính | Tauri command / backend path |
| --- | --- | --- |
| Bootstrap project open | `src/HOME/App.tsx`, `src/IMPLEMENT/hooks/useProjectManager.ts` | `load_pmp_file`, `get_active_project`, `save_last_opened_project`, `index_project_files` |
| Settings + AI toggle | `src/IMPLEMENT/stores/useSettingsStore.ts`, `src/DESIGN/components/ui/Ribbon.tsx` | `get_app_config`, `update_app_config`, `release_ai_memory` |
| Auth Google | `src/IMPLEMENT/stores/useAuthStore.ts` | `google_login_flow` |
| Project data | `src/IMPLEMENT/hooks/useProjectData.ts` | `get_tasks`, `create_task`, `update_task_status`, `update_task_dates`, `get_notes`, `create_note`, `get_contracts`, `create_contract` |
| Design sync | `src/IMPLEMENT/stores/useDesignSync.ts` | `load_design_state`, `dispatch_design_event`, `dispatch_design_events`, `undo_design_event`, `redo_design_event`, `deduplicate_project_data`, `find_nearest_snap_point`, `query_features_in_area` |
| File tree / preview | `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`, `src/IMPLEMENT/features/files/FilePreview.tsx` | `get_project_tree`, `move_fs_item`, `read_file_content`, `preview_document_text`, `open_file_external` |
| Import | `src/IMPLEMENT/services/importService.ts`, `src/IMPLEMENT/features/files/ImportDialog.tsx` | `analyze_import_file`, `start_import_task` |
| Export / analysis Excel | `src/IMPLEMENT/services/exportService.ts`, `src/IMPLEMENT/services/analysisService.ts` | `save_binary_file` |
| Contract analysis | `src/IMPLEMENT/features/contract/*`, `src/IMPLEMENT/features/project-management/ProjectDetail.tsx` | `analyze_contract_metadata`, `save_contract_analysis`, `get_project_bom_table`, `analyze_all_project_files`, `save_project_bom_table`, `get_execution_groups`, `upsert_execution_group`, `delete_execution_group` |
| Dynamic content | `src/IMPLEMENT/features/files/DynamicContentManager.tsx` | `get_content_types`, `get_content_fields`, `get_content_items`, `save_content_item`, `delete_content_item` |

## 6. Walkthrough luồng người dùng theo code

### Mở app

1. `src/HOME/main.tsx` đọc query `view`.
2. Nếu không có `view`, render `App`.
3. `App` load settings và auth state.
4. Backend Tauri đã sẵn config, DB, preview service và command registry.

### Xác thực

1. `useAuthStore` khởi tạo ngay khi module được import.
2. Main window bật local persistence cho Firebase.
3. Standalone window dùng guard để không bị null-user sớm.
4. Nếu chưa có `user` và không phải standalone, `App` render `AuthOverlay`.

### Chọn hoặc mở project

1. `useProjectManager.loadProjects()` lấy recent projects từ local storage và `get_app_config`.
2. Nếu backend còn active project, hook hydrate lại luôn.
3. Khi mở `.pmp`, frontend gọi `load_pmp_file`.
4. Sau đó trigger `index_project_files` nền và lưu `last_opened_pmp`.

### Vào tab DESIGN

1. `ProjectDetail` gọi `useDesignSync.initialize(project.id)`.
2. Store gọi `load_design_state` và decode binary snapshot.
3. `CADCanvas`, `DrawingExplorer`, `PropertyPanel`, palette system cùng dùng `MapState`.
4. Thao tác người dùng tạo `DesignEventType`, gửi sang Rust, rồi patch state cục bộ.

### Vào tab CONTRACT

1. Người dùng chọn file contract từ sidebar hoặc file tree.
2. `ProjectDetail` gọi `analyze_contract_metadata`.
3. Kết quả vào `ContractAnalysisView`.
4. Khi lưu correction, backend cập nhật `files`, `projects`, `contracts`, rồi emit event để UI tự reload.

### Vào tab RESOURCES hoặc content động

1. `MaterialManager` dùng command `material.rs`.
2. Các tab động dùng `content.rs`.
3. Mọi dữ liệu này vẫn nằm trong project context hiện tại.

### Import / export / print / analysis

- Import dùng `ImportDialog` + `importService`.
- Export dùng `exportProjectData`, gom Excel + KMZ + ảnh thành ZIP.
- Print và analysis được mở ở cửa sổ riêng bằng query `view`.

## 7. Các file nên đọc trước

Nếu cần hiểu app nhanh, nên đọc theo thứ tự này:

1. `src/HOME/main.tsx`
2. `src/HOME/App.tsx`
3. `src/IMPLEMENT/features/project-management/ProjectDetail.tsx`
4. `src/DESIGN/components/ui/Ribbon.tsx`
5. `src/IMPLEMENT/hooks/useProjectManager.ts`
6. `src/IMPLEMENT/hooks/useProjectData.ts`
7. `src/IMPLEMENT/stores/useDesignSync.ts`
8. `src-tauri/src/main.rs`
9. `src-tauri/src/lib.rs`
10. `src-tauri/src/IMPLEMENT/modules/design/design_events/mod.rs`
11. `src-tauri/src/IMPLEMENT/commands/contract_analysis.rs`

## 8. `financial_system/` trong bức tranh tổng thể

`financial_system/` là một Rust service độc lập dùng Axum + SQLx + PostgreSQL. Theo code hiện tại:

- nó không nằm trong luồng runtime trực tiếp của Tauri app chính
- nó phục vụ bài toán quản lý tài chính dự án chuyên biệt
- có các lớp `domain`, `repository`, `service`, `ai_engine`, `api`

Nói cách khác, đây là hệ phụ trợ song song với desktop app, không phải module được invoke trực tiếp từ `src/` hoặc `src-tauri/src/main.rs` hiện tại.

## 9. Khu vực phức tạp và rủi ro cần lưu ý

- Design event system là phần phức tạp nhất: có snapshot, patching, topology side effects, spatial index và cross-window sync.
- `useDesignSync.ts` rất lớn và đang kiêm nhiều trách nhiệm: hydration, local patching, UI sync, selection, drawing, preview sync.
- Contract analysis backend có nhiều heuristic parse và nhánh feature AI; cần test kỹ với dữ liệu thật trước khi refactor.
- Multi-window auth/session guard khá nhạy cảm vì phụ thuộc cả URL lẫn Tauri window label.
- `preview://` protocol là điểm quan trọng cho file preview và có thể ảnh hưởng khi đổi cách load tài liệu.
- `analysisService.ts` đang gọi `read_binary_file`, nhưng command này không thấy trong registry Tauri hiện tại; đây là điểm cần xác minh nếu dùng tính năng import Excel cho analysis.

## 10. Kết luận

Core app hiện được tổ chức quanh một shell React/Tauri khá rõ:

- `App` và `ProjectDetail` điều phối UX cấp cao
- Zustand stores giữ trạng thái dài hạn của UI và design workspace
- backend Rust là nguồn sự thật cho file system, DB, AI, import, contract analysis và design events

Nếu tiếp tục phân tích sâu, hai nơi đáng ưu tiên nhất là:

- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src-tauri/src/IMPLEMENT/modules/design/design_events/mod.rs`

Đây là cặp file quyết định phần lớn hành vi của module thiết kế, đồng bộ và hiệu năng ứng dụng.
