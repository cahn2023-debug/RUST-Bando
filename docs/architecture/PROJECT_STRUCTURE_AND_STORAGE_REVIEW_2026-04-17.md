# Tổng hợp cấu trúc mới và kiểm tra lưu dữ liệu

Ngày cập nhật: 2026-04-17

## Mục đích

Tài liệu này tổng hợp nhanh hiện trạng codebase sau đợt refactor mới, tập trung vào:

- Cấu trúc frontend/backend theo domain
- Cách lưu dữ liệu hiện tại
- Các điểm lệch giữa cấu trúc mới và persistence thực tế
- Thứ tự ưu tiên để hợp nhất hệ thống

Đánh giá này được lập từ việc đọc code và trace luồng gọi hàm, chưa bao gồm việc chạy thử nghiệm end-to-end.

## 1. Tổng quan cấu trúc mới

### 1.1 Frontend

Frontend đã được tách theo domain, các alias chính nằm trong `tsconfig.json`:

- `@HOME -> src/HOME`
- `@DESIGN -> src/DESIGN`
- `@CONTRACT -> src/CONTRACT`
- `@IMPLEMENT -> src/IMPLEMENT`
- `@RESOURCES -> src/RESOURCES`
- `@TOOL -> src/TOOL`

Điểm vào giao diện:

- `src/HOME/main.tsx`: bootstrap app, lazy-load các window lớn
- `src/HOME/App.tsx`: shell chính của ứng dụng
- `src/IMPLEMENT/features/project-management/ProjectMainView.tsx`: điều hướng vào các module `Design`, `Contract`, `Implement`, `Resources` và các content type động

State map/design đã được tách thành nhiều slice thay vì một store lớn:

- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/DESIGN/features/map/stores/*`

Nhóm slice hiện tại gồm:

- Map state
- Selection
- Drawing
- UI control
- Initialization
- UI sync
- Action

Hướng tách này đúng và dễ mở rộng hơn cấu trúc cũ.

### 1.2 Backend

Backend trong `src-tauri/src` đang mirror lại cách tách domain:

- `HOME` không xuất hiện rõ như frontend, nhưng phần ứng dụng được bootstrap ở `lib.rs`
- `DESIGN`
- `CONTRACT`
- `IMPLEMENT`
- `RESOURCES`
- `TOOL`

Trong đó:

- `IMPLEMENT/commands`: lớp Tauri command
- `IMPLEMENT/db`: tầng SQLite hiện tại
- `IMPLEMENT/modules`: gồm `core`, `ingestion`, `v2`, `ai`
- `IMPLEMENT/modules/v2`: hệ thống persistence mới theo hướng event-sourcing + projection

Bootstrap runtime đang chia thành hai tầng:

- `IMPLEMENT/modules/bootstrap.rs`: khởi tạo config, `DatabaseState`, `MapState`, preview service, legacy bridge
- `lib.rs`: đăng ký command và khởi động worker V2

## 2. Cách lưu dữ liệu hiện tại

Hệ thống lưu dữ liệu hiện tại là hybrid. Refactor mới đã tạo ra tầng V2, nhưng phần đọc/ghi dữ liệu thực tế vẫn chạy song song giữa legacy và V2.

### 2.1 Cấu hình ứng dụng

Cấu hình app được lưu riêng trong `settings.json` thông qua `AppConfig`.

Nó chứa các thông tin:

- `last_opened_pmp`
- `recent_pmps`
- `enable_ai`
- `low_power_mode`
- `current_user_email`
- `user_roles`
- `pending_pmp_path`

File liên quan:

- `src-tauri/src/IMPLEMENT/modules/core/config.rs`

### 2.2 File dự án `.pmp`

Khi người dùng mở dự án, backend vẫn mở file `.pmp` như SQLite database chính.

Lớp legacy DB đang:

- Tạo `read connection`
- Tạo `write connection`
- Duy trì connection pool
- Lưu active project path
- Detect version DB

File liên quan:

- `src-tauri/src/IMPLEMENT/db/mod.rs`

Version database hiện đang được phân loại như sau:

- Có `event_store` -> `new_v2`
- Có `projects.title` -> `core_v2`
- Ngược lại -> `v1`

### 2.3 Lưu trạng thái design/map theo legacy

Phần nạp state cho map hiện tại vẫn dựa trên bảng legacy:

- `design_snapshots`
- `design_events`

Luồng này được dùng để:

- Hydrate lại `MapState`
- Undo/redo
- Deduplicate
- Khôi phục state ban đầu của project

Frontend vẫn gọi `load_design_state` trong initialization slice, nghĩa là luồng đọc design hiện tại vẫn chưa chuyển hoàn toàn sang V2.

File liên quan:

- `src-tauri/src/DESIGN/design_events/mod.rs`
- `src/DESIGN/features/map/stores/initializationSlice.ts`
- `src-tauri/src/IMPLEMENT/db/schema.rs`

### 2.4 Lưu sự kiện V2 theo event store

Song song với legacy, luồng ghi mới của design đã bắt đầu đi vào V2.

Frontend:

- `src/DESIGN/features/map/stores/uiSyncSlice.ts`

Backend:

- `src-tauri/src/IMPLEMENT/commands/v2_events.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/worker.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/schema.rs`

Luồng này có đặc điểm:

- Frontend tạo event batch
- Backend chuyển event sang `AppEvent`
- Worker ghi vào `event_store`
- Sau đó chạy projector để cập nhật projection table
- Ghi `manifest` và `last_global_seq`

V2 schema đã có các bảng nền tảng:

- `event_store`
- `entity_index`
- `blob_registry`

Và một số projection table:

- `projects`
- `tasks`
- `features`
- `files`
- `contracts`
- `notes`
- `content_items`
- `project_settings`

### 2.5 Search và content vẫn đang lai

Hệ thống search hiện chia làm hai:

- Legacy FTS trên `file_search`
- V2 search dựa trên `entity_index` / `entity_search`

Hệ thống content linh hoạt và project settings vẫn có phần đi trực tiếp vào bảng SQL thay vì đi qua event sourcing.

File liên quan:

- `src-tauri/src/IMPLEMENT/commands/search.rs`
- `src-tauri/src/IMPLEMENT/commands/content.rs`

## 3. Điểm lệch quan trọng cần chú ý

### 3.1 Worker V2 đang trỏ vào đường dẫn cứng

Phát hiện quan trọng nhất: worker V2 được khởi tạo từ đầu với database path cứng là `project_v4.pmp`.

Ý nghĩa:

- User có thể mở một file `.pmp` khác
- `DatabaseState` legacy đã trỏ vào file đang mở
- Nhưng worker V2 có khả năng vẫn ghi vào file mặc định thay vì file active

Nếu nhận định này đúng trong runtime, đây là lỗi nghiêm trọng nhất của tầng persistence mới.

File liên quan:

- `src-tauri/src/lib.rs`

### 3.2 Design đang ghi vào V2 nhưng đọc từ legacy

Hiện tại có sự lệch rõ ràng:

- Ghi: `uiSyncSlice` -> `invoke_design_event_batch` -> `event_store`
- Đọc/hydrate/undo/redo: `design_events` + `design_snapshots`

Nếu không có cầu nối đồng bộ hai hướng này, dữ liệu map có nguy cơ:

- Ghi thành công nhưng không nạp lại được
- Undo/redo không phản ánh đúng event mới
- Projection mới không trở thành nguồn sự thật thực sự

Đây là điểm cần quyết định kiến trúc sớm: chọn một nguồn sự thật duy nhất cho map state.

### 3.3 Projector V2 chưa đầy đủ

Hệ thống V2 đã có projector cho một số entity, nhưng chưa đầy đủ cho toàn bộ domain.

Kiểm tra code cho thấy:

- Có `ContractProjector` trong code
- Nhưng chưa thấy được register đầy đủ trong quá trình setup projector
- Chưa thấy projector rõ ràng cho `note` và `material`

Hậu quả có thể là:

- Command create đã ghi event
- Nhưng bảng projection đọc cho UI không được cập nhật
- UI không thấy dữ liệu vừa tạo

File liên quan:

- `src-tauri/src/IMPLEMENT/modules/v2/mod.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/projections/engine.rs`
- `src-tauri/src/IMPLEMENT/commands/contract.rs`
- `src-tauri/src/IMPLEMENT/commands/note.rs`
- `src-tauri/src/IMPLEMENT/commands/material.rs`

### 3.4 Frontend còn gọi command backend chưa rõ trạng thái

Trong frontend vẫn còn các lệnh invoke như:

- `get_projects`
- `delete_project`
- `close_active_project`
- `update_project_details`

Cần đối chiếu lại danh sách command đăng ký trong `lib.rs`, vì nếu command đã đổi tên hoặc chưa port xong thì đây là điểm gây lỗi runtime.

File liên quan:

- `src/IMPLEMENT/hooks/useProjectManager.ts`
- `src/IMPLEMENT/features/project-management/hooks/useProjectDetailLogic.ts`
- `src-tauri/src/lib.rs`

### 3.5 Mô hình ID đang lai giữa number và UUID

Frontend vẫn có dấu vết của mô hình `project.id` kiểu số, trong khi tầng V2 chuyển sang UUID.

Hiện tại có lớp chuyển đổi từ `number` sang UUID để tương thích. Cách này giúp quá độ, nhưng có một số chi phí:

- Khó debug
- Khó truy vết join logic
- Tăng nguy cơ sai map ID giữa frontend và backend

Đây là khoản nợ kỹ thuật nên được dọn khi persistence V2 ổn định.

## 4. Kết luận

Codebase mới đã tiến bộ rõ về mặt tổ chức:

- Tách domain rõ ràng
- Tách slice cho state map
- Có hướng đi V2 bài bản hơn legacy

Tuy nhiên, tầng lưu dữ liệu hiện chưa thống nhất. Hệ thống đang ở trạng thái chuyển tiếp:

- Legacy vẫn là nguồn đọc chính cho design
- V2 đã tham gia vào luồng ghi
- Search, content, project data và projection đang song song nhiều cách lưu

Nói ngắn gọn:

- Cấu trúc code mới: khá tốt
- Persistence hiện tại: chưa đồng bộ hoàn toàn
- Rủi ro lớn nhất: worker V2 có thể không ghi vào đúng project đang mở

## 5. Ưu tiên đề xuất

### Ưu tiên 1

Buộc worker V2 phải bind theo project đang active, không được dùng đường dẫn cứng.

### Ưu tiên 2

Chọn một nguồn sự thật duy nhất cho design/map:

- Hoặc đọc/ghi hoàn toàn bằng legacy
- Hoặc đọc/ghi hoàn toàn bằng V2

Không nên để một hệ thống ghi và hệ thống còn lại đọc lâu dài.

### Ưu tiên 3

Hoàn tất registration projector và read model cho:

- Contract
- Note
- Material
- Các entity còn lại đang ghi event nhưng chưa projection đầy đủ

### Ưu tiên 4

Rà soát lại toàn bộ Tauri command mà frontend đang invoke, đảm bảo:

- Command tồn tại
- Tên command khớp
- Signature khớp với frontend

### Ưu tiên 5

Lên kế hoạch bỏ hình ID lai, chốt mô hình chuẩn cho project/entity trong giai đoạn sau khi V2 ổn định.

## 6. Tài liệu và điểm vào cần đọc tiếp

Nếu cần đào sâu hơn, nên đọc tiếp các file sau:

- `tsconfig.json`
- `src/HOME/main.tsx`
- `src/HOME/App.tsx`
- `src/IMPLEMENT/features/project-management/ProjectMainView.tsx`
- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/DESIGN/features/map/stores/uiSyncSlice.ts`
- `src/DESIGN/features/map/stores/initializationSlice.ts`
- `src-tauri/src/lib.rs`
- `src-tauri/src/IMPLEMENT/db/mod.rs`
- `src-tauri/src/IMPLEMENT/db/schema.rs`
- `src-tauri/src/DESIGN/design_events/mod.rs`
- `src-tauri/src/IMPLEMENT/commands/v2_events.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/schema.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/worker.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/mod.rs`
