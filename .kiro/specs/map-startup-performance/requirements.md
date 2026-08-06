# Requirements Document

## Introduction

Tính năng này tối ưu hóa hiệu năng khởi động bản đồ trong ứng dụng quản lý dự án địa lý. Hiện tại, người dùng phải chờ tới **24.6 giây** từ lúc click mở project cho đến khi đối tượng đầu tiên xuất hiện trên bản đồ (`first-feature`). Nguyên nhân gốc rễ bao gồm chuỗi IPC tuần tự trong quá trình bootstrap project, xử lý đồng bộ trên main thread trong RAF callback (~84ms/frame), và JSON.parse lặp lại trên 2887+ features trong mỗi animation frame.

Mục tiêu: rút ngắn thời gian từ click mở project đến `first-feature` xuống dưới **2000ms**, và đảm bảo mỗi RAF frame hoàn thành trong dưới **16ms** để đạt 60fps ổn định.

---

## Glossary

- **MapStartupSystem**: Hệ thống quản lý toàn bộ vòng đời khởi động bản đồ, bao gồm telemetry, điều phối IPC và render pipeline.
- **ProjectBootstrapService**: Dịch vụ Rust phía backend chịu trách nhiệm mở file `.pmp`, parse schema, build feature index và tính toán bounds của project.
- **RenderPipeline**: Pipeline xử lý phía frontend bao gồm `MapLibreFastRenderer`, `mapLibreFastAdapter`, và các layer components.
- **FeatureCollection**: Tập hợp GeoJSON chứa toàn bộ đối tượng địa lý của một project.
- **ProgressiveLoader**: Module chịu trách nhiệm tải và render dữ liệu theo từng batch thay vì toàn bộ cùng lúc.
- **CoordinateCache**: Bộ nhớ đệm lưu trữ kết quả parse tọa độ đã được xử lý để tránh parse lại.
- **RAFScheduler**: Trình điều phối các tác vụ trong `requestAnimationFrame` callback để đảm bảo mỗi frame không vượt quá 16ms.
- **StoreSelector**: Một hàm selector đọc dữ liệu từ Zustand store; mỗi selector tạo một subscription riêng.
- **first-feature milestone**: Mốc telemetry được ghi nhận khi đối tượng địa lý đầu tiên xuất hiện trên bản đồ sau khi project được mở.
- **project-bind-start milestone**: Mốc telemetry được ghi nhận khi `MapLibreFastRenderer` nhận được `contextMap` và bắt đầu bind dữ liệu project.
- **Telemetry**: Hệ thống đo lường và ghi nhận thời gian các mốc quan trọng trong quá trình khởi động bản đồ (được implement trong `mapStartupTelemetry.ts`).
- **IPC**: Inter-Process Communication — cơ chế giao tiếp giữa frontend (TypeScript) và backend (Rust) thông qua Tauri `invoke`.
- **Bootstrap Shell**: Trạng thái ban đầu của store sau khi load metadata cơ bản (~210ms), trước khi load đầy đủ features.

---

## Requirements

### Requirement 1: Giảm thời gian từ click mở project đến hiển thị đối tượng đầu tiên

**User Story:** Với tư cách là người dùng, tôi muốn bản đồ hiển thị đối tượng địa lý ngay sau khi tôi click mở project, để tôi không phải chờ đợi lâu và có thể làm việc gần như ngay lập tức.

#### Acceptance Criteria

1. WHEN người dùng click mở một project, THE MapStartupSystem SHALL đạt mốc `first-feature` trong vòng 2000ms tính từ thời điểm click.
2. WHEN người dùng click mở một project có từ 1000 đến 5000 features, THE MapStartupSystem SHALL hiển thị ít nhất batch đầu tiên gồm tối thiểu 100 features trong vòng 2000ms.
3. WHEN mốc `first-feature` được ghi nhận, THE Telemetry SHALL ghi log thời gian tuyệt đối tính từ thời điểm bắt đầu mở project.
4. WHILE ProjectBootstrapService đang xử lý file project, THE MapStartupSystem SHALL hiển thị trạng thái loading với tiến độ phần trăm ước tính cho người dùng.
5. IF ProjectBootstrapService không trả về kết quả trong vòng 30 giây, THEN THE MapStartupSystem SHALL hiển thị thông báo lỗi timeout và hủy tiến trình bootstrap.

---

### Requirement 2: Song song hóa chuỗi IPC trong quá trình bootstrap

**User Story:** Với tư cách là developer, tôi muốn các IPC call có thể thực hiện song song được thực thi đồng thời, để loại bỏ thời gian chờ tuần tự không cần thiết trong quá trình khởi động.

#### Acceptance Criteria

1. WHEN quá trình bootstrap project bắt đầu, THE MapStartupSystem SHALL thực thi `get_active_project` và `get_recent_projects` song song trong cùng một `Promise.all`.
2. WHEN `openProjectBootstrap` được gọi, THE ProjectBootstrapService SHALL bắt đầu parse schema và build feature index đồng thời với việc tính toán bounds.
3. THE MapStartupSystem SHALL không chờ `useDesignSync.initialize()` hoàn thành trước khi emit mốc `project-bind-start`.
4. WHEN `normalizeMapStateForDisplay()` được gọi, THE MapStartupSystem SHALL defer React re-render cascade ra khỏi critical path của bootstrap bằng cách sử dụng `startTransition` hoặc cơ chế tương đương.
5. IF một IPC call trong chuỗi parallel thất bại, THEN THE MapStartupSystem SHALL log lỗi cụ thể của call đó và tiếp tục với các call còn lại thành công.

---

### Requirement 3: Loại bỏ JSON.parse lặp lại trong RAF callback

**User Story:** Với tư cách là developer, tôi muốn tọa độ của các features chỉ được parse một lần và được cache lại, để RAF callback không phải thực hiện `JSON.parse × N` lần trong mỗi animation frame.

#### Acceptance Criteria

1. THE CoordinateCache SHALL parse tọa độ của mỗi feature đúng một lần và lưu kết quả vào cache khi feature lần đầu được xử lý.
2. WHEN `ZoomExtendControl` cần tọa độ của một feature trong RAF callback, THE CoordinateCache SHALL trả về giá trị đã được cache mà không thực hiện `JSON.parse`.
3. WHEN một feature được cập nhật hoặc xóa, THE CoordinateCache SHALL vô hiệu hóa và xóa entry tương ứng trong cache.
4. THE CoordinateCache SHALL sử dụng feature ID làm cache key với độ phức tạp tra cứu O(1).
5. WHEN CoordinateCache được khởi tạo với một FeatureCollection mới, THE CoordinateCache SHALL hoàn thành việc pre-parse tọa độ toàn bộ collection trong một microtask queue riêng biệt, không block main thread.
6. FOR ALL features trong một FeatureCollection, sau khi được xử lý bởi CoordinateCache, kết quả của `cache.get(feature.id)` SHALL bằng với kết quả của `JSON.parse(feature.rawCoords)` (tính chất round-trip).

---

### Requirement 4: Giới hạn thời gian RAF frame dưới 16ms

**User Story:** Với tư cách là người dùng, tôi muốn bản đồ cuộn và tương tác mượt mà ở 60fps, để trải nghiệm sử dụng không bị giật lag trong khi dữ liệu đang được tải.

#### Acceptance Criteria

1. THE RAFScheduler SHALL đảm bảo mỗi RAF callback hoàn thành trong vòng 16ms (tương đương 60fps).
2. WHEN `buildMapLibreFeatureCollection` cần xử lý nhiều hơn 500 features trong một RAF frame, THE RAFScheduler SHALL chia công việc thành các batch và trải dài qua nhiều frames.
3. WHEN `ensureDesignLayers()`, `ensureBasemapOverlayLayers()` và `ensureOverlayLayers()` cần setup các MapLibre layers, THE RenderPipeline SHALL thực hiện việc này một lần duy nhất khi khởi tạo, không lặp lại trong mỗi RAF callback.
4. WHEN `source.setData()` được gọi với một FeatureCollection lớn (>1000 features), THE RenderPipeline SHALL serialize GeoJSON trong một Web Worker để không block main thread.
5. IF một RAF frame vượt quá 16ms, THEN THE RAFScheduler SHALL ghi nhận sự kiện này vào Telemetry kèm theo thời gian thực tế của frame.
6. WHILE ProgressiveLoader đang tải dữ liệu theo batch, THE RenderPipeline SHALL duy trì frame rate tối thiểu 30fps (≤ 33ms/frame) đo trên 10 frames liên tiếp.

---

### Requirement 5: Tải features theo batch (Progressive Loading)

**User Story:** Với tư cách là người dùng, tôi muốn bản đồ bắt đầu hiển thị các đối tượng ngay khi dữ liệu đầu tiên sẵn sàng, thay vì chờ toàn bộ project được load xong, để tôi có thể bắt đầu quan sát dữ liệu sớm hơn.

#### Acceptance Criteria

1. WHEN ProjectBootstrapService hoàn thành xử lý batch đầu tiên của features, THE ProgressiveLoader SHALL render batch đó lên bản đồ ngay lập tức mà không chờ các batch tiếp theo.
2. THE ProgressiveLoader SHALL chia FeatureCollection thành các batch có kích thước tối đa 200 features mỗi batch.
3. WHEN một batch mới được render, THE MapStartupSystem SHALL cập nhật thanh tiến độ để phản ánh số lượng features đã được hiển thị trên tổng số features của project.
4. WHEN toàn bộ features đã được render, THE MapStartupSystem SHALL emit mốc `project-bind-complete` và ẩn thanh tiến độ.
5. IF người dùng tương tác với bản đồ (pan/zoom) trong khi ProgressiveLoader đang chạy, THEN THE ProgressiveLoader SHALL tạm dừng render batch tiếp theo cho đến khi animation frame hiện tại hoàn thành.
6. THE ProgressiveLoader SHALL ưu tiên render các features trong viewport hiện tại trước, sau đó mới render các features ngoài viewport.

---

### Requirement 6: Hợp nhất các store subscriptions trong MapLibreFastRenderer

**User Story:** Với tư cách là developer, tôi muốn `MapLibreFastRenderer` chỉ re-render khi thực sự cần thiết, để giảm số lần re-render dư thừa do quá nhiều store subscriptions độc lập.

#### Acceptance Criteria

1. THE RenderPipeline SHALL hợp nhất 15+ individual `useDesignSync` selectors trong `MapLibreFastRenderer` thành tối đa 3 combined selectors sử dụng shallow equality comparison.
2. WHEN store state thay đổi, THE RenderPipeline SHALL chỉ trigger re-render nếu dữ liệu mà `MapLibreFastRenderer` thực sự sử dụng thay đổi.
3. THE RenderPipeline SHALL sử dụng `useShallow` hoặc custom equality function cho tất cả store subscriptions để ngăn re-render do object reference thay đổi nhưng giá trị không thay đổi.
4. WHEN `MapLibreFastRenderer` được mount, THE RenderPipeline SHALL không trigger quá 2 lần re-render trong quá trình bootstrap ban đầu.
5. FOR ALL store state changes không liên quan đến map rendering (ví dụ: UI state, panel visibility), THE RenderPipeline SHALL không trigger re-render của `MapLibreFastRenderer`.

---

### Requirement 7: Telemetry và đo lường hiệu năng

**User Story:** Với tư cách là developer, tôi muốn có số liệu đo lường chi tiết về từng giai đoạn khởi động bản đồ, để tôi có thể xác định regression và theo dõi cải thiện hiệu năng theo thời gian.

#### Acceptance Criteria

1. THE MapStartupSystem SHALL ghi nhận timestamps chính xác cho tất cả các mốc: `map-created`, `first-render`, `interactive`, `project-bind-start`, `first-feature`, `project-bind-complete`.
2. WHEN một mốc telemetry được ghi nhận, THE Telemetry SHALL lưu cả thời gian tuyệt đối (ms kể từ epoch) và thời gian tương đối (ms kể từ mốc trước).
3. THE MapStartupSystem SHALL tính toán và log tổng thời gian từ `map-created` đến `first-feature` sau mỗi lần mở project.
4. WHEN tổng thời gian từ `map-created` đến `first-feature` vượt quá 2000ms, THE Telemetry SHALL log cảnh báo kèm theo breakdown chi tiết thời gian của từng giai đoạn.
5. WHEN một RAF frame vượt quá 16ms, THE Telemetry SHALL ghi nhận: thời gian frame thực tế, tên hàm gây ra chậm trễ, và số lượng features đang được xử lý tại thời điểm đó.
6. THE Telemetry SHALL cung cấp API `getStartupReport()` trả về object chứa toàn bộ số liệu của lần khởi động gần nhất, để phục vụ debugging và automated testing.
7. FOR ALL telemetry reports, `report.milestones['first-feature'] - report.milestones['map-created']` SHALL bằng với `report.totalStartupTime` (tính chất consistency của dữ liệu telemetry).

---

### Requirement 8: Không làm giảm tính chính xác của dữ liệu hiển thị

**User Story:** Với tư cách là người dùng, tôi muốn tất cả đối tượng địa lý được hiển thị chính xác sau khi tối ưu hóa, để việc tăng tốc độ không gây ra mất mát hay sai lệch dữ liệu.

#### Acceptance Criteria

1. WHEN toàn bộ features đã được render sau quá trình progressive loading, THE RenderPipeline SHALL hiển thị đúng số lượng features theo dữ liệu gốc từ ProjectBootstrapService.
2. FOR ALL features trong FeatureCollection, geometry được hiển thị trên bản đồ SHALL khớp với geometry trong dữ liệu gốc sau khi đi qua CoordinateCache và RenderPipeline (tính chất tính toàn vẹn dữ liệu).
3. WHEN features được render theo batch, THE RenderPipeline SHALL đảm bảo không có feature nào bị render trùng lặp hoặc bị bỏ sót.
4. WHEN CoordinateCache trả về tọa độ đã cache, THE RenderPipeline SHALL sử dụng đúng hệ tọa độ (WGS84) mà không gây ra sai lệch vị trí hiển thị.
5. THE RenderPipeline SHALL pass toàn bộ existing integration tests liên quan đến hiển thị features mà không có regression.
