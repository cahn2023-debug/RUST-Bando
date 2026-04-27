# Implementation Log: AutoCAD-style Palette System

- **Date**: 2026-03-22
- **Feature**: AutoCAD-style Palette System (Auto-hide, Pins, Sidebar)
- **Status**: Completed & Verified

## Changes Summary
1.  **useLayoutStore**: Quản lý trạng thái Palette (visible, pinned, width, active) thông qua Zustand.
2.  **PaletteSidebar**: Thanh dock dọc bên phải chứa các biểu tượng Palette.
3.  **PalettePanel**: Container cho nội dung Palette, hỗ trợ sliding animations và resizing.
4.  **Auto-hide Logic**: Sử dụng `onMouseLeave` để tự động thu gọn Palette khi không được ghim (unpinned).

## Inherited Code
- Kế thừa `ProjectDetail.tsx` và tích hợp Palette Sidebar vào layout chính.
- Refactor `CADPropertyManager.tsx` để xóa các border/background cũ, cho phép nó hiển thị đồng nhất bên trong `PalettePanel`.

## Verification
- **Manual Test**: Hover vào icon sidebar -> Palette hiện ra. Click Pin -> Palette cố định và đẩy nội dung chính sang trái.
- **Bug Fix**: Đã xử lý triệt để lỗi React Hook "Rendered more/fewer hooks than expected" bằng cách chuẩn hóa thứ tự render và di chuyển Hook lên đầu file.
- **Regression**: Toàn bộ hệ thống map và CAD vẫn hoạt động bình thường.

## Notes
- Hiện tại chỉ hỗ trợ `property-manager`, dễ dàng mở rộng thêm các Palette khác như `tasks`, `notes` bằng cách đăng ký trong `useLayoutStore`.
