# Implementation Plan: Đồng Bộ UI-UX Data, Light/Dark Mode & i18n Tiếng Việt

Đồng bộ dữ liệu UI-UX của phần mềm lên Product Design System, hỗ trợ chuyển đổi giao diện Light Mode / Dark Mode toàn ứng dụng, chuẩn hóa bộ ngôn ngữ i18n (Tiếng Việt / Tiếng Anh) và sửa triệt để các lỗi hiển thị/mã hóa Tiếng Việt.

---

## User Review Required

> [!IMPORTANT]
> **Quyết định kiến trúc đã thống nhất qua `/grill-me`:**
> 1. **Theme State**: Quản lý bằng Zustand `useThemeStore` (`light`, `dark`, `system`), lưu `localStorage`, đồng bộ `[data-theme]` lên `<html>`.
> 2. **i18n & Vietnamese**: Bổ sung đầy đủ keys trong `locales/vi/common.json` & `locales/en/common.json`, thay thế chuỗi hardcode UI bằng `t()`, sửa lỗi font/mã hóa ở Canvas, Export Dialog và Báo cáo.
> 3. **Design System Artifact**: Khởi tạo `design-system/MASTER.md` từ `/ui-ux-pro-max` làm nguồn bộ tokens chính thức cho ứng dụng.

---

## Open Questions

Không có. (Tất cả câu hỏi đã được làm rõ và thống nhất).

---

## Proposed Changes

### Design System & Theme Engine

#### [NEW] [MASTER.md](file:///d:/Code%20Antinigaty/RUST/design-system/MASTER.md)
Source of Truth chứa đầy đủ bộ Design Tokens, Palette cho Dark/Light Mode, Typography (Inter/Roboto Mono), Micro-interactions và Checklist kiểm thử UI/UX.

#### [MODIFY] [DESIGN.md](file:///d:/Code%20Antinigaty/RUST/DESIGN.md)
Cập nhật tài liệu thiết kế gốc của dự án để phản ánh kiến trúc Dual Theme (CAD Dark & CAD Light).

#### [MODIFY] [index.css](file:///d:/Code%20Antinigaty/RUST/src/modules/design/index.css)
Cấu hình CSS Custom Variables cho cả 2 theme `[data-theme="dark"]` (Deep Charcoal `#0F1115`, Surface `#171B21`, Text `#E5E7EB`) và `[data-theme="light"]` (Clean Light `#F8FAFC`, Surface `#FFFFFF`, Text `#0F172A`, Accent `#059669`).

#### [NEW] [themeStore.ts](file:///d:/Code%20Antinigaty/RUST/src/modules/design/stores/themeStore.ts)
Tạo Zustand store quản lý state theme (`themeMode: 'light' | 'dark' | 'system'`, `resolvedTheme: 'light' | 'dark'`), tự động lắng nghe media query system preference, lưu vào `localStorage`, và set `data-theme` attribute trên `document.documentElement`.

---

### i18n & Vietnamese Encoding Fixes

#### [MODIFY] [index.ts](file:///d:/Code%20Antinigaty/RUST/src/modules/i18n/index.ts)
Bổ sung helper functions và type definitions giúp các component truy cập key an toàn.

#### [MODIFY] [common.json (vi)](file:///d:/Code%20Antinigaty/RUST/src/modules/i18n/locales/vi/common.json)
Bổ sung bộ từ vựng Tiếng Việt hoàn chỉnh cho: CAD Explorer, Toolbars, Contract Analysis, Material Manager, Reports, Theme Dialog, Error Boundary, Toast Notifications.

#### [MODIFY] [common.json (en)](file:///d:/Code%20Antinigaty/RUST/src/modules/i18n/locales/en/common.json)
Đồng bộ bộ từ vựng Tiếng Anh tương ứng.

#### [MODIFY] [LanguageSwitcher.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/ui/LanguageSwitcher.tsx)
Cập nhật UI chuyển đổi ngôn ngữ linh hoạt với tooltip hiển thị đa ngôn ngữ chuẩn xác.

#### [MODIFY] [TitleBar.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/ui/TitleBar.tsx) & Component UI chính
Tích hợp `useThemeStore` và `useTranslation()` vào TitleBar, Explorer, Toolbar và các Dialog chính để chuyển đổi theme và ngôn ngữ tức thì.

---

## Verification Plan

### Automated Tests
- Chạy `npm test` hoặc `npx vitest run` kiểm tra toàn bộ suite test hiện có.
- Chạy TypeScript check: `npx tsc --noEmit` đảm bảo không có lỗi type.

### Manual Verification
1. **Kiểm tra Theme Switching**:
   - Thao tác toggle Light/Dark Mode từ TitleBar/Settings.
   - Xác minh toàn bộ bề mặt UI (TitleBar, Sidebars, Canvas backdrop, Modals, Buttons) đổi màu sắc tương phản rõ ràng (contrast ratio >= 4.5:1).
   - F5 reload ứng dụng để xác nhận theme đã chọn được khôi phục từ `localStorage`.
2. **Kiểm tra Ngôn ngữ & Tiếng Việt**:
   - Chuyển đổi ngôn ngữ VI ↔ EN từ LanguageSwitcher.
   - Kiểm tra các màn hình: CAD Explorer, Hợp đồng, Vật tư, Báo cáo Word/PDF.
   - Đảm bảo các ký tự tiếng Việt có dấu (như: `đ, ê, ơ, ư, á, à, ả, tã, ạ...`) hiển thị đẹp, đúng utf-8, không bị lỗi font hay ký tự lạ (``).
