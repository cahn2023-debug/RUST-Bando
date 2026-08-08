# PLAN: Sửa lỗi giao diện không scale tức thời với cửa sổ Native Window

## 1. Bối cảnh & Mục tiêu (Context & Goals)
- **Bối cảnh**: Ứng dụng Tauri (Windows) gặp tình trạng giao diện UI giữ nguyên kích thước 1280x800 ở góc trên bên trái, chừa lại mảng màu đen lớn phía bên phải và bên dưới khi phóng to (maximize) hoặc kéo rê thay đổi kích thước cửa sổ native.
- **Mục tiêu**: Đảm bảo toàn bộ DOM layout, WebGL Canvas và WebView2 container scale 100% tràn viền tức thời (instantaneous sync) theo mọi chuyển động resize và thay đổi High-DPI scale factor trên Windows.

## 2. Kiến trúc giải pháp (Architecture & Design)
1. **Tauri Native Window Configuration**:
   - Cấu hình `backgroundColor: "#0F1115"` trong `tauri.conf.json`.
   - Đăng ký hook `on_window_event` trong `lib.rs` lắng nghe `Resized` & `ScaleFactorChanged`.
2. **CSS Layout System**:
   - Áp dụng `width: 100vw; height: 100vh; overflow: hidden` trên `html, body, #root`.
   - Đảm bảo `.cad-shell-window` và `.workspace-grid` mở rộng flex/grid 100% tự động.
3. **WebGL & MapLibre Canvas Instant Sync**:
   - Sử dụng `requestAnimationFrame` kết hợp `ResizeObserver` cho `BasemapRuntime` và `FeatureOverlayCanvas` để repaint canvas ngay trong cùng render frame.

## 3. Các file thay đổi (File Modifications)
- `src-tauri/tauri.conf.json`: Cấu hình window background & min dimensions.
- `src-tauri/src/lib.rs`: Thêm event handler cho native window event.
- `index.html` & `src/modules/design/index.css`: Cấu hình css reset 100% viewport.
- `src/modules/home/main.tsx`: Đồng bộ viewport size & listener DPI scale.
- `src/core/basemap/BasemapRuntime.ts`: Tối ưu instant resize cho MapLibre.
- `src/modules/design/features/map/render/FeatureOverlayCanvas.tsx`: Tối ưu instant resize cho WebGL overlay canvas.

## 4. Rủi ro & Giải pháp (Risks & Mitigation)
- **Rủi ro**: Lag do resize event bắn ra quá nhiều tần số khi kéo rê cửa sổ.
- **Giải pháp**: Throttle repaint canvas bằng `requestAnimationFrame` duy trì 60 FPS mượt mà.

## 5. Kiểm thử & Nghiệm thu (Verification & Acceptance)
- Compile `cargo check` & `npm run type-check`.
- Kiểm thử kéo rê viền native window, nút maximize/unmaximize trên Windows.
