# Tong hop cau truc moi va kiem tra luu du lieu

Ngay cap nhat: 2026-04-17

## Muc dich

Tai lieu nay tong hop nhanh hien trang codebase sau dot refactor moi, tap trung vao:

- Cau truc frontend/backend theo domain
- Cach luu du lieu hien tai
- Cac diem lech giua cau truc moi va persistence thuc te
- Thu tu uu tien de hop nhat he thong

Danh gia nay duoc lap tu viec doc code va trace luong goi ham, chua bao gom viec chay thu nghiem end-to-end.

## 1. Tong quan cau truc moi

### 1.1 Frontend

Frontend da duoc tach theo domain, cac alias chinh nam trong `tsconfig.json`:

- `@HOME -> src/HOME`
- `@DESIGN -> src/DESIGN`
- `@CONTRACT -> src/CONTRACT`
- `@IMPLEMENT -> src/IMPLEMENT`
- `@RESOURCES -> src/RESOURCES`
- `@TOOL -> src/TOOL`

Diem vao giao dien:

- `src/HOME/main.tsx`: bootstrap app, lazy-load cac window lon
- `src/HOME/App.tsx`: shell chinh cua ung dung
- `src/IMPLEMENT/features/project-management/ProjectMainView.tsx`: dieu huong vao cac module `Design`, `Contract`, `Implement`, `Resources` va cac content type dong

State map/design da duoc tach thanh nhieu slice thay vi mot store lon:

- `src/IMPLEMENT/stores/useDesignSync.ts`
- `src/DESIGN/features/map/stores/*`

Nhom slice hien tai gom:

- Map state
- Selection
- Drawing
- UI control
- Initialization
- UI sync
- Action

Huong tach nay dung va de mo rong hon cau truc cu.

### 1.2 Backend

Backend trong `src-tauri/src` dang mirror lai cach tach domain:

- `HOME` khong xuat hien ro nhu frontend, nhung phan ung dung duoc bootstrap o `lib.rs`
- `DESIGN`
- `CONTRACT`
- `IMPLEMENT`
- `RESOURCES`
- `TOOL`

Trong do:

- `IMPLEMENT/commands`: lop Tauri command
- `IMPLEMENT/db`: tang SQLite hien tai
- `IMPLEMENT/modules`: gom `core`, `ingestion`, `v2`, `ai`
- `IMPLEMENT/modules/v2`: he thong persistence moi theo huong event-sourcing + projection

Bootstrap runtime dang chia thanh hai tang:

- `IMPLEMENT/modules/bootstrap.rs`: khoi tao config, `DatabaseState`, `MapState`, preview service, legacy bridge
- `lib.rs`: dang ky command va khoi dong worker V2

## 2. Cach luu du lieu hien tai

He thong luu du lieu hien tai la hybrid. Refactor moi da tao ra tang V2, nhung phan doc/ghi du lieu thuc te van chay song song giua legacy va V2.

### 2.1 Cau hinh ung dung

Cau hinh app duoc luu rieng trong `settings.json` thong qua `AppConfig`.

No chua cac thong tin:

- `last_opened_pmp`
- `recent_pmps`
- `enable_ai`
- `low_power_mode`
- `current_user_email`
- `user_roles`
- `pending_pmp_path`

File lien quan:

- `src-tauri/src/IMPLEMENT/modules/core/config.rs`

### 2.2 File du an `.pmp`

Khi nguoi dung mo du an, backend van mo file `.pmp` nhu SQLite database chinh.

Lop legacy DB dang:

- Tao `read connection`
- Tao `write connection`
- Duy tri connection pool
- Luu active project path
- Detect version DB

File lien quan:

- `src-tauri/src/IMPLEMENT/db/mod.rs`

Version database hien dang duoc phan loai nhu sau:

- Co `event_store` -> `new_v2`
- Co `projects.title` -> `core_v2`
- Nguoc lai -> `v1`

### 2.3 Luu trang thai design/map theo legacy

Phan nap state cho map hien tai van dua tren bang legacy:

- `design_snapshots`
- `design_events`

Luong nay duoc dung de:

- Hydrate lai `MapState`
- Undo/redo
- Deduplicate
- Khoi phuc state ban dau cua project

Frontend van goi `load_design_state` trong initialization slice, nghia la luong doc design hien tai van chua chuyen hoan toan sang V2.

File lien quan:

- `src-tauri/src/DESIGN/design_events/mod.rs`
- `src/DESIGN/features/map/stores/initializationSlice.ts`
- `src-tauri/src/IMPLEMENT/db/schema.rs`

### 2.4 Luu su kien V2 theo event store

Song song voi legacy, luong ghi moi cua design da bat dau di vao V2.

Frontend:

- `src/DESIGN/features/map/stores/uiSyncSlice.ts`

Backend:

- `src-tauri/src/IMPLEMENT/commands/v2_events.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/worker.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/storage/schema.rs`

Luong nay co dac diem:

- Frontend tao event batch
- Backend chuyen event sang `AppEvent`
- Worker ghi vao `event_store`
- Sau do chay projector de cap nhat projection table
- Ghi `manifest` va `last_global_seq`

V2 schema da co cac bang nen tang:

- `event_store`
- `entity_index`
- `blob_registry`

Va mot so projection table:

- `projects`
- `tasks`
- `features`
- `files`
- `contracts`
- `notes`
- `content_items`
- `project_settings`

### 2.5 Search va content van dang lai

He thong search hien chia lam hai:

- Legacy FTS tren `file_search`
- V2 search dua tren `entity_index` / `entity_search`

He thong content linh hoat va project settings van co phan di truc tiep vao bang SQL thay vi di qua event sourcing.

File lien quan:

- `src-tauri/src/IMPLEMENT/commands/search.rs`
- `src-tauri/src/IMPLEMENT/commands/content.rs`

## 3. Diem lech quan trong can chu y

### 3.1 Worker V2 dang tro vao duong dan cung

Phat hien quan trong nhat: worker V2 duoc khoi tao tu dau voi database path cung la `project_v4.pmp`.

Y nghia:

- User co the mo mot file `.pmp` khac
- `DatabaseState` legacy da tro vao file dang mo
- Nhung worker V2 co kha nang van ghi vao file mac dinh thay vi file active

Neu nhan dinh nay dung trong runtime, day la loi nghiem trong nhat cua tang persistence moi.

File lien quan:

- `src-tauri/src/lib.rs`

### 3.2 Design dang ghi vao V2 nhung doc tu legacy

Hien tai co su lech ro rang:

- Ghi: `uiSyncSlice` -> `invoke_design_event_batch` -> `event_store`
- Doc/hydrate/undo/redo: `design_events` + `design_snapshots`

Neu khong co cau noi dong bo hai huong nay, du lieu map co nguy co:

- Ghi thanh cong nhung khong nap lai duoc
- Undo/redo khong phan anh dung event moi
- Projection moi khong tro thanh nguon su that thuc su

Day la diem can quyet dinh kien truc som: chon mot nguon su that duy nhat cho map state.

### 3.3 Projector V2 chua day du

He thong V2 da co projector cho mot so entity, nhung chua day du cho toan bo domain.

Kiem tra code cho thay:

- Co `ContractProjector` trong code
- Nhung chua thay duoc register day du trong qua trinh setup projector
- Chua thay projector ro rang cho `note` va `material`

Hau qua co the la:

- Command create da ghi event
- Nhung bang projection doc cho UI khong duoc cap nhat
- UI khong thay du lieu vua tao

File lien quan:

- `src-tauri/src/IMPLEMENT/modules/v2/mod.rs`
- `src-tauri/src/IMPLEMENT/modules/v2/projections/engine.rs`
- `src-tauri/src/IMPLEMENT/commands/contract.rs`
- `src-tauri/src/IMPLEMENT/commands/note.rs`
- `src-tauri/src/IMPLEMENT/commands/material.rs`

### 3.4 Frontend con goi command backend chua ro trang thai

Trong frontend van con cac lenh invoke nhu:

- `get_projects`
- `delete_project`
- `close_active_project`
- `update_project_details`

Can doi chieu lai danh sach command dang ky trong `lib.rs`, vi neu command da doi ten hoac chua port xong thi day la diem gay loi runtime.

File lien quan:

- `src/IMPLEMENT/hooks/useProjectManager.ts`
- `src/IMPLEMENT/features/project-management/hooks/useProjectDetailLogic.ts`
- `src-tauri/src/lib.rs`

### 3.5 Mo hinh ID dang lai giua number va UUID

Frontend van co dau vet cua mo hinh `project.id` kieu so, trong khi tang V2 chuyen sang UUID.

Hien tai co lop chuyen doi tu `number` sang UUID de tuong thich. Cach nay giup qua do, nhung co mot so chi phi:

- Kho debug
- Kho truy vet join logic
- Tang nguy co sai map ID giua frontend va backend

Day la khoan no ky thuat nen duoc don khi persistence V2 on dinh.

## 4. Ket luan

Codebase moi da tien bo ro ve mat to chuc:

- Tach domain ro rang
- Tach slice cho state map
- Co huong di V2 bai ban hon legacy

Tuy nhien, tang luu du lieu hien chua thong nhat. He thong dang o trang thai chuyen tiep:

- Legacy van la nguon doc chinh cho design
- V2 da tham gia vao luong ghi
- Search, content, project data va projection dang song song nhieu cach luu

Noi ngan gon:

- Cau truc code moi: kha tot
- Persistence hien tai: chua dong bo hoan toan
- Rui ro lon nhat: worker V2 co the khong ghi vao dung project dang mo

## 5. Uu tien de xuat

### Uu tien 1

Buoc worker V2 phai bind theo project dang active, khong duoc dung duong dan cung.

### Uu tien 2

Chon mot nguon su that duy nhat cho design/map:

- Hoac doc/ghi hoan toan bang legacy
- Hoac doc/ghi hoan toan bang V2

Khong nen de mot he thong ghi va he thong con lai doc lau dai.

### Uu tien 3

Hoan tat registration projector va read model cho:

- Contract
- Note
- Material
- Cac entity con lai dang ghi event nhung chua projection day du

### Uu tien 4

Ra soat lai toan bo Tauri command ma frontend dang invoke, dam bao:

- Command ton tai
- Ten command khop
- Signature khop voi frontend

### Uu tien 5

Len ke hoach bo hinh ID lai, chot mo hinh chuan cho project/entity trong giai doan sau khi V2 on dinh.

## 6. Tai lieu va diem vao can doc tiep

Neu can dao sau hon, nen doc tiep cac file sau:

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

