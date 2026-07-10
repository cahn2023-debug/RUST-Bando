# Fix V1 → V2 Design Migration And `.pmp` Hydration

## Summary
Mục tiêu là làm design/map chạy end-to-end trên V2 cho file `.pmp` legacy: mở file, auto-migrate dữ liệu V1, hydrate đúng dữ liệu lên UI, chỉnh sửa và lưu lại, đóng/mở lại vẫn giữ nguyên. Kế hoạch này ưu tiên domain design trước, và dùng `event_store + projections` làm nguồn đọc chuẩn V2; `design_events` chỉ còn là lớp compatibility phụ, không phải source of truth.

## Key Changes
### 1. Unify project identity to UUID/string on the design path
- Đổi toàn bộ design store/hook từ `projectId: number` sang `projectId: string`.
- Loại bỏ mọi `parseInt(...)`, `Number(...)`, và mọi guard so sánh numeric trong `initialize`, `useProjectDetailLogic`, `designActionSlice`, `uiSyncSlice`, `PrintWindow`, `AnalysisWindow`.
- `initialize()` chỉ dùng active project UUID/path hiện tại; không còn fallback về `0`.
- Acceptance: log hydrate phải hiện project UUID thật, không còn `Initializing project: 0`.

### 2. Make V2 runtime actually usable for design read/write
- `V2Database::new/open` phải khởi tạo `ProjectionEngine` với đầy đủ projector design đang có sẵn:
  - `ProjectProjector`
  - `RegionProjector`
  - `LayerProjector`
  - `FeatureGroupProjector`
  - `FeatureProjector`
  - cùng các projector phụ đang cần cho runtime hiện tại
- Worker save path tiếp tục dùng `invoke_design_event_batch -> SaveBatch -> event_store.append`, nhưng projection phải được apply thành công sau mỗi event.
- Thêm kiểm tra khởi tạo để fail fast nếu thiếu projector cho `feature/layer/region/feature_group`.
- Không dùng `design_events` làm điều kiện thành bại chính của save; nếu còn giữ compatibility log thì ghi như derived side-effect, không được chặn persist canonical.

### 3. Rewrite design hydration to read V2 projections, not legacy event log
- `load_design_state` phải đọc từ projection tables theo `project_id` thực:
  - `features`
  - `layers`
  - `feature_groups`
  - `regions` nếu UI còn cần
  - `project_settings` nếu map cần config
- Build lại `MapState` trực tiếp từ projection rows rồi serialize sang bincode cho frontend.
- Không đọc `design_events` để hydrate chính nữa.
- Filter theo active UUID/project id thực; không query toàn bảng như hiện tại.
- Nếu projection trống nhưng `event_store` có data, tự trigger rebuild projections trước khi trả state.

### 4. Fix V1 → V2 migration so design data becomes usable V2 data
- Gộp `NativeMigrator` và `V1ToV2Migrator` thành một flow rõ ràng cho design:
  - detect nguồn legacy theo thứ tự: `v1_design_events/design_events` -> metadata blob `world_state` -> legacy GIS tables
  - chuyển tất cả design entities sang `AppEvent` canonical trong `event_store`
  - dùng deterministic UUID cho mọi legacy id string/int
  - rebuild projection sau khi replay xong
- `pmp_metadata.project_id` phải được seal bằng winner UUID sau khi migrate xong, không trước đó.
- `ensure_project_id_alignment` chỉ chạy sau khi migration/projection rebuild hoàn tất, và phải cập nhật đồng bộ:
  - `projects.id`
  - `event_store.project_id`
  - projection tables có `project_id`
- Không cleanup/drop legacy design sources cho đến khi verify:
  - `event_store` có design events
  - projection có feature/layer/group tương ứng
  - `load_design_state` trả ra state khác rỗng nếu file legacy có dữ liệu
- Với file “V2 nửa vời”, nếu `pmp_metadata` có nhưng projection rỗng và còn nguồn V1, bắt buộc rerun repair migration.

### 5. Keep compatibility data as derived, not primary
- `design_events` chỉ còn là compatibility log cho undo/history nếu app vẫn cần trong giai đoạn chuyển tiếp.
- Nếu giữ bảng này:
  - populate từ V2 migration replay
  - double-write từ save path sau khi `event_store` append thành công
  - không dùng nó để quyết định database có “migrate xong” hay chưa
- Read path chính vẫn là projections; fallback `design_events` chỉ dùng cho repair/debug nếu được bật rõ ràng.

## Public API / Interface Changes
- Frontend design store:
  - `projectId: string | null`
  - `initialize(projectId: string, projectPath?: string)`
  - `setMockState(..., projectId: string, ...)`
- Mọi Tauri invoke liên quan design/map phải truyền `projectId` dạng `string`.
- `load_design_state(projectId: String)` vẫn giữ tên command hiện tại để tránh vỡ UI, nhưng backend sẽ dùng UUID thực và projection V2.
- `get_active_project` và `load_pmp_file` tiếp tục trả `Project.id: string` như hiện tại; design path không được ép ngược về số.

## Test Plan
- Migration:
  - mở file V1 chỉ có `design_events` -> event_store có design events, projections có features/layers/groups, hydrate ra dữ liệu thật
  - mở file V1 chỉ có metadata blob/world_state -> migrate ra event_store + projections đúng số lượng entity
  - mở file “V2 nửa vời” có `pmp_metadata` nhưng projection rỗng -> auto-repair và hydrate lại được
- Runtime:
  - mở `.pmp` legacy, vào tab design, log không còn `project 0`
  - sửa metadata một feature, save thành công, reopen vẫn còn thay đổi
  - tạo/sửa/xóa feature qua frontend, projection cập nhật ngay, hydrate lại vẫn đúng
- Regression:
  - file V2 chuẩn hiện có vẫn mở và hydrate được
  - save path không còn phụ thuộc `design_events` tồn tại sẵn
  - worker không trả lỗi `No projector for entity_type`
- Verification metrics:
  - nếu legacy file có N feature nhìn thấy ở V1, sau migrate projection `features` phải có N bản ghi tương ứng
  - `load_design_state` phải trả state có feature count > 0 cho file `Du_an_165.pmp`

## Assumptions And Defaults
- Phạm vi thực hiện trước là design/map domain, chưa buộc full V1→V2 cho task/content/contract/material trong cùng đợt này.
- Nguồn đọc chuẩn sau fix là `event_store + projections`, không phải `design_events`.
- `design_events` được giữ tạm như compatibility layer nếu undo/history hiện tại còn cần.
- Legacy ID được chuyển sang UUID deterministic để reopen/migrate lại không đổi identity.
- Cleanup/drop bảng V1 chỉ được phép sau khi migration verify thành công bằng dữ liệu projection và hydration thực tế.
