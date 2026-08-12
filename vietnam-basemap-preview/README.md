# Vietnam Basemap Preview

Standalone Windows preview dành cho developer/operator. Preview không khởi chạy
`src-tauri` production, không đọc database/project data và không có release
lifecycle commands.

## Chạy local

Từ repository root:

```bash
npm run dev:basemap-preview
```

Để mở local package từ executable, dùng một trong các cách sau:

```text
vietnam-basemap-preview.exe --package "C:\\path\\to\\release"
VIETNAM_BASEMAP_PACKAGE=C:\\path\\to\\release vietnam-basemap-preview.exe
```

Hoặc đặt `basemap-preview.config.json` cạnh executable:

```json
{ "packageRoot": "C:\\\\path\\\\to\\\\release" }
```

Trong UI, chọn `Local package` rồi dùng `Chọn local package` để mở directory
picker. Package được kiểm tra manifest, contract/schema, style và toàn bộ asset
được khai báo trước khi map render; tile archive PMTiles được đọc theo byte
range để không cần Internet.

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
nguồn khác, không tự động fallback. Attribution thuộc trách nhiệm operator.
