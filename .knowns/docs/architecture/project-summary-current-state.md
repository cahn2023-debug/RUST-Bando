---
title: 'Project Summary & Current State'
description: Source-aligned project overview, runtime architecture, data model, current frontend/BAK state, roadmap, patterns, decisions and known failures.
createdAt: '2026-08-11T04:48:59.843Z'
updatedAt: '2026-08-11T04:48:59.843Z'
tags:
  - architecture
  - overview
  - project
  - source-aligned
  - current-state
---

# Project Manager — Tổng hợp dự án và trạng thái hiện tại

> Bản tổng hợp source-aligned ngày 2026-08-11. Đây là tài liệu canonical trong Knowns cho việc định hướng nhanh; chi tiết triển khai vẫn phải kiểm tra ở mã nguồn và spec liên quan.

## 1. Phạm vi sản phẩm

Project Manager là ứng dụng desktop phục vụ ba nhóm nghiệp vụ:

- Quản lý hồ sơ thiết kế và file kỹ thuật.
- Thiết kế/GIS trên bản đồ: lớp, nhóm feature, hình học, thuộc tính, chọn/sửa, viewport query, basemap và xuất dữ liệu.
- Quản lý triển khai/vận hành: task, vật tư, hợp đồng, báo cáo, media, fiber inventory/topology, đồng bộ và trợ lý AI.

Runtime chính là Tauri v2 trên Windows, với frontend React/TypeScript và backend Rust. Dữ liệu dự án cục bộ được lưu trong container .pmp dựa trên SQLite; backend và schema SQLite là nguồn sự thật của dữ liệu, không phải component React hay các tài liệu lịch sử.

## 2. Luồng runtime chính

UI React 19 + Vite
→ adapter IPC typed/safe ở src/contracts/tauri-api và lớp IMPLEMENT/lib/tauri
→ Tauri commands Rust
→ ActorState chứa mpsc gateway
→ StorageCommand
→ StorageWorker/SQLite
→ dữ liệu project, event, projection, map tile, media, backup và health.

Khi app khởi động:

- src-tauri/src/main.rs gọi design_core::run().
- src-tauri/src/lib.rs khởi tạo logger, database V2 tạm thời, StorageWorker, state hydrator, BasemapWorker, GisStreamWorker và AiState.
- Tauri đăng ký plugin dialog, state và toàn bộ command qua register_tauri_commands!.
- Frontend vào từ src/modules/home/main.tsx, khởi tạo Tauri adapter, i18n, ErrorBoundary và lazy views.
- src/modules/home/App.tsx quản lý app shell, project lifecycle, tab, save/force-save, layout/palette, auth/bootstrap và các provider Map/Basemap.

Các luồng chạy song song nhưng phải giữ ranh giới:

- React chỉ gọi IPC qua adapter, không truy cập SQLite trực tiếp.
- StorageWorker tuần tự hóa các thao tác lưu/query theo StorageCommand.
- MapLibre xử lý render ở frontend; backend cung cấp bootstrap, feature detail, viewport data và map tiles.
- Basemap runtime là hệ thống riêng, được dùng qua BasemapProvider/PersistentBasemapHost và adapter useMapStyles.
- AI, P2P và GIS là capability/backend subsystem; việc bật capability không có nghĩa mọi đường đi đã hoàn thiện end-to-end.

## 3. Cấu trúc mã nguồn đang hoạt động

### Frontend

- src/modules/home: entrypoint, App shell, bootstrap, dashboard và workspace.
- src/modules/design: thiết kế, bản đồ, palette/CAD UI, feature interaction, MapLibre renderer, drawing, snapping, FOV/DORI và street view.
- src/modules/implement: project management, auth/settings/layout store, storage service, file/content workflows và typed integration.
- src/modules/contract: dữ liệu/giao diện hợp đồng.
- src/modules/analytics: dashboard và phân tích.
- src/modules/i18n: locale và khởi tạo react-i18next.
- src/modules/tool: IPC helper, accessibility, data utilities và feature-symbol normalization.
- src/core: basemap runtime, cache, shared stores và core services.
- src/contracts: kiểu dữ liệu/adapter giao tiếp Rust.
- src/shared: component và utility dùng chung.
- src/infrastructure: có trong lịch sử replacement frontend; không xem là entrypoint live nếu chưa được khôi phục vào src hiện tại.

### Backend Rust

Workspace nằm ở src-tauri:

- app_domain: domain logic dùng chung.
- gis_engine: tọa độ, hình học và GIS/GeoJSON/Shapefile.
- module_gis: dữ liệu bản đồ/GIS và tích hợp storage.
- module_p2p: libp2p, mDNS, gossipsub và thông điệp sync.
- shared_kernel: error/logging/utilities dùng chung.
- src-tauri/src/domain/implement: implementation domain, command layer, state và V2 modules.
- modules/v2/storage: connection, schema, audit và migration.
- modules/v2/pipeline: eventbus và StorageWorker.
- modules/v2/basemap, gis, ai: worker và capability chuyên biệt.

## 4. Storage và data model canonical

Nguồn canonical: src-tauri/src/domain/implement/modules/v2/storage/schema.rs, commands/v2.rs, commands/v2_bridge.rs và worker_storage.rs.

Schema hiện tại:

- CURRENT_SCHEMA_VERSION = 11, label 11.0.0.
- MIN_COMPATIBLE_SCHEMA_VERSION = 8.
- SQLite bật validation bằng CHECK/JSON, foreign key, index, trigger, FTS5 và R-tree/spatial index.
- Mỗi project có các quan hệ project_id; nhiều quan hệ dùng cascade hoặc kiểm tra cùng project để tránh cross-project reference.

Các nhóm bảng chính:

- Core/project: sys_config, schema_migrations, projects, files, project_settings, project_snapshots.
- Design/GIS: regions, layers, feature_groups, features, map_tile_cache, feature_rtree.
- Media/tag: media_assets, feature_media, tags, file_tags.
- Event/sync: events, sync_outbox, sync_cursor, cached_leases, sync_conflicts.
- Search: fts_files_content và các trigger đồng bộ FTS.
- AI: ai_conversations, ai_messages, ai_actions, ai_embeddings, ai_corrections.
- Fiber/inventory: fiber_cables, fiber_strands, fiber_cable_points, fiber_ports, fiber_port_terminations, fiber_port_patches, fiber_splices, fiber_circuits, fiber_circuit_hops, equipment.
- History: design_history.

Nguyên tắc dữ liệu:

- coordinates_json/properties_json/metadata_json phải giữ đúng kiểu JSON mà schema yêu cầu.
- Feature geometry có bbox, SRID và dữ liệu hình học tùy đường đi.
- Event/global sequence là căn cứ revision cho trạng thái thiết kế và đồng bộ.
- File/media dùng path tương đối trong project, hash và metadata; các flow backup/restore/recovery do StorageWorker quản lý.
- Không thêm bảng/field vào frontend contract chỉ vì tài liệu cũ mô tả; đối chiếu schema sống và command request/response trước.

## 5. IPC và nhóm chức năng backend

Các command V2 hiện bao phủ những nhóm sau:

- Project lifecycle: mở bootstrap, active/recent project, close, delete, save, force-save, project state.
- File/content: index/search FTS, binary read/write, task/note/contract/material, content fields/items.
- Design state: load state, dispatch event batch, update metadata, undo/redo, normalize metadata.
- Map: query_visible_features_v2, feature detail, tile get/build/invalidate, nearest snap.
- Fiber: inventory, cable points, capacity, trace circuit, validate network.
- Storage reliability: optimize, health, integrity audit, backup/list/restore, media recovery.
- Import/export/media: PMP preview/import, media asset lifecycle, report site photos, BOM/contract analysis.
- Sync: online/offline, pending outbox, mark synced và runtime sync state.
- AI: conversations/messages/actions/config/model-related flow trong module ai.
- Dashboard/analytics: project stats, extension distribution, top files và audit logs.

Command bridge dùng oneshot reply qua StorageCommand; mọi thay đổi command cần kiểm tra đồng thời Rust type, serde naming, TypeScript contract, adapter, test và boundary checker.

## 6. Frontend map và hiệu năng

Map hiện tại là MapLibre-oriented, không nên dùng tài liệu cũ mô tả Leaflet làm sự thật.

Luồng map chính:

- BasemapRuntime quản lý preset/preferences và cache tile; useMapStyles là adapter vocabulary của design module.
- MapLibreFastRenderer nhận state từ useDesignSync, dựng GeoJSON/source/layer, preload/register ảnh icon, áp dụng feature state và overlay.
- queryVisibleFeaturesV2 truyền project, bbox, zoom, hidden IDs, limit, fast payload, revision và request ID qua IPC.
- Large project dùng viewport-first khi vượt giới hạn 10.000 feature; query backend là nguồn dữ liệu authoritative cho visibleFeatures.
- viewportQueryRevision là tín hiệu yêu cầu query lại sau FeatureCreated/FeatureUpdated; viewportRevision biểu diễn revision dữ liệu/render. setViewportFeatures không được tạo vòng lặp query.
- Mục tiêu kỹ thuật của roadmap: first-feature dưới 2000ms, frame dưới 16ms, progressive batch và không query/render lặp vô hạn.

Feature symbol contract hiện có trong learning doc:

- Normalize icon alias, màu an toàn, bounds kích thước và default theo geometry ở một utility dùng chung.
- MapIcons.tsx là nguồn SVG; CameraIcons.tsx chỉ nên là compatibility re-export.
- Kích thước point đã lưu là kích thước pixel cuối cùng của bitmap MapLibre; không tự nhân 1.5 theo loại icon.
- SVG đưa qua createImageBitmap phải standalone/decoder-safe; tránh filter/style markup không portable.
- GeoJSON source phải giữ maxzoom lớn hơn clusterMaxZoom.

Tham chiếu đầy đủ: @doc/learnings/learning-map-feature-symbol-normalization.

## 7. Trạng thái frontend rewrite và BAK

Đây là điểm dễ nhầm nhất:

- Frontend live hiện tại đã được phục hồi về cây legacy src/; entrypoint index.html trỏ về src/modules/home/main.tsx.
- Snapshot legacy nằm tại BAK/archive/2026-08-09/frontend, gồm 460 file src và public/basemap-sw.js, manifest SHA-256 tree 67e7f09b6a6d84f85cac526b56add427ab0daaeca8aa76ac4c096d9362847ec6.
- Replacement shell thử nghiệm nằm tại BAK/archive/2026-08-09/replacement-frontend, gồm 16 source files + index.html, manifest SHA-256 tree 015f3fc9498f5d92aec7ecb9bd33100ad2447f637fc5197f5c1e46cdc2e9bd73.
- src-tauri và SQLite không bị archive/di chuyển.
- Draft decision về typed Tauri boundary/replacement frontend chưa được accept; không dùng draft đó để khẳng định replacement đang live.

## 8. Roadmap và task state trong Knowns

Parent @task-7qmhzr đang in-progress vì các slice con chưa hoàn tất, dù các acceptance criteria về archive, contract, roadmap, shell và quality gate của parent đã được ghi nhận complete.

Thứ tự slice đã chốt trong task:

1. Project/File/Metadata — @task-mup6bx — todo.
2. Map/Feature — @task-9bp8ef — done; có learning/decision draft liên quan.
3. Fiber/Inventory — @task-f89qca — todo.
4. Sync/History/AI/Reports — @task-baxorm — todo.

Các task đã hoàn tất:

- @task-if0p6x: tách viewportQueryRevision khỏi viewportRevision, giữ viewport-bounded query.
- @task-r5n8sr: sửa SVG decoder compatibility, maxzoom invariant và render-layer hydration.
- @task-t6kouu: xóa dead local bindings đã được static analysis xác minh.

Khi bắt đầu slice mới, đọc task tương ứng, đối chiếu schema/IPC và chỉ thay đổi phạm vi slice; không coi các notes của parent là bằng chứng rằng slice con đã triển khai.

## 9. Quality gate và workflow

Lệnh phát triển:

- npm run dev: Vite frontend.
- npm run tauri dev: desktop app frontend + Rust.
- npm run build / npm run build:msi: build web hoặc Windows MSI.

Quality gate bàn giao:

- npm run check:frontend: encoding, boundaries, typecheck, lint, Vitest coverage và Vite build.
- npm run check:backend: cargo fmt --check, cargo check workspace/all-targets, cargo test workspace, cargo clippy -D warnings.
- npm run check: chạy cả frontend và backend.
- git diff --check: kiểm tra whitespace/diff.

Kết quả gần nhất trong task notes: frontend full gate và backend full gate đã pass ở các task gần đây; vẫn có lint warnings pre-existing và một performance test từng flaky theo tải máy. Mọi triển khai mới phải chạy lại gate, không lấy kết quả cũ làm bằng chứng thay thế.

## 10. Git/worktree và tài liệu

Tại thời điểm audit:

- Branch: Fix-error-Display-on-Map-and-Database.
- HEAD gần nhất: 7085c300 feat: initialize Knowns documentation framework and add base UI components.
- Worktree có nhiều thay đổi có sẵn ở basemap/map renderer/store, icon contract/tests, i18n, project manager, scripts, .env.example và Knowns metadata. Không được revert hay dọn các thay đổi đó khi làm task khác.
- docs/context-pack là snapshot audit ngày 2026-08-05; docs/context-pack/DOCUMENT_STATUS.md phân loại tài liệu active, needs-review, stale và archive-candidate.
- Nhiều tài liệu cũ còn nói Leaflet hoặc mô tả cây source đã thay đổi; tài liệu hiện tại phải ghi rõ ngày/source và ưu tiên mã nguồn sống.
- Một số tài liệu tiếng Việt có lỗi encoding/mojibake; không sửa hàng loạt trong task tổng hợp này.

## 11. Patterns, decisions, failures đã trích xuất

### Patterns

- Typed IPC boundary: component → adapter/contract → Tauri command → StorageCommand → worker/database.
- Vertical slice rewrite: mỗi slice sở hữu model, service/repository, IPC adapter, store, UI và test.
- Viewport-first rendering: backend query bounded theo bbox/limit; renderer phản ứng bằng revision riêng.
- Shared feature-symbol normalization: preview, SVG, MapLibre và persisted metadata dùng cùng invariant.
- Quality gate theo hai phía frontend/backend trước bàn giao.

### Decisions hiện có

- SQLite schema/command/worker là canonical runtime source.
- Archive có manifest/hash trước khi rewrite frontend.
- Legacy live frontend và replacement archive phải được phân biệt rõ.
- Các quyết định hệ thống liên quan icon contract, typed boundary và viewport revision hiện vẫn là draft/needs_evidence trong Review Inbox; không coi là accepted System Decision.

### Failures/rủi ro đã biết

- Tài liệu architecture cũ lệch MapLibre/basemap hiện tại.
- WebView có thể bỏ qua SVG có filter/style không portable; regression phải kiểm tra rasterization standalone.
- MapLibre GeoJSON source có invariant maxzoom > clusterMaxZoom.
- Full-suite performance test có thể flaky theo tải máy; rerun isolation trước khi đổi threshold.
- Rewrite frontend chưa hoàn tất; parent còn in-progress và ba slice con còn todo.
- Backend C# LSP chưa cài được; dùng Rust/TypeScript CodeGraph/LSP và quality gates theo khả năng môi trường.

## 12. Canonical references

- @doc/architecture/overview
- @doc/architecture/backend
- @doc/architecture/frontend
- @doc/guides/development
- @doc/specs/overview
- @doc/learnings/learning-map-feature-symbol-normalization
- docs/context-pack/PROJECT_OVERVIEW.md
- docs/context-pack/ARCHITECTURE_MAP.md
- docs/context-pack/DOCUMENT_STATUS.md
- src-tauri/src/domain/implement/modules/v2/storage/schema.rs
- src-tauri/src/domain/implement/commands/v2.rs
- src-tauri/src/domain/implement/commands/v2_bridge.rs
- src-tauri/src/domain/implement/modules/v2/pipeline/worker_storage.rs
- BAK/archive/2026-08-09/frontend/MANIFEST.md
- BAK/archive/2026-08-09/replacement-frontend/MANIFEST.md
