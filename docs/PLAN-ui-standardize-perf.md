# Chuẩn hóa UI chrome + Tối ưu hiệu năng render bản đồ — Audit & Kế hoạch

**Ngày:** 2026-08-06
**Phạm vi:** `src/modules/design` (UI chrome), `src/modules/design/features/map` (perf), `src/shared`, `App.css`
**Trạng thái:** Đề xuất, chờ duyệt. Chưa sửa dòng code nào.
**Nhánh đang đứng:** `Fix-error-Display-on-Map-and-Database` — có thay đổi chưa commit ở `coordinateCache.ts`, `mapLibreFastAdapter.ts`, `mapLibreFastAdapter.test.ts`, `docs/PLAN-map-clustering.md`. Không được ghi đè.

---

## 0. Tóm tắt cho người bận

Hai nhóm việc độc lập nhau, không phụ thuộc thứ tự:

**A. UI chrome chưa theo chuẩn.** Chuẩn đích đã có sẵn trong `design-system/MASTER.md` (tokens `--cad-*`, spacing 4px, chrome 40px, z-index `z-cad-*`). Vấn đề là code chưa tuân thủ: 233 `<button>` thô ngoài `Button.tsx` (48 file), ≥8 modal tự dựng shell `fixed inset-0 bg-black/60`, 176 hex thô trong `.tsx`, `App.css` (116 dòng boilerplate Vite chết) đang xung đột `prefers-color-scheme`.

**B. Render bản đồ bị nghẽn ở tầng trước khi chạm MapLibre.** `renderCollectionResult` build lại toàn bộ FeatureCollection mỗi lần vì dependency là `renderFeatureValues` (array mới mỗi render); adapter parse metadata + geometry **hai lần** cho cùng một feature; `featureListKey` hash toàn bộ feature mỗi render; điểm bị vẽ hai lần khi `overlayPoints` bật; `simplifyVectors` khai báo nhưng không thực thi.

Tin tốt: không cần phát minh chuẩn mới hay kiến trúc mới. Cả hai nhóm đều là *đưa code về đúng thứ đã có* — token/cache/LOD.

---

## 1. Bức tranh hiện trạng

### 1.1 Chrome UI

- `design-system/MASTER.md` (214 dòng) là SINGLE SOURCE OF TRUTH: màu `--cad-*` (cấm hex thô trừ 3 ngoại lệ: `dataColors.ts`, `printColors.ts`, `index.css`), spacing 4px (tối đa `p-6`), chrome title bar 40px / toolbar 40px / row 32px / compact 24px, z-index `z-cad-*` (1100–6000), typography `font-sans` / `font-mono`, quy tắc component (Button primitive, `cad-dialog`, `cad-icon-button` + aria-label).
- Primitive chuẩn: `components/ui/Button.tsx` — dùng `cn()` từ `@TOOL/utils/cn`.
- Lệch chuẩn điển hình: `components/ui/Toolbar.tsx`
  - `:28` dùng `h-14` (56px) thay vì `h-10` (40px) theo chuẩn chrome.
  - `:6-11` khai báo lại `cn()` cục bộ thay vì dùng `@TOOL/utils/cn`.
  - `:104` dùng `orange-400` (hex hardcode) thay vì token.
- Số liệu: 233 `<button>` thô ngoài `Button.tsx` / 48 file (chỉ 15 file dùng Button chung); ≥8 modal tự dựng shell `fixed inset-0 bg-black/60` (chưa có Modal primitive); 176 hex thô trong `.tsx` (152 ngoài test); 11 chỗ `hover:bg-white`, 5 chỗ `orange-400`; 5 file CSS riêng (+2 trùng trong `src/core/basemap`); `App.css` 116 dòng boilerplate Vite chết + xung đột `prefers-color-scheme`.
- Modal tự dựng phải sửa: `ThemeModal.tsx:491` (nên dùng `cad-overlay` + `cad-input`), ImageEditorModal, CameraViewPanel, StreetViewControl, FeatureEditor (`bg-white/10`).

### 1.2 Luồng render bản đồ (pipeline)

```
useDesignSync store
  → renderFeatureValues = Object.values(features | rawFeatures)   MapLibreFastRenderer.tsx:1274  (mảng mới mỗi render)
  → renderCacheKey                                                :1306
  → renderCollectionResult (useMemo)                              :1328-1360 (dep = renderFeatureValues)
  → effect render() → preparePointImages → renderFeaturesBatched
  → source.setData()                                              :2029-2200
```

- `ensureDesignLayers` chỉ chạy một lần (`:681`), sau đó chỉ `setData` (`:2143-2151`) — đúng hướng, phần chậm nằm ở chỗ dựng collection.

### 1.3 Top 5 điểm nghẽn perf

| # | Điểm nghẽn | Vị trí | Bản chất |
|---|---|---|---|
| 1 | Rebuild toàn bộ collection | `MapLibreFastRenderer.tsx:1328-1360` + `:1274-1277` | `renderCollectionResult` là useMemo phụ thuộc `renderFeatureValues` — mảng mới mỗi lần render ⇒ useMemo luôn chạy lại |
| 2 | Công việc trùng ×2 | `mapLibreFastAdapter.ts:446-468` | `canRenderFeature` rồi `toRenderFeatures` — mỗi hàm parse lại metadata + geometry |
| 3 | Hash toàn bộ feature mỗi render | `MapLibreFastRenderer.tsx:554-563` | `featureListKey` nối chuỗi toàn bộ feature để làm cache key |
| 4 | Điểm vẽ hai lần | `MapLibreFastRenderer` + `FeatureOverlayCanvas`/`PointRenderer` | khi `overlayPoints` bật, điểm được vẽ bằng MapLibre layer + overlay React |
| 5 | `simplifyVectors` không thực thi | `mapLibreFastAdapter.ts:143-168` | option có mặt nhưng không được dùng ⇒ không có LOD |

### 1.4 Phát hiện bổ sung

- `parseObject` không cache tại `styleValueOnMetadata` và `isMapIntersectionChild`.
- `coordinateCache.invalidate(id)` chưa được gọi khi sửa coordinates — cache đang cũ.
- Debounce truy vấn viewport sau `moveend` (`MapLibreFastRenderer.tsx:2007-1955`).

---

## 2. Kế hoạch — Nhánh A: Chuẩn hóa UI chrome

Nguyên tắc: quy về chuẩn đã có trong `MASTER.md`, không đặt chuẩn mới.

### A-P0 (rủi ro thấp, giá trị cao)

| Việc | File | Thay đổi |
|---|---|---|
| Tạo primitive `Modal/Dialog` dùng chung | `src/modules/design/components/ui/` (mới) | reuse `cad-overlay` + `cad-dialog` + `z-cad-modal`, kèm focus trap cơ bản + Esc đóng |
| Thay 8 shell modal tự dựng | ThemeModal, ImageEditorModal, CameraViewPanel, StreetViewControl, FeatureEditor, … | dùng primitive mới |
| Xóa `App.css` | root | 116 dòng boilerplate Vite chết + xung đột `prefers-color-scheme`; kiểm tra không mất style cần thiết |

### A-P1

| Việc | File | Thay đổi |
|---|---|---|
| Chuẩn chiều cao toolbar | `Toolbar.tsx:28` | `h-14` → `h-10` (40px theo chuẩn chrome) |
| Bỏ `cn()` cục bộ | `Toolbar.tsx:6-11` | import từ `@TOOL/utils/cn` |
| Thay `orange-400` | `Toolbar.tsx:104` | token `--cad-*` |
| Modal theme theo token | `ThemeModal.tsx:491` | `cad-overlay` + `cad-input` |
| Hex → token | `MapToolbar.css` | hardcode → token |

### A-P2

| Việc | File | Thay đổi |
|---|---|---|
| Dọn hex UI chrome | ImageEditorModal, CameraViewPanel, StreetViewControl, FeatureEditor (`bg-white/10`) | → token |
| Thay 11 chỗ `hover:bg-white` | khắp `.tsx` | → token |
| Di chuyển `cn()` | `src/modules/tool/utils` → `src/shared` | tránh module `tool` phụ thuộc ngược |

---

## 3. Kế hoạch — Nhánh B: Tối ưu hiệu năng render bản đồ

### B-P0 (giảm công việc trùng lặp)

| Việc | File | Thay đổi |
|---|---|---|
| Per-feature cache | `mapLibreFastAdapter.ts` `toRenderFeatures` | WeakMap khóa theo `id + mapRevision` — feature chưa đổi thì dùng lại `RenderFeature` đã dựng |
| Gộp `canRenderFeature` vào `toRenderFeatures` | `mapLibreFastAdapter.ts:446-468` | bỏ redo ×2; parse metadata + geometry một lần duy nhất |

### B-P1 (giảm rebuild)

| Việc | File | Thay đổi |
|---|---|---|
| Thay dep `renderFeatureValues` | `MapLibreFastRenderer.tsx:1328-1360` | dep theo per-feature key (id + version), không theo array identity |
| Cache `featureListKey` theo revision | `MapLibreFastRenderer.tsx:554-563` | không hash toàn bộ feature mỗi render |
| Thực thi `simplifyVectors` (LOD) | `mapLibreFastAdapter.ts:143-168` | bỏ qua đỉnh thừa theo zoom khi bật |
| Debounce viewport query | `MapLibreFastRenderer.tsx:2007-1955` | gộp truy vấn sau `moveend` |

### B-P2

| Việc | File | Thay đổi |
|---|---|---|
| Xử lý render kép điểm | `MapLibreFastRenderer` + `FeatureOverlayCanvas`/`PointRenderer` | khi `overlayPoints` bật, chỉ một đường vẽ điểm |
| Cache `parseObject` | `styleValueOnMetadata`, `isMapIntersectionChild` | dùng chung per-feature cache |
| `coordinateCache.invalidate(id)` khi sửa coordinates | nơi gọi sửa feature | tránh cache cũ |

---

## 4. Verification Plan (Kế hoạch kiểm thử)

### Automated Tests
1. Vitest map suite: `npx vitest run src/modules/design/features/map/mapLibreFastAdapter.test.ts src/modules/design/features/map/mapRenderMetrics.test.ts src/modules/design/features/map/useMapStyles.test.ts`
2. Typecheck: `npm run typecheck`
3. Lint: `npm run lint`

### Thủ công
- A: mở/tắt modal (theme, image editor, street view), kiểm tra focus + Esc + z-index; chuyển tab không mất camera.
- B: mở dự án lớn, đo thời gian `setData` / thời gian từ lúc đổi feature tới khi bản đồ cập nhật; kiểm tra điểm không bị đè khi `overlayPoints` bật.

---

## 5. Acceptance Criteria (Tiêu chí nghiệm thu)

- [ ] Không còn `<button>` thô trong `src/modules/design` ngoài primitive (`grep` đếm lại = 0 ngoài Button/icon-button).
- [ ] Không còn hex thô trong `.tsx` chrome (trừ 3 ngoại lệ đã ghi nhận trong MASTER.md).
- [ ] `App.css` đã xóa; theme dark/light không đổi theo `prefers-color-scheme` sai cách.
- [ ] Render feature: per-feature cache hit cao; thay đổi 1 feature không kéo rebuild toàn bộ collection.
- [ ] Không còn parse ×2 cho cùng một feature; `simplifyVectors` có hiệu lực.
- [ ] Điểm không bị vẽ hai lần khi `overlayPoints` bật.
- [ ] Tất cả unit test suite PASS 100%; typecheck + lint sạch.

---

## 6. Những chỗ cần bạn quyết

1. **Thứ tự triển khai**: làm Nhánh A (UI) hay Nhánh B (perf) trước? Không phụ thuộc nhau — A dễ nhìn kết quả, B có lợi lớn trên dự án to.
2. **Có triển khai ngay bây giờ không, hay dừng ở mức tài liệu này?** Phiên hiện chỉ khảo sát và lập kế hoạch, chưa sửa code.
3. **Modal primitive có chấp nhận focus trap + Esc mặc định không?** Có vài modal hiện tắt hành vi này.
4. **B-P1 debounce viewport**: chấp nhận độ trễ phản hồi nhỏ (~100-200ms) sau `moveend` khi đang kéo bản đồ?

---

## 7. Giới hạn của tài liệu này

Toàn bộ nội dung từ đọc code tĩnh + số liệu grep; chưa chạy ứng dụng hay đo trực tiếp thời gian render trong phiên khảo sát. Các con số thời gian cần được đo lại khi triển khai B-P0/B-P1.

Đề xuất: làm A-P0 + B-P0 trước (hai việc rủi ro thấp nhất, giá trị rõ nhất), kiểm chứng bằng tay rồi quyết có đi tiếp không.
