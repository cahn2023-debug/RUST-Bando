# Hoàn thiện lưu trữ `.pmp` theo cấu trúc mới V2

## Tóm tắt
- `.pmp` trở thành container duy nhất cho dữ liệu dự án. Không còn phụ thuộc runtime vào `project_v4.pmp` mặc định hay file sidecar `.pmp.manifest.json`.
- Khi mở `.pmp` cũ, app tự động migrate trong chính file đó sang schema V2, rebuild `event_store`, projection, search index và metadata nội bộ.
- `projectId` đổi sang UUID string xuyên suốt ở frontend/backend. Các entity khác tạm thời giữ API số cũ thông qua một bảng alias ID trong `.pmp`, trong khi storage canonical vẫn là UUID/event-sourcing.
- `event_store` là source of truth. Projection/read model, search index, audit và command-log undo/redo đều nằm trong cùng file `.pmp`.

## Thay đổi chính
### 1. Runtime persistence cho project đang active
- Bỏ khởi tạo worker V2 cố định ở startup. `lib.rs` chỉ `manage` một `ActivePmpState`, ban đầu rỗng.
- Tạo `ActivePmpState` chứa `db_path`, `project_uuid`, `device_id`, `sender`, `join_handle` và generation token của worker đang active.
- `load_project_unified` và `create_project_unified` phải:
  - mở/tạo `.pmp`
  - chạy `ensure_pmp_v2`
  - shutdown worker cũ nếu có
  - bind worker mới vào file vừa mở
  - cập nhật `DatabaseState` + `ActivePmpState` trong cùng một flow
- Mỗi command ghi dữ liệu lấy sender từ `ActivePmpState`; nếu không có active project thì fail fast với lỗi rõ ràng.
- Khi switch project, worker cũ phải `Shutdown`, flush queue, checkpoint WAL, rồi mới bind file mới. Tuyệt đối không còn trường hợp ghi nhầm vào `project_v4.pmp`.

### 2. Schema `.pmp` mới và metadata nội bộ
- Thêm bảng `pmp_metadata` một dòng:
  - `singleton = 1`
  - `format_version`
  - `project_id`
  - `app_version`
  - `device_id`
  - `last_global_seq`
  - `features_json`
  - `created_at`
  - `updated_at`
- Thêm bảng `entity_id_aliases` để giữ compatibility ID số cho entity cũ:
  - `entity_type`
  - `scope_id` (`project_uuid` hoặc `''` cho entity global)
  - `legacy_id`
  - `uuid`
  - `created_at`
  - `PRIMARY KEY(entity_type, scope_id, legacy_id)`
  - `UNIQUE(entity_type, uuid)`
- Thêm bảng `design_command_batches` cho undo/redo V2:
  - `batch_id`
  - `project_id`
  - `events_json`
  - `inverse_events_json`
  - `event_ids_json`
  - `undone_at`
  - `created_at`
- `ManifestIO`/sidecar không còn là runtime dependency. Nếu tồn tại sidecar cũ, chỉ import 1 lần vào `pmp_metadata`, sau đó bỏ qua.

### 3. Migration tự động khi mở file cũ
- `ensure_pmp_v2` được gọi trong `load_project_unified` và `create_project_unified`.
- `ensure_pmp_v2` phải:
  - apply schema V2 + bảng mới
  - tạo/nạp `pmp_metadata`
  - xác định file đã migrate đầy đủ hay chưa bằng `format_version` + presence của `event_store` + alias table
  - nếu là file cũ, chạy migrator trong cùng transaction
- Migrator được mở rộng để:
  - tạo UUID canonical cho `project`
  - seed `entity_id_aliases` cho `task`, `note`, `contract`, `material`, `work_item`, `content_item`, `content_type`, `content_field`
  - rebuild `event_store` từ legacy tables cho `project`, `task`, `feature/design`, `file`, `work_item`, `note`, `contract`, `material`, `project_settings`, `content_items`
  - rebuild projection tables từ `event_store`
  - rebuild `entity_index/entity_search`
- Legacy tables cũ được giữ lại trong file ở đợt này như backup read-only, nhưng không còn được runtime đọc/ghi.

### 4. Cut-over read/write theo domain
- `Project` API đổi `id` sang `string` UUID. `get_active_project`, `load_project_unified`, `create_project_v2` phải trả project UUID thực, không trả timestamp id hay `device_id`.
- `ProjectSettings.project_id` đổi sang `string`. Mỗi command nhận `projectId` từ frontend dùng UUID string.
- `task`, `note`, `contract`, `material`, `work_item`, `content_item`, `content_type`, `content_field` giữ ID số ở API hiện tại:
  - read command join projection/direct table với `entity_id_aliases` để trả `legacy_id`
  - write/delete/update command resolve `legacy_id -> uuid` trước khi gửi event
  - create command tạo UUID mới, cấp `legacy_id` tiếp theo trong `entity_id_aliases`, rồi mới persist event
- Đăng ký đầy đủ projector cho:
  - `project`
  - `task`
  - `feature`
  - `file`
  - `work_item`
  - `contract`
  - `note`
  - `material`
  - `settings`
  - `content_item`
- `content_types` và `content_fields` giữ vai trò schema/reference table trong `.pmp`, không event-source ở đợt này; nhưng vẫn được alias để frontend tiếp tục nhận ID số.
- `update_project_settings` chuyển sang ghi `SettingsUpdated` qua worker, không ghi SQL trực tiếp nữa.
- `save_content_item`/`delete_content_item` chuyển sang event mới `ContentItemUpserted` và `ContentItemDeleted`, projection vào `content_items`.
- `search_universal` dùng `entity_search` làm structured search chuẩn. `file_search` được giữ là derived FTS index trong cùng `.pmp`, không phải source of truth.

### 5. Map/design persistence và hydrate
- `invoke_design_event_batch` tiếp tục là đường ghi design, nhưng mỗi batch phải được gán `batch_id` chung và ghi vào `design_command_batches` trong cùng transaction persistence.
- `load_design_state` không đọc `design_events/design_snapshots` nữa. Nó hydrate `MapState` từ projection V2:
  - `features`
  - `layers`
  - `feature_groups`
  - `project_settings`
- `undo_design_event`:
  - lấy batch design chưa undo gần nhất từ `design_command_batches`
  - replay `inverse_events_json` qua worker
  - đánh dấu `undone_at`
- `redo_design_event`:
  - lấy batch đã undo gần nhất
  - replay `events_json` gốc qua worker
  - xóa `undone_at`
- Batch inverse phải được tạo lúc persist cho các event hiện frontend đang phát:
  - `FeatureCreated/Updated/Deleted`
  - `LayerCreated/Updated/Deleted`
  - `SettingsUpdated`
- `deduplicate_project_data` chuyển sang chạy trên projection/event canonical, không dựa vào legacy design tables.

## API / type changes công khai
- Frontend TS:
  - `Project.id: string`
  - `ProjectSettings.project_id: string`
  - mỗi `projectId` đi qua hook/store/Tauri invoke dùng `string`
  - bỏ toàn bộ `Number(projectId)` trong project manager, map initialization, undo/redo, dynamic content, contract/inventory hooks
- Tauri command surface:
  - giữ nguyên tên command để giảm phá vỡ UI
  - đổi kiểu `projectId/project_id` sang `String`
  - giữ `taskId/noteId/contractId/materialId/workItemId/contentItemId` là `i32` ở API tạm thời
- `create_project_v2` và `create_project_unified` phải trả về project UUID canonical và thông tin dự án vừa tạo, không trả field sai nghĩa.

## Test plan
- Unit:
  - migrate file legacy tạo `pmp_metadata`, `entity_id_aliases`, `event_store`, projection, `entity_search`
  - rebind worker khi switch project và xác nhận event chỉ ghi vào file đang active
  - projector cho `contract`, `note`, `material`, `settings`, `content_item` cập nhật đúng read model
  - alias resolver trả về cùng `legacy_id` sau reopen và resolve đúng `uuid`
  - design batch tạo `inverse_events_json` dùng cho create/update/delete/settings
- Integration:
  - tạo `.pmp` mới, thêm task/note/contract/material/content item, đóng/mở lại, đọc ra đúng dữ liệu
  - mở `.pmp` cũ, auto migrate, reopen, dữ liệu vẫn đọc được qua API mới
  - sửa map, đóng/mở lại, `load_design_state` hydrate đúng từ projection V2
  - undo/redo sau reopen vẫn hoạt động và không dùng legacy tables
  - `search_universal` tìm thấy entity mới tạo sau migration và sau thao tác tạo mới
- Regression:
  - không còn ghi vào `project_v4.pmp` khi user mở file khác
  - app vẫn hoạt động nếu không có sidecar manifest
  - các command audit/settings/content hiện có không vỡ giao diện vì đổi `projectId` sang UUID

## Giả định và default đã chốt
- Container chuẩn là single-file SQLite `.pmp`.
- Toàn bộ metadata vận hành cũng nằm trong `.pmp`; sidecar chỉ đọc để import một lần nếu tồn tại.
- `event_store` là source of truth; projection, search index và command-log là dữ liệu dẫn xuất trong cùng file.
- `projectId` cắt sang UUID ngay đợt này.
- Entity ID số được giữ tạm thời qua `entity_id_aliases`; không có thêm lớp timestamp-id compatibility nữa.
- `content_types/content_fields` giữ là reference tables, chưa event-source ở đợt này.
