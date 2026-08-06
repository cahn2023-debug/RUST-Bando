# Chuẩn hóa giao diện bản đồ — Audit & Kế hoạch

**Ngày:** 2026-08-04
**Phạm vi:** `src/modules/design/features/map`, `src/modules/design/components/icons`, `src/modules/tool/utils/featureDisplay.ts`, `src/core/basemap`
**Trạng thái:** Đề xuất, chờ duyệt. Chưa sửa dòng code nào.

---

## 0. Tóm tắt cho người bận

Bốn việc bạn nêu — chuẩn hóa icon/đối tượng, zoom extend khi mở dự án, click chọn đối tượng, hiển thị polyline — hóa ra có chung một gốc: **hệ thống có nhiều nguồn sự thật song song cho cùng một quyết định hiển thị**, và chúng đã trôi khỏi nhau. Có ba bảng màu mặc định khác nhau, ba bộ phân tích tọa độ khác nhau, hai handler zoom cùng nghe một tín hiệu, và hai handler click cùng xử lý một cú nhấp chuột.

Điểm quan trọng nhất, và cũng là tin tốt: **chuẩn đích đã tồn tại sẵn**. `design-system/MASTER.md` §2 đã quy định `dataColors.ts` là nhà duy nhất cho màu bản đồ, §10 đã cấm hex thô trong `src/modules/design`. Vấn đề không phải là thiếu chuẩn mà là code chưa tuân thủ chuẩn đã có. Vì vậy kế hoạch dưới đây là *đưa code về đúng chuẩn sẵn có*, không phải phát minh chuẩn mới.

Ba lỗi thực sự ảnh hưởng người dùng, xếp theo mức độ chắc chắn:

| # | Triệu chứng | Nguyên nhân | Độ chắc chắn |
|---|---|---|---|
| 1 | Click vào đối tượng có thể bị bỏ chọn ngay lập tức | Hai handler click chạy nối tiếp trên cùng một event | Cao — nhưng cần xác nhận khi chạy (xem §3.1) |
| 2 | Icon và vòng tròn dưới nó khác màu trên cùng một điểm | Hai đường lấy màu với fallback khác nhau | Cao — đã đọc cả hai dòng |
| 3 | Zoom extend khi mở dự án nhảy hai lần / sai khung | Hai handler fit camera không phối hợp | Cao — đã đọc cả hai |

Và một điều tôi cần nói rõ: **giả thuyết hấp dẫn nhất về việc polyline không hiện đã bị bác bỏ**. Chi tiết ở §4.

---

## 1. Bức tranh hiện trạng

### 1.1 Đường đi của một đối tượng ra màn hình

```
FeatureState (store)
   → mapLibreFastAdapter.toRenderFeatures()    ← quyết định màu, cỡ, icon key
   → GeoJSON FeatureCollection
   → MapLibre source 'design-fast-features'
   → 9 layer (point, icon, label, line×3, polygon×2, cluster)
```

Song song, cây Drawing Explorer lấy icon qua `getFeatureDisplayInfo()` — cùng hàm mà adapter dùng, nên *khóa icon* thì nhất quán. Nhưng *cách vẽ* thì không: cây render component React, bản đồ render chuỗi SVG raster hóa. Cùng một feature ra hai hình thức khác nhau.

### 1.2 Các nguồn sự thật đang cạnh tranh

**Màu mặc định — ba giá trị cho cùng một câu hỏi:**

| Nơi định nghĩa | Giá trị | Ai dùng |
|---|---|---|
| `dataColors.ts:52` `GEOMETRY_COLORS.defaultFeature` | `#EF4444` đỏ | **Không ai** |
| `mapLibreFastAdapter.ts:19` `DEFAULT_COLOR` | `#10b981` xanh lá | Vòng tròn point, đường line |
| `featureDisplay.ts:295` fallback | `#6366f1` chàm | Bitmap icon |

`GEOMETRY_COLORS` tự mô tả là "the single home for colors that encode DATA MEANING" và được `MASTER.md` §2 chỉ định — nhưng không có consumer nào trong đường render. Nó là chuẩn trên giấy.

**Sinh SVG icon — ba bản:**

- `MapIcons.tsx:169` `getIconSvgString` — bản thật, bản đồ dùng.
- `CameraIcons.tsx:104` `getIconSvgString` — **trùng tên, khác output** (stroke-width 1 vs 0.75, style nhãn khác, không có tham số xoay). Không ai import. Code chết nhưng dễ gây nhầm khi tìm kiếm.
- `MapLibreFastRenderer.tsx:237-248` (trong `iconSvgForFeature`, bắt đầu dòng 233) — SVG intersection viết tay riêng, không gọi `getIntersectionSvgString`.

**Phân tích tọa độ — ba bộ với độ khoan dung khác nhau:**

| Bộ | Chấp nhận | Dùng ở |
|---|---|---|
| `mapLibreFastAdapter.normalizeLine` | mảng, `{lng,lat}`, `{x,y}`, chuỗi JSON, bọc `.points`/`.coordinates` | Render |
| `featureUtils.getLineCoordinates` | chỉ tuple số | ZoomToHandler |
| `ZoomExtendControl.tsx:76-96` (viết inline) | chỉ mảng, chuỗi JSON bắt đầu bằng `[` | Zoom extent |

Hệ quả cụ thể: **một polyline lưu dạng `[{lng,lat},…]` sẽ vẽ ra bình thường nhưng không zoom tới được, và không được tính vào khung zoom extent.** Đây là loại lỗi rất khó chẩn đoán vì đối tượng "nhìn thấy được" nên người dùng không nghi ngờ dữ liệu.

**Code chết mang danh nghĩa chuẩn:** `src/modules/design/mapIconManifest.ts` mở đầu bằng *"Nguồn icon DUY NHẤT cho Marker + Layer Tree + BOM Summary"* nhưng `MAP_ICON_MANIFEST` không có một importer nào. Tệ hơn, bộ khóa của nó (`pole`, `cabinet`, `splice`, `odf`, `splitter`) **không giao** với bộ khóa bản đồ thật sự hỗ trợ (`cctv`, `ptz`, `speed`, `lpr`, `intersection`, `point_circle`, `default`), và màu của nó dùng `var(--cad-obj-*)` — CSS variable mà MapLibre paint property về nguyên tắc không đọc được. File này không phải "chuẩn chưa áp dụng"; nó là chuẩn *không thể* áp dụng như đang viết.

---

## 2. Zoom extent khi mở dự án

### 2.1 Hai handler cùng fit, không biết nhau

Khi mở dự án, có hai đường độc lập cùng đặt camera:

| Đường | Nguồn khung | Padding | maxZoom | Thời lượng |
|---|---|---|---|---|
| `MapLibreFastRenderer.tsx:1836-1851` | `state.initialBounds` từ bootstrap | 72 | 18 | 0 |
| `ZoomExtendControl.tsx:29-121` | tính từ tọa độ feature | 50 | 18 | mặc định |

Không có cơ chế phân xử. Cái nào chạy sau thì thắng, và vì cái thứ hai nằm trong `requestAnimationFrame` nên thường thắng — nhưng chỉ khi feature đã về kịp. Người dùng thấy camera nhảy hai nhịp, hoặc dừng ở khung không mong muốn tùy vào độ trễ mạng.

### 2.2 Vòng luẩn quẩn trên dự án lớn

`ZoomExtendControl.tsx:38`:

```ts
const features = state.isLargeProject ? visibleFeatures : state.features;
```

Với dự án lớn, `visibleFeatures` là các feature **đang nằm trong khung nhìn hiện tại**. Nhưng khung nhìn hiện tại lúc mới mở chính là cái ta đang muốn sửa. Nói cách khác: zoom extent fit theo những gì đang thấy, mà những gì đang thấy lại do camera mặc định quyết định. Nó không bao giờ mở rộng ra tới dữ liệu nằm ngoài khung ban đầu.

Camera mặc định đó là `CADCanvas.tsx:13`: `INITIAL_CENTER = [21.0285, 105.8542]` (Hà Nội) với `zoom={13}`, áp cho mọi dự án bất kể dữ liệu ở đâu. Một dự án ở Cần Thơ sẽ mở ra giữa Hà Nội, thấy 0 feature, và zoom extent không có gì để fit.

### 2.3 Zoom extent chạy lại mỗi lần vào tab

`CADCanvas.tsx:28-31` gọi `triggerZoomExtend()` trong `useEffect` mount. Mỗi lần chuyển sang tab Design, camera bị kéo về khung tổng thể, xóa vị trí người dùng đang xem. Đây là hành vi gây khó chịu rõ rệt khi làm việc qua lại giữa các tab.

### 2.4 `zoomToTrigger` bị xử lý hai lần

`ZoomToHandler.tsx` và `MapLibreFastRenderer.tsx:2137-2156` cùng nghe `zoomToTrigger`. Bản trong renderer:

- **Không có guard chống lặp.** Dependency array là `[featureDetailsCache, features, mapState, zoomToTrigger]`, nên mỗi lần kết quả truy vấn viewport về là nó bắn lại camera, miễn `zoomToTrigger` còn khác `null`.
- **Bỏ qua trường `type`.** Nó tra id trong feature rồi rơi thẳng xuống `zoomToTrigger.location`. Một trigger `type: 'layer'` có id trùng với một feature sẽ zoom vào đúng feature đó thay vì cả layer.
- Tham số khác bản kia: padding 80 vs 50, maxZoom 20 vs 18.

Thêm nữa, `zoomToTrigger` **không bao giờ được xóa về `null`** ngoài lúc `initialize()`, và không nằm trong `reset()`. Kết hợp với việc không có guard, đây là cơ chế gây ra hiện tượng camera tự nhảy về chỗ cũ.

### 2.5 Nhánh layer/region/group im lặng không làm gì

`ZoomToHandler.tsx:114, 130, 147` chỉ đọc `stateFeatures` (tức `state.features`). Trên dự án lớn `state.features` là `{}`. Có một guard `shouldDeferContainerZoom` ở dòng 31-37 chặn trường hợp này nên nó *return sớm* thay vì fit sai — nhưng kết quả với người dùng vẫn là "bấm zoom vào layer, không có gì xảy ra".

### 2.6 `BasemapRuntime.fitBounds` — API đúng, không ai gọi

`src/core/basemap/BasemapRuntime.ts:147-155` có sẵn một API camera sạch sẽ. Không một call site nào trong `src/modules/design`. Tầng trừu tượng đã được xây rồi bị bỏ qua.

---

## 3. Click vào đối tượng

### 3.1 Hai handler trên cùng một cú click — đã kiểm chứng

Đây là phát hiện tôi tin cậy nhất, vì đã đọc cả hai phía và cả cơ chế dispatch của MapLibre.

`MapLibreFastRenderer.tsx:1632` đăng ký click **theo layer** → gọi `selectFeature(id, …)`.
`MapLibreBoxSelection.tsx:154-165` đăng ký click **toàn bản đồ** → gọi `selectFeature(null)`.

Ba điều kiện khiến chúng xung đột:

1. **Thứ tự đăng ký.** Renderer đăng ký handler của mình *trước* khi gọi `setMap(map)` ở dòng 1770. `MapLibreBoxSelection` chỉ chạy `useEffect` sau khi nhận được `map` từ context — tức luôn đăng ký sau. MapLibre gọi listener theo thứ tự đăng ký, nên trình tự luôn là `selectFeature(id)` rồi `selectFeature(null)`.

2. **Không có `preventDefault()`.** MapLibre v5 mutate event gốc để `preventDefault` hoạt động xuyên qua delegated listener (`maplibre-gl-dev.js:72138-72141`, có hẳn comment giải thích). Cơ chế này *có sẵn và đúng* — nhưng handler ở dòng 1632 không dùng. Nên `e.defaultPrevented` ở dòng 160 luôn `false`.

3. **Guard 500ms vô hiệu.** `lastSelectionTime.current` chỉ được cập nhật ở dòng 95, trong nhánh kết thúc kéo hộp chọn. Với click thường nó vẫn là `0`, nên `Date.now() - 0 > 500` luôn đúng.

Ba điều kiện đều thỏa. Sửa rất nhỏ: gọi `event.preventDefault()` trong handler ở dòng 1632. Một dòng.

Một lưu ý về độ chắc chắn: `useEffect` của `MapLibreBoxSelection` có dependency `[map, selectFeature, setBoxSelection, state]` (dòng 179), tức nó **đăng ký lại mỗi khi `state` đổi**. Việc đăng ký lại này về nguyên tắc có thể làm thay đổi thứ tự tương đối giữa hai handler theo cách đọc code tĩnh không kết luận được. Điều kiện (2) và (3) thì không phụ thuộc thứ tự và chắc chắn đúng — nên bản vá `preventDefault()` vẫn đúng hướng dù thứ tự ra sao.

Vẫn nên xác nhận bằng tay trước khi sửa (click một đối tượng, xem panel thông số có mở rồi đóng ngay không), vì nếu selection hiện đang hoạt động bình thường thì có yếu tố nào đó tôi chưa thấy, và tôi muốn hiểu nó trước khi thay đổi.

### 3.2 Chọn một polyline là khóa luôn camera

`selectionSlice.ts:54`:

```ts
editingFeatureId: isVector ? id : null,
```

Chọn LINESTRING/POLYLINE/POLYGON là lập tức vào chế độ sửa đỉnh, và `MapLibreFastRenderer.tsx:1813` tắt pan/zoom khi có `editingFeatureId`. Hệ quả: **click một lần vào polyline để xem thông tin thì mất luôn khả năng di chuyển bản đồ.** Đây là quyết định thiết kế đáng bàn lại — xem/chọn và sửa nên là hai mức tương tác khác nhau.

### 3.3 Phân loại đường: chặt một nơi, lỏng một nơi

`selectionSlice.ts:44` nhận đúng ba chuỗi: `LINESTRING`, `POLYLINE`, `POLYGON`.
`mapLibreFastAdapter.isLineGeomType` (dòng 107-136) nhận cả chục biến thể: `line`, `signalline`, `networklink`, và dò chuỗi con `cable`/`tuyen`/`route`/`network`, cuối cùng còn thử "parse ra ≥2 điểm được không".

Một feature được vẽ như đường qua đường lỏng sẽ **không** vào chế độ sửa đỉnh khi chọn. Vẽ thì thấy đường, sửa thì không sửa được.

### 3.4 Panel đọc sai nguồn trên dự án lớn

`PaletteSystem.tsx:81` và `CameraViewPanel.tsx:56` chỉ đọc `state.features[id]`, vốn là `{}` trên dự án lớn. Đã có helper chuẩn `featureLookup.getRenderableFeatureById` (tra lần lượt `state.features` → `featureDetailsCache` → `visibleFeatures`), và `TechnicalSpecsPanel.tsx:36-39` tra đúng ba tầng đó (viết inline chứ không gọi helper). Hai panel kia thì không → hiển thị rỗng.

---

## 4. Polyline — và một giả thuyết bị bác bỏ

### 4.1 Điều tôi cần nói rõ

Trong quá trình khảo sát, ứng viên số một cho triệu chứng "polyline không hiện" là dòng `MapLibreFastRenderer.tsx:775`:

```js
'line-dasharray': ['case', ['has','dashArray'], ['get','dashArray'], ['literal',[1,0]]],
```

Lập luận: `line-dasharray` là `cross-faded-data-driven` với `interpolated: false`, nên expression theo feature có thể bị từ chối, khiến cả `LINE_LAYER_ID` không được thêm và đường biến mất.

**Tôi đã kiểm tra và lập luận này sai.** Hai bằng chứng ngược:

1. Style-spec đi kèm dự án (`@maplibre/maplibre-gl-style-spec/dist/index.cjs:2165-2171`) khai báo `expression: { interpolated: false, parameters: ["zoom", "feature"] }`. Có `"feature"` trong danh sách tham số nghĩa là expression theo feature **được phép**.
2. `[1, 0]` không phá renderer. `LineAtlas.addDash` (`maplibre-gl-dev.js:46900-46920`) chỉ bỏ qua khi tổng độ dài bằng 0; với `[1,0]` tổng là 1, và `getDashRanges` xử lý đoạn `zeroLength` một cách tường minh. Kết quả là nét liền — đúng ý định.

Dự án dùng maplibre-gl 5.24.0, khớp với style-spec đã kiểm tra. Nên **đừng đuổi theo hướng này.** Tôi ghi lại đây để không ai mất thời gian lặp lại.

### 4.2 Vậy nếu polyline không hiện thì tìm ở đâu

Xếp theo thứ tự nên kiểm tra:

1. **Tọa độ không parse được.** `normalizeLine` trả `null` nếu không đủ 2 điểm hợp lệ; khi đó `toRenderFeatures` bỏ qua feature và log `[mapLibreFastAdapter] Skipped invalid geometry`. **Mở DevTools console và tìm cảnh báo này trước tiên** — nó chỉ thẳng ra id feature có vấn đề.
2. **Phân loại sai.** Nếu `isLineGeomType` không nhận ra, geometry có thể bị dựng thành Point/Polygon và rơi khỏi `LINE_GEOMETRY_FILTER`.
3. **Nhóm/layer bị ẩn**, hoặc nằm trong `mapHiddenIds`.
4. **Ngoài khung nhìn** — liên quan trực tiếp tới lỗi zoom extent ở §2.2.

Điều tôi *không* thể làm trong phiên này là chạy ứng dụng để quan sát. Môi trường Linux của phiên không khởi động được (lỗi VHDX), nên không chạy được `npm run typecheck`, `lint`, hay test. **Mọi kết luận ở đây đến từ đọc code tĩnh.** Nếu bạn mô tả cụ thể hơn triệu chứng polyline đang gặp — mất hẳn, hay hiện sai màu, hay chỉ mất ở mức zoom nào đó — tôi sẽ khoanh vùng nhanh hơn nhiều.

### 4.3 Vấn đề polyline chắc chắn có thật

Không phụ thuộc vào triệu chứng trên, ba điểm sau đã xác nhận:

- **Polyline dạng object không zoom tới được** (§1.2) — vẽ được nhưng ba bộ parser bất đồng.
- **Nhãn của đường đặt sai chỗ.** `LABEL_LAYER_ID` (dòng 935-953) không có filter theo geometry, nhưng `text-offset: [0, 1.15]` và `text-anchor: 'top'` được tinh chỉnh cho điểm. `symbol-placement` không đặt nên mặc định `'point'` → nhãn đường nằm ở trọng tâm thay vì chạy dọc theo đường. Với `'line'` thì nhãn sẽ bám theo tuyến, hợp lý hơn nhiều cho hạ tầng tuyến.
- **Hai cơ chế tô màu chọn chồng nhau.** `toRenderFeatures:317` thay `color` bằng `SELECTED_COLOR`, đồng thời paint expression cũng đọc `feature-state.selected`. Cơ chế thứ nhất buộc dựng lại toàn bộ geometry và gọi `setData` — tốn kém, trong khi `feature-state` vốn sinh ra để tránh đúng việc đó.

---

## 5. Nhãn và cỡ — các con số rời rạc

Ba layer chữ, ba bộ giá trị:

| Layer | Màu chữ | Halo | Va chạm |
|---|---|---|---|
| `LABEL_LAYER_ID` | `#f8fafc` | `#0f172a` / 1.2 | có |
| `POINT_LABEL_LAYER_ID` | `#ffffff` | `#0f172a` / 1 | tắt |
| Cluster count | `#ecfeff` | `#0f172a` / 1 | tắt |

Không layer nào đặt `text-font`, và `maplibre-styles.json` không có `glyphs`. Chữ phụ thuộc hoàn toàn vào glyph source của style đang chạy — cần xác nhận với style thật, vì nếu thiếu thì nhãn sẽ không hiện.

Với điểm **có icon**, số thứ tự không phải layer chữ mà được nướng thẳng vào SVG (`MapIcons.tsx:178-185`, Arial 900, offset dọc 14.5/18.5/16.5 tùy loại). Vậy nên cùng là "số thứ tự" nhưng điểm có icon và điểm không icon dùng font khác nhau, và chỉ nhãn tên mới tham gia chống chồng lấn.

Các hằng số chưa có lý do:

- `circle-radius` chia `2.15` khi không chọn, chia `2` khi chọn (dòng 879, trong block bắt đầu 876). Con số 2.15 không có giải thích, và làm điểm có icon nhỏ hơn icon của chính nó một chút.
- Camera và intersection nhân cỡ `1.5` (adapter dòng 351-353) nhưng **chỉ cho `displaySize`**, còn `size` giữ nguyên → hai thuộc tính cùng mô tả một feature nhưng lệch nhau.
- `ThemeModal` cho chỉnh cỡ 1-100, mặc định 32; `asSize()` mặc định 8. Nhóm để mặc định 32 sẽ sinh bitmap camera `floor(32×1.5) = 48px`.

Vì `icon-size` cố định bằng 1, **toàn bộ tỉ lệ được nướng vào bitmap**, và `displaySize` là một phần của image id. Mỗi cỡ khác nhau là một ảnh riêng trong cache 256 chỗ. Đây là rủi ro hiệu năng thật khi người dùng chỉnh cỡ theo nhóm.

---

## 6. Kế hoạch

Nguyên tắc xuyên suốt: **quy về chuẩn đã có trong `MASTER.md`, không đặt chuẩn mới.** Mỗi phase độc lập, có thể dừng lại sau bất kỳ phase nào.

### Phase 1 — Sửa lỗi thấy được ngay (rủi ro thấp, giá trị cao)

| Việc | File | Thay đổi |
|---|---|---|
| Chặn tự bỏ chọn | `MapLibreFastRenderer.tsx:1632` | thêm `event.preventDefault()` |
| Bỏ handler zoom trùng | `MapLibreFastRenderer.tsx:2137-2156` | xóa, để `ZoomToHandler` lo |
| Xóa trigger sau khi dùng | `ZoomToHandler.tsx`, `uiControlSlice.ts` | set `zoomToTrigger = null`, thêm vào `reset()` |
| Bỏ zoom lại mỗi lần vào tab | `CADCanvas.tsx:28-31` | chỉ chạy khi đổi dự án |
| Panel đọc đúng nguồn | `PaletteSystem.tsx:81`, `CameraViewPanel.tsx:56` | dùng `getRenderableFeatureById` |

Kiểm chứng: click chọn giữ nguyên; chuyển tab không mất vị trí camera; panel hiện đủ dữ liệu trên dự án lớn.

### Phase 2 — Một nguồn cho tọa độ

Gộp ba parser thành một, lấy `normalizeLine` của adapter (khoan dung nhất) làm gốc, đặt cạnh nó trong `mapLibreFastAdapter.ts` hoặc tách ra `featureGeometry.ts`. `ZoomExtendControl` và `ZoomToHandler` cùng gọi.

Đây là phase sửa dứt điểm "vẽ được nhưng không zoom tới được". Cũng nên thêm test cho các dạng tọa độ: tuple, `{lng,lat}`, `{x,y}`, chuỗi JSON, bọc `.points`.

### Phase 3 — Một nguồn cho màu và icon

1. Đưa `GEOMETRY_COLORS` vào dùng thật; xóa `DEFAULT_COLOR`/`SELECTED_COLOR` cục bộ và các hex lặp ở renderer (dòng 828, 855).
2. **Quyết định màu mặc định cho điểm** — hiện có ba ứng viên. Đề xuất lấy `#6366f1` (chàm) vì đó là màu người dùng đang thực sự thấy trên icon, tức đổi ít nhất về mặt thị giác. Cần bạn xác nhận.
3. Sửa để icon và vòng tròn cùng đọc một biến màu.
4. Xóa `mapIconManifest.ts` và `CameraIcons.getIconSvgString` (code chết). Nếu muốn giữ ý tưởng manifest, viết lại với bộ khóa thật và màu hex — nhưng nên là việc riêng.
5. Cho renderer gọi `getIntersectionSvgString` thay vì SVG viết tay.

Rủi ro cao nhất nằm ở đây vì diện rộng. Bù lại `MASTER.md` §10 có ESLint chặn hex thô, nên sau khi gộp xong sẽ khó trôi lại.

### Phase 4 — Zoom extent đúng nghĩa

1. Chọn **một** đường fit khi mở dự án. Đề xuất giữ `initialBounds` từ bootstrap (nhanh hơn, không phụ thuộc feature đã tải) và để `ZoomExtendControl` chỉ phục vụ nút bấm tay.
2. Với dự án lớn, fit theo **bbox toàn dự án từ backend**, không theo `visibleFeatures` — phá vòng luẩn quẩn ở §2.2.
3. Bỏ `INITIAL_CENTER` cứng, hoặc chỉ dùng khi dự án thật sự không có dữ liệu.
4. Cho nhánh layer/region/group đọc cả `visibleFeatures` và bbox.
5. Cân nhắc dồn mọi thao tác camera qua `BasemapRuntime.fitBounds`.

Cần xác nhận: backend có trả bbox toàn dự án không? Nếu chưa thì mục 2 phải làm ở tầng Rust trước.

### Phase 5 — Nhãn và cỡ

Thống nhất màu chữ/halo ba layer; đặt `text-font` tường minh và xác nhận glyph source; cho nhãn đường dùng `symbol-placement: 'line'`; ghi rõ lý do hoặc bỏ hằng `2.15`; đồng bộ `size` với `displaySize`.

### Phase 6 — Chốt lại

`npm run typecheck && npm run lint && npm run test:ci`, kiểm tra cả light lẫn dark mode theo §10, và đối chiếu ảnh trước/sau trên một dự án thật có đủ điểm, đường, vùng.

---

## 7. Những chỗ tôi cần bạn quyết

1. **Màu mặc định cho điểm** — `#EF4444` (theo `GEOMETRY_COLORS`), `#10b981` (theo adapter), hay `#6366f1` (theo cái đang thấy)? Tôi nghiêng về `#6366f1`.
2. **Chọn polyline có nên vào thẳng chế độ sửa đỉnh không?** Hiện tại có, và nó khóa pan/zoom. Tôi nghĩ nên tách: click là chọn, double-click hoặc nút riêng mới vào sửa.
3. **Backend đã có bbox toàn dự án chưa?** Quyết định Phase 4 phụ thuộc điều này.
4. **Triệu chứng polyline cụ thể** bạn đang gặp là gì? Mô tả càng cụ thể càng rút ngắn được §4.2.

---

## 8. Giới hạn của tài liệu này

Môi trường Linux của phiên không khởi động được nên **tôi không chạy được typecheck, lint, test, hay bản thân ứng dụng**. Toàn bộ nội dung trên đến từ đọc code tĩnh cùng với style-spec và mã nguồn maplibre-gl trong `node_modules`.

Cụ thể, những điều tôi **đã xác minh trực tiếp**: thứ tự đăng ký hai handler click; `line-dasharray` chấp nhận expression theo feature; `[1,0]` cho ra nét liền; `MAP_ICON_MANIFEST`, `GEOMETRY_COLORS`, `CameraIcons.getIconSvgString` không có consumer; hai đường lấy màu khác fallback; `MASTER.md` §2/§10 quy định chuẩn màu.

Những điều **suy luận từ code, chưa quan sát khi chạy**: click có thực sự bị hủy chọn trên máy bạn không; polyline có đang mất thật không và mất vì lý do gì; nhãn có hiện không (phụ thuộc glyph source).

Đề xuất: làm Phase 1 trước, kiểm chứng bằng tay, rồi hãy quyết có đi tiếp không.
