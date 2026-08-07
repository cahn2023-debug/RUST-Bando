# Kế hoạch Sol-Advisor Architect: Standardize Native Window UI & AutoCAD App Menu

> **Task Slug**: `standardize-native-window-ui`
> **Kế hoạch 5 Phần Sol-Advisor**

---

## 1. Goal & Scope (Mục tiêu & Phạm vi)

### Mục tiêu
Chuẩn hóa toàn bộ giao diện phần mềm để phản hồi như một ứng dụng Native Windows Desktop chuyên nghiệp (tương tự AutoCAD / Revit / Microsoft Office):
- Tích hợp **AutoCAD-style Application Menu Dropdown** màu đỏ ở góc trái top toolbar.
- Tích hợp **Hệ thống phím tắt Alt Keytips** hiển thị badge phím nóng (`[F]`, `[1]`, `[2]`, `[H]`, `[D]`, `[A]`) khi nhấn phím `Alt`.
- **Đồng bộ màu sắc Native Windows Titlebar** linh hoạt theo Dark Mode / Light Mode.
- Đảm bảo thanh tiêu đề OS cập nhật tên dự án và trạng thái lưu realtime.

### Phạm vi tác động
- `src/modules/design/components/ui/AppMenu.tsx` [NEW]
- `src/modules/design/hooks/useKeytips.ts` [NEW]
- `src/modules/design/components/ui/KeytipBadge.tsx` [NEW]
- `src/modules/design/components/ui/TopToolbar.tsx` [MODIFY]
- `src/modules/design/components/ui/Ribbon.tsx` [MODIFY]
- `src/modules/home/App.tsx` [MODIFY]
- `src/modules/design/stores/themeStore.ts` [MODIFY]

---

## 2. Component Boundaries & API Contracts

### 2.1 `AppMenu.tsx` (Component Menu AutoCAD 2 Cột)
- **Props**:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `onSave: () => void`
  - `onForceSave?: () => void`
  - `onOpenProject?: (path: string) => void`
  - `onNewProject?: () => void`
  - `onOpenSettings?: () => void`
- **Output**: Menu dropdown nổi (fixed position, z-index cao) phủ 2 cột với animation mượt mà.

### 2.2 `useKeytips.ts` (Hook Quản lý phím Alt)
- **State**: `showKeytips: boolean`, `activeSection: 'ROOT' | 'MENU' | 'RIBBON'`
- **Listeners**: Lắng nghe phím `Alt`, `Escape` và các phím tắt kết hợp.

### 2.3 `KeytipBadge.tsx` (Hiển thị nhãn phím nóng)
- **Props**: `label: string`, `visible: boolean`, `position?: 'top' | 'bottom' | 'center'`
- **Design**: Badge màu vàng kim nổi bật (`bg-amber-400 text-black font-extrabold text-[10px] px-1 rounded shadow-md`).

---

## 3. Implementation Steps (Thứ tự triển khai Terra Lane)

- [ ] **Bước 1**: Tạo `useKeytips.ts` & `KeytipBadge.tsx` để hỗ trợ cơ chế bấm phím `Alt`.
- [ ] **Bước 2**: Tạo `AppMenu.tsx` phong cách AutoCAD 2 cột với nút 'P' trigger màu đỏ.
- [ ] **Bước 3**: Cập nhật `TopToolbar.tsx` để nhúng nút 'P' Red Logo, trigger `AppMenu`, và các Keytip Badges cho Quick Access tools.
- [ ] **Bước 4**: Cập nhật `Ribbon.tsx` để nhúng Keytip Badges trên các thẻ Tab (`[H]` Home, `[D]` Design, `[A]` Admin) và bổ sung phím tắt chuyển tab.
- [ ] **Bước 5**: Tích hợp `AppMenu` và `useKeytips` vào `App.tsx`, bổ sung hiệu ứng đồng bộ Native Windows Titlebar Theme trong `themeStore.ts`.

---

## 4. Verification Plan (Danh mục kiểm thử bắt buộc)

### 4.1 Automated Verification Commands
```bash
npm run typecheck
npm test
```

### 4.2 Manual Verification Checklist
1. **App Menu AutoCAD**: Click nút 'P' đỏ hoặc ấn `Alt+F` -> Cửa sổ Menu AutoCAD 2 cột hiển thị.
2. **Alt Keytips**: Ấn phím `Alt` -> Các nhãn màu vàng `[F]`, `[1]`, `[2]`, `[3]`, `[H]`, `[D]` xuất hiện lập tức.
3. **Chuyển Tab / Thao tác qua Keytips**: Ấn `H` khi Keytip bật -> Chuyển sang Tab Home; Ấn `D` -> Chuyển sang Tab Design.
4. **Theme Sync**: Thay đổi Dark/Light theme -> Cửa sổ phản hồi chuẩn màu sắc.

---

## 5. Acceptance Criteria (Tiêu chuẩn nghiệm thu)

- [ ] Không rò rỉ hay đè phím nóng hệ thống (`Ctrl+S`, `Ctrl+Z`, `Ctrl+C`, `Ctrl+V`).
- [ ] Phím `Alt` đóng/mở Keytips nhạy, mượt, bấm `Esc` thoát khỏi trạng thái Keytips.
- [ ] App Menu giao diện chuẩn AutoCAD, sắc nét, hoạt động ổn định trên cả Tauri Desktop và Web preview.
- [ ] Không có lỗi linting hay TypeScript type errors (`npm run typecheck` đạt 0 lỗi).
