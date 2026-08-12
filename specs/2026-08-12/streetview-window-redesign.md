# StreetView Window Redesign Specification

**Spec Slug**: `streetview-window-redesign`  
**Date**: `2026-08-12`  
**Status**: `approved`  

## Overview

Thiết kế và triển khai lại giao diện cửa sổ Google Street View (`preview-streetview`) trong ứng dụng `vietnam-basemap-preview`. Giao diện mới **chỉ sử dụng Google Street View Public Link Embed (iframe)**, loại bỏ hoàn toàn các thanh công cụ và nút bấm dư thừa (các nút xoay 15°, tiến/lùi, thanh kéo FOV), mang lại trải nghiệm tràn viền (100% full-bleed) hiện đại, độc lập không phụ thuộc vào Google Maps API Key.

---

## Locked Decisions

- **D1 (Full-bleed UI & Clean Layout)**: Xóa bỏ hoàn toàn thanh Header tĩnh và thanh điều khiển thủ công (`street-view-fallback-controls`). Toàn bộ cửa sổ hiển thị Panorama tràn viền 100%. Chỉ sử dụng 1 Floating Glassmorphism Badge ở góc trên bên trái hiển thị thông tin tọa độ và trạng thái kết nối, tự động làm mờ/ẩn khi người dùng di chuyển chuột.
- **D2 (Public Embed Exclusively - Không phụ thuộc API Key)**: Sử dụng duy nhất luồng Public Embed (`createPublicStreetViewUrl`) hiển thị qua `<iframe>` tràn viền. Xóa bỏ hoàn toàn phần tải Google Maps JS SDK và các cảnh báo lỗi liên quan đến API Key.
- **D3 (Live Viewpoint Syncing)**: Nhận và đồng bộ các sự kiện thay đổi góc nhìn/tọa độ từ Bản đồ chính (`preview_streetview_init` & `preview_streetview_sync`) để cập nhật URL Public Embed tức thì khi vị trí Pegman trên bản đồ chính thay đổi.
- **D4 (Centered Empty State khi không có tọa độ)**: Khi chưa chọn tọa độ hoặc tọa độ không khả dụng, hiển thị giao diện Empty State sang trọng ở trung tâm cửa sổ với nút bấm *"Về vị trí mặc định (Trung tâm)"*.

---

## System Decision Impact

- **Impact**: `none`

---

## Requirements

### Functional Requirements

- **FR-1**: Loạị bỏ hoàn toàn `<header className="street-view-toolbar">` và `<div className="street-view-fallback-controls">` khỏi `StreetViewPreviewApp.tsx`.
- **FR-2**: Loại bỏ luồng tải `loadGoogleMaps` SDK và logic kiểm tra `VITE_GOOGLE_MAPS_API_KEY`. Chuyển cửa sổ StreetView sang sử dụng 100% Google Street View Public Embed iframe.
- **FR-3**: Thiết kế Floating Badge tràn phía trên `<iframe>` với hiệu ứng Backdrop Blur (Glassmorphism), hiển thị trạng thái `"Google Public Embed"`, tọa độ hiện tại `[lng, lat]`. Badge tự động mờ bớt Opacity sau 2.5s không tương tác.
- **FR-4**: Duy trì giao thức lắng nghe sự kiện đồng bộ Tauri Event (`listenPreviewStreetViewInit`) để tự động cập nhật URL Public Embed khi Pegman di chuyển trên Bản đồ chính.
- **FR-5**: Xóa các thanh màu đỏ báo lỗi API Key. Thay vào đó, thiết kế Empty State UI sang trọng khi tọa độ rỗng hoặc không hợp lệ.

### Non-Functional Requirements

- **NFR-1 (UI/UX Performance)**: Iframe hiển thị tràn viền (100vw x 100vh), phản hồi tức thì khi resize cửa sổ, không có đường viền `border: 0` hay scrollbar dư thừa.
- **NFR-2 (Design Consistency)**: Tuân thủ Design System (Inter font, Glassmorphism `#ffffff15`, border `#ffffff20`, text Slate-900/White, Lucide/SVG icons).

---

## Acceptance Criteria

- [ ] **AC-1**: Cửa sổ StreetView hiển thị Google Public Embed 100% diện tích view, không phụ thuộc vào Google Maps API Key, không có thông báo lỗi API Key.
- [ ] **AC-2**: Không còn thanh Header tĩnh cố định ở trên và các nút bấm `↶ 15°`, `↷ 15°`, `Tiến`, `Lùi`, `FOV` ở dưới.
- [ ] **AC-3**: Floating Glassmorphism Badge ở góc trên hiển thị trạng thái & tọa độ, mờ dần sau 2.5s và hiện rõ lại khi rê chuột.
- [ ] **AC-4**: Di chuyển Pegman trên bản đồ chính cập nhật tọa độ iframe StreetView tương ứng lập tức.
- [ ] **AC-5**: Khi không có tọa độ hợp lệ, hiển thị Empty State tinh tế giữa màn hình với nút chọn vị trí mặc định.

---

## Scenarios

### Scenario 1: Mở Street View từ Bản đồ chính
**Given** Người dùng di chuyển Pegman trên bản đồ chính  
**When** Cửa sổ Street View được khởi tạo hoặc cập nhật  
**Then** Cửa sổ tải trực tiếp URL Google Public Embed tương ứng với tọa độ Pegman, hiển thị tràn viền full-bleed không có nút điều khiển thừa.

### Scenario 2: Trạng thái chờ / Không có tọa độ (Edge Case)
**Given** Tọa độ Pegman chưa được thiết lập  
**When** Mở cửa sổ Street View  
**Then** Màn hình hiển thị giao diện Empty State đẹp mắt ở giữa với nút bấm về vị trí mặc định (Hà Nội / TP.HCM).

---

## Proposed Technical Changes

### [MODIFY] [StreetViewPreviewApp.tsx](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/StreetViewPreviewApp.tsx)
- Đơn giản hóa toàn bộ component: xóa `loadGoogleMaps`, `panoramaRef`, `setMode('api')`.
- Sử dụng duy nhất `<iframe>` với `src={publicUrl}` tràn màn hình (`w-full h-full border-none`).
- Loại bỏ `<header>` và `.street-view-fallback-controls`.
- Thêm `<div className="street-view-floating-badge">` tràn lên trên iframe với hiệu ứng auto-hide fade.

### [MODIFY] [index.css](file:///d:/Code%20Antinigaty/RUST/vietnam-basemap-preview/src/index.css)
- Cấu hình style full-bleed cho `.street-view-shell` và `iframe.street-view-panorama` (`height: 100vh`, `width: 100vw`, `border: none`).
- Style Glassmorphism cho `.street-view-floating-badge`.

---

## Task Links

*(Các task cụ thể sẽ được sinh tự động sau khi Spec được người dùng phê duyệt)*
