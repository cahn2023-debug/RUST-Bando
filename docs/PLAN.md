# Hoan thien luu tru `.pmp` theo cau truc moi V2

## Tom tat
- `.pmp` tro thanh container duy nhat cho du lieu du an. Khong con phu thuoc runtime vao `project_v4.pmp` mac dinh hay file sidecar `.pmp.manifest.json`.
- Khi mo `.pmp` cu, app tu dong migrate trong chinh file do sang schema V2, rebuild `event_store`, projection, search index va metadata noi bo.
- `projectId` doi sang UUID string xuyen suot o frontend/backend. Cac entity khac tam thoi giu API so cu thong qua mot bang alias ID trong `.pmp`, trong khi storage canonical van la UUID/event-sourcing.
- `event_store` la source of truth. Projection/read model, search index, audit va command-log undo/redo deu nam trong cung file `.pmp`.

## Thay doi chinh
### 1. Runtime persistence cho project dang active
- Bo khoi tao worker V2 co dinh o startup. `lib.rs` chi `manage` mot `ActivePmpState`, ban dau rong.
- Tao `ActivePmpState` chua `db_path`, `project_uuid`, `device_id`, `sender`, `join_handle` va generation token cua worker dang active.
- `load_project_unified` va `create_project_unified` phai:
  - mo/tao `.pmp`
  - chay `ensure_pmp_v2`
  - shutdown worker cu neu co
  - bind worker moi vao file vua mo
  - cap nhat `DatabaseState` + `ActivePmpState` trong cung mot flow
- Moi command ghi du lieu lay sender tu `ActivePmpState`; neu khong co active project thi fail fast voi loi ro rang.
- Khi switch project, worker cu phai `Shutdown`, flush queue, checkpoint WAL, roi moi bind file moi. Tuyet doi khong con truong hop ghi nham vao `project_v4.pmp`.

### 2. Schema `.pmp` moi va metadata noi bo
- Them bang `pmp_metadata` mot dong:
  - `singleton = 1`
  - `format_version`
  - `project_id`
  - `app_version`
  - `device_id`
  - `last_global_seq`
  - `features_json`
  - `created_at`
  - `updated_at`
- Them bang `entity_id_aliases` de giu compatibility ID so cho entity cu:
  - `entity_type`
  - `scope_id` (`project_uuid` hoac `''` cho entity global)
  - `legacy_id`
  - `uuid`
  - `created_at`
  - `PRIMARY KEY(entity_type, scope_id, legacy_id)`
  - `UNIQUE(entity_type, uuid)`
- Them bang `design_command_batches` cho undo/redo V2:
  - `batch_id`
  - `project_id`
  - `events_json`
  - `inverse_events_json`
  - `event_ids_json`
  - `undone_at`
  - `created_at`
- `ManifestIO`/sidecar khong con la runtime dependency. Neu ton tai sidecar cu, chi import 1 lan vao `pmp_metadata`, sau do bo qua.

### 3. Migration tu dong khi mo file cu
- `ensure_pmp_v2` duoc goi trong `load_project_unified` va `create_project_unified`.
- `ensure_pmp_v2` phai:
  - apply schema V2 + bang moi
  - tao/nap `pmp_metadata`
  - xac dinh file da migrate day du hay chua bang `format_version` + presence cua `event_store` + alias table
  - neu la file cu, chay migrator trong cung transaction
- Migrator duoc mo rong de:
  - tao UUID canonical cho `project`
  - seed `entity_id_aliases` cho `task`, `note`, `contract`, `material`, `work_item`, `content_item`, `content_type`, `content_field`
  - rebuild `event_store` tu legacy tables cho `project`, `task`, `feature/design`, `file`, `work_item`, `note`, `contract`, `material`, `project_settings`, `content_items`
  - rebuild projection tables tu `event_store`
  - rebuild `entity_index/entity_search`
- Legacy tables cu duoc giu lai trong file o dot nay nhu backup read-only, nhung khong con duoc runtime doc/ghi.

### 4. Cut-over read/write theo domain
- `Project` API doi `id` sang `string` UUID. `get_active_project`, `load_project_unified`, `create_project_v2` phai tra project UUID thuc, khong tra timestamp id hay `device_id`.
- `ProjectSettings.project_id` doi sang `string`. Moi command nhan `projectId` tu frontend dung UUID string.
- `task`, `note`, `contract`, `material`, `work_item`, `content_item`, `content_type`, `content_field` giu ID so o API hien tai:
  - read command join projection/direct table voi `entity_id_aliases` de tra `legacy_id`
  - write/delete/update command resolve `legacy_id -> uuid` truoc khi gui event
  - create command tao UUID moi, cap `legacy_id` tiep theo trong `entity_id_aliases`, roi moi persist event
- Dang ky day du projector cho:
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
- `content_types` va `content_fields` giu vai tro schema/reference table trong `.pmp`, khong event-source o dot nay; nhung van duoc alias de frontend tiep tuc nhan ID so.
- `update_project_settings` chuyen sang ghi `SettingsUpdated` qua worker, khong ghi SQL truc tiep nua.
- `save_content_item`/`delete_content_item` chuyen sang event moi `ContentItemUpserted` va `ContentItemDeleted`, projection vao `content_items`.
- `search_universal` dung `entity_search` lam structured search chuan. `file_search` duoc giu la derived FTS index trong cung `.pmp`, khong phai source of truth.

### 5. Map/design persistence va hydrate
- `invoke_design_event_batch` tiep tuc la duong ghi design, nhung moi batch phai duoc gan `batch_id` chung va ghi vao `design_command_batches` trong cung transaction persistence.
- `load_design_state` khong doc `design_events/design_snapshots` nua. No hydrate `MapState` tu projection V2:
  - `features`
  - `layers`
  - `feature_groups`
  - `project_settings`
- `undo_design_event`:
  - lay batch design chua undo gan nhat tu `design_command_batches`
  - replay `inverse_events_json` qua worker
  - danh dau `undone_at`
- `redo_design_event`:
  - lay batch da undo gan nhat
  - replay `events_json` goc qua worker
  - xoa `undone_at`
- Batch inverse phai duoc tao luc persist cho cac event hien frontend dang phat:
  - `FeatureCreated/Updated/Deleted`
  - `LayerCreated/Updated/Deleted`
  - `SettingsUpdated`
- `deduplicate_project_data` chuyen sang chay tren projection/event canonical, khong dua vao legacy design tables.

## API / type changes cong khai
- Frontend TS:
  - `Project.id: string`
  - `ProjectSettings.project_id: string`
  - moi `projectId` di qua hook/store/Tauri invoke dung `string`
  - bo toan bo `Number(projectId)` trong project manager, map initialization, undo/redo, dynamic content, contract/inventory hooks
- Tauri command surface:
  - giu nguyen ten command de giam pha vo UI
  - doi kieu `projectId/project_id` sang `String`
  - giu `taskId/noteId/contractId/materialId/workItemId/contentItemId` la `i32` o API tam thoi
- `create_project_v2` va `create_project_unified` phai tra ve project UUID canonical va thong tin du an vua tao, khong tra field sai nghia.

## Test plan
- Unit:
  - migrate file legacy tao `pmp_metadata`, `entity_id_aliases`, `event_store`, projection, `entity_search`
  - rebind worker khi switch project va xac nhan event chi ghi vao file dang active
  - projector cho `contract`, `note`, `material`, `settings`, `content_item` cap nhat dung read model
  - alias resolver tra ve cung `legacy_id` sau reopen va resolve dung `uuid`
  - design batch tao `inverse_events_json` dung cho create/update/delete/settings
- Integration:
  - tao `.pmp` moi, them task/note/contract/material/content item, dong/mo lai, doc ra dung du lieu
  - mo `.pmp` cu, auto migrate, reopen, du lieu van doc duoc qua API moi
  - sua map, dong/mo lai, `load_design_state` hydrate dung tu projection V2
  - undo/redo sau reopen van hoat dong va khong dung legacy tables
  - `search_universal` tim thay entity moi tao sau migration va sau thao tac tao moi
- Regression:
  - khong con ghi vao `project_v4.pmp` khi user mo file khac
  - app van hoat dong neu khong co sidecar manifest
  - cac command audit/settings/content hien co khong vo giao dien vi doi `projectId` sang UUID

## Gia dinh va default da chot
- Container chuan la single-file SQLite `.pmp`.
- Toan bo metadata van hanh cung nam trong `.pmp`; sidecar chi doc de import mot lan neu ton tai.
- `event_store` la source of truth; projection, search index va command-log la du lieu dan xuat trong cung file.
- `projectId` cat sang UUID ngay dot nay.
- Entity ID so duoc giu tam thoi qua `entity_id_aliases`; khong co them lop timestamp-id compatibility nua.
- `content_types/content_fields` giu la reference tables, chua event-source o dot nay.
