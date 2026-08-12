# Vietnam Basemap Preview

Standalone Windows preview dành cho developer/operator. Preview không khởi chạy
`src-tauri` production, không đọc database/project data và không có release
lifecycle commands. Mọi thao tác trong preview đều read-only.

## Chạy local

Từ repository root:

```bash
npm run dev:basemap-preview
```

Để mở local package từ executable:

```text
vietnam-basemap-preview.exe --package "C:\path\to\release"
VIETNAM_BASEMAP_PACKAGE=C:\path\to\release vietnam-basemap-preview.exe
```

Hoặc đặt `basemap-preview.config.json` cạnh executable:

```json
{ "packageRoot": "C:\\path\\to\\release" }
```

Trong UI, chọn `Local package` rồi dùng `Chọn local package` để mở directory
picker. Package được kiểm tra manifest, contract/schema, style và toàn bộ asset
trước khi map render; tile archive PMTiles được đọc theo byte range để không cần
Internet.

## Debug build

```bash
npm run build:basemap-preview-debug
```

Artifact nằm tại `dist/basemap-preview-debug/`:

- `vietnam-basemap-preview.exe`
- `vietnam-basemap-preview.pdb`

Online mode dùng cố định Google raster preview template:

```text
https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}
```

Đây là external preview source; khi tile lỗi UI giữ lỗi và chờ operator chọn
nguồn khác, không tự động fallback. Attribution được hiển thị trong UI.

## Điều khiển bản đồ và layer

- `Zoom +`/`Zoom -`: thay đổi một bước quanh tâm hiện tại.
- `Zoom extend`: fit extent của đối tượng mới nhất từ phần mềm gốc; không tạo overlay.
- `Định vị`: xin quyền geolocation, đặt marker và fly đến thiết bị. Lỗi hoặc từ chối quyền giữ nguyên viewport.
- Layer gồm `Google Street`, `Google Hybrid` và `Local package`.
- Lần chạy đầu hiển thị màn hình chọn layer; các lần sau khôi phục cấu hình người dùng.

## Nhận extent từ phần mềm gốc

Tauri preview mở HTTP API chỉ trên loopback `127.0.0.1` (mặc định cổng `38741`):

```bash
curl -X POST http://127.0.0.1:38741/api/v1/extent \
  -H "Content-Type: application/json" \
  -d '{"objectId":"road-1","geometry":{"type":"LineString","coordinates":[[105,10],[106,11]]}}'
```

Payload HTTP và Tauri IPC dùng cùng shape chuẩn hóa. Có thể gửi `geometry`,
`data` hoặc `feature` chứa Point/LineString/Polygon/Feature/FeatureCollection;
đối tượng phải có `objectId` hoặc `id`. Payload lỗi bị từ chối và hiển thị
diagnostic, không làm đổi viewport hợp lệ.

Để nhận file tự động, chọn một thư mục watcher trong UI. Preview chỉ đọc các
file `.json`/`.geojson` trực tiếp trong thư mục đó; tên file làm object id.
Auto-zoom bật mặc định, có thể tắt để chờ người dùng bấm `Zoom extend`.
Extent chỉ tính trên đối tượng vừa nhận, không hợp nhất toàn bộ thư mục.

## Local package và `.pdb`

Chọn `Local package`, sau đó chọn thư mục package hợp lệ. Preview kiểm tra
manifest, contract/schema, style và asset trước khi render; lỗi hiển thị chi
tiết và yêu cầu chọn lại. Package local hợp lệ luôn được ưu tiên.

Link `.pdb` chỉ được tải khi người dùng bấm nút tải thủ công và chọn thư mục
lưu. Package chỉ trở thành layer đang dùng sau khi tải, giải nén và kiểm tra
thành công; archive entry ngoài package root hoặc có path traversal bị từ chối.

## Pegman và Street View

1. Chọn một điểm trên bản đồ.
2. Bấm `Pegman` ở góc trên bên phải để mở cửa sổ desktop Street View riêng.
3. Cửa sổ nhận điểm, heading, pitch và FOV hiện tại; khi thay đổi, marker
   Pegman trên bản đồ chính cập nhật vị trí, hướng nhìn và FOV liên tục.

`VITE_GOOGLE_MAPS_API_KEY` là tùy chọn trong `.env`. Khi có key hợp lệ, cửa sổ
con dùng Google Maps JavaScript `StreetViewPanorama` và các event
`position_changed`, `pov_changed`, `zoom_changed` để đồng bộ trực tiếp. Khi
không có key, cửa sổ vẫn mở Google public embed và hiển thị diagnostic; đồng bộ
event đầy đủ cần API key. Đóng cửa sổ hoặc lỗi nguồn không làm hỏng bản đồ chính.

## Kiểm tra standalone

Từ thư mục `vietnam-basemap-preview`:

```bash
npm exec -- tsc -p tsconfig.json --noEmit
npx vitest run --config vitest.config.ts
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
```

## Vietnam Basemap Platform workspace

This directory is the standalone workspace for both the read-only desktop
preview and the reusable Vietnam Basemap Platform. The platform owns source
metadata, versioned release packages, styles, fonts/glyphs, sprites, tile
assets, and the online/offline manifest contract. It does not own application
features, project data, the legacy Tauri backend, or the SQLite database.

Release packages expose the following basemap-only contract:

```text
manifest.json
tiles/
styles/
fonts/
sprites/
```

Run platform checks from this directory:

```bash
npm run check:platform
```

The command runs Cargo formatting, checks, and tests for all platform crates.
Preview Tauri checks remain separate:

```bash
npm run check:tauri
```

The standalone combined gate is:

```bash
npm run check
```

The temporary debug EXE/PDB artifacts are written to
`../dist/basemap-preview-debug/`. Existing unrelated content in `../dist/`
is preserved.

## Legacy rollback snapshot

Before consolidation, the legacy application source was archived at
`../BAK/archive/2026-08-12/vietnam-basemap-preview-workspace-consolidation/legacy-application/`.
Its sibling `manifest.json` records file sizes and SHA-256 hashes; generated
targets and runtime databases are kept separately under the same BAK archive.
