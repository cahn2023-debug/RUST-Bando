# AUDIT REPORT — PHASE 0 DESIGN SYSTEM BASELINE

**Ngày thực hiện:** 2026-08-02
**Dự án:** RUST CAD & GIS Network Product (V1.2.0)

---

## 1. Kết Quả Rà Soát Kích Thước Layout (Left Dock)

- **Hiện trạng:** `useLayoutStore.ts` đặt mặc định `leftWidth: 260px`, `App.workspace.test.tsx` đặt `280px`. Một số modal và dialog dùng biến thiên `w-64` / `w-80`.
- **Yêu cầu chuẩn hóa:** 
  - Đưa `leftWidth` trong `useLayoutStore.ts` về mặc định **288px (`w-72`)** đúng theo quy chuẩn Section 4 của `DESIGN_SYSTEM_CHUAN_HOA_HOAN_THIEN.md`.
  - Giữ lại khả năng resize bằng `ResizeHandle` trong dải [200px - 600px].

---

## 2. Kết Quả Rà Soát Token Màu Sắc

- **Hiện trạng:** `src/modules/design/index.css` hiện có các token cơ bản (`--cad-accent`, `--cad-bg`, `--cad-surface`, `--cad-border`, `--cad-warn`, `--cad-danger`).
- **Thiếu sót cần bổ sung:**
  1. **State Colors:** Thiếu `--cad-state-selected`, `--cad-state-drawing`, `--cad-state-boxselect`, `--cad-state-locked`, `--cad-state-disabled`.
  2. **Object Type Colors:** Thiếu `--cad-obj-pole`, `--cad-obj-cabinet`, `--cad-obj-splice`, `--cad-obj-odf`, `--cad-obj-splitter`, `--cad-obj-camera`, `--cad-obj-node`.
  3. **Cable FO Sequential Colors:** Thiếu `--cad-cable-12`, `--cad-cable-24`, `--cad-cable-48`, `--cad-cable-96`, `--cad-cable-144`, `--cad-cable-288`.
  4. **Polygon Zone Colors:** Thiếu `--cad-zone-parcel`, `--cad-zone-station`, `--cad-zone-planned`.
  5. **Scale Tokens:** Thiếu token kích thước Icon (`--icon-sm/md/lg/xl`) và Button (`--btn-sm/md/lg`).

---

## 3. Kết Quả Rà Soát Hệ Thống Icon & Manifest

- **Thư viện:** `lucide-react` (v0.575.0) đã có trong `package.json`.
- **Thiếu sót:**
  1. Chưa có file manifest tập trung `src/modules/design/mapIconManifest.ts` để kết nối vật tư bản đồ với Lucide Icons và màu sắc.
  2. Chưa có Custom Component cho các icon vật tư kỹ thuật tự vẽ (`Cabinet` tủ cáp và `Splice` măng xông) tuân thủ Specsheet `24x24 / 1.75px stroke`.

---

## 4. Hành Động Tiếp Theo (Phase 1 → Phase 5)

1. **Phase 1**: Cập nhật `src/modules/design/index.css` định nghĩa toàn bộ token màu & scale.
2. **Phase 2**: Tạo `mapIconManifest.ts` và `CustomIcons.tsx`.
3. **Phase 3**: Cập nhật `useLayoutStore.ts` (`leftWidth: 288`) và refactor các UI Chrome / Toolbar components.
4. **Phase 4 & 5**: Kiểm thử QA 2 theme và xuất file `STYLE_GUIDE.md`.
