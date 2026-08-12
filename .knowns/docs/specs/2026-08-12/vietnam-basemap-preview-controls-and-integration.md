---
title: Vietnam Basemap Preview Controls and Integration
description: Specification for viewport controls, layer switching, geolocation, external extent integration, local package download, and public Google Street View synchronization.
createdAt: '2026-08-12T04:35:45.194Z'
updatedAt: '2026-08-12T04:44:46.661Z'
tags:
  - spec
  - basemap
  - preview
  - desktop
  - integration
  - approved
---

## Overview

Mở rộng phần mềm standalone `vietnam-basemap-preview` thành công cụ xem bản đồ có các điều khiển viewport, định vị, chuyển lớp nền, nhận vùng dữ liệu từ phần mềm gốc và mở Google Street View public trong một cửa sổ riêng. Tính năng vẫn giữ ranh giới preview read-only: không ghi hoặc thay đổi dữ liệu nghiệp vụ/basemap release.

Phạm vi bao gồm:
- SEE: thanh/nút điều khiển bản đồ và trạng thái nguồn dữ liệu.
- CALL: Local HTTP API và Tauri IPC để nhận đối tượng/vùng dữ liệu từ phần mềm gốc.
- RUN: theo dõi thư mục dữ liệu, tải package `.pdb` thủ công và đồng bộ cửa sổ Street View.
- READ/ORGANIZE: lưu và khôi phục cấu hình người dùng.

## Locked Decisions

- D1: `Zoom extend` hỗ trợ dữ liệu từ cả API/IPC và file do phần mềm khác xuất ra.
- D2: `Local package` cho phép chọn thư mục dữ liệu có sẵn và tải package `.pdb` từ link cấu hình.
- D3: Pegman mở Google Street View public trong một cửa sổ riêng; cửa sổ gửi vị trí, góc nhìn và khung nhìn về bản đồ chính.
- D4: `Zoom extend` hỗ trợ các định dạng mà thư viện bản đồ hiện tại đọc được qua file, API hoặc IPC.
- D5: `Định vị` xin quyền vị trí nếu cần, đặt marker và đưa bản đồ đến vị trí thiết bị.
- D6: `Zoom extend` chỉ tính extent và thay đổi viewport, không hiển thị dữ liệu thành overlay.
- D7: Khởi động dùng cấu hình đã lưu; nếu chưa có cấu hình thì hiển thị màn hình chọn lớp nền trước khi mở bản đồ.
- D8: Nếu định vị thất bại hoặc bị từ chối quyền, hiển thị lỗi và giữ nguyên viewport.
- D9: Tải `.pdb` là thao tác thủ công; người dùng chọn thư mục lưu và chỉ chuyển sang package sau khi tải thành công.
- D10: Google Street và Google Hybrid dùng nguồn Google raster preview hiện tại, không bắt buộc API key.
- D11: Nếu chưa chọn điểm cụ thể, Pegman yêu cầu người dùng chọn điểm trước khi mở Street View.
- D12: Có cả tự động zoom theo cấu hình khi dữ liệu mới đến và nút `Zoom extend` thủ công.
- D13: Tự động zoom bật mặc định và người dùng có thể tắt trong cài đặt.
- D14: Local folder/package không hợp lệ phải hiển thị danh sách lỗi chi tiết và yêu cầu chọn lại nguồn.
- D15: Dữ liệu file chỉ được nhận tự động từ thư mục đã cấu hình; không yêu cầu chọn file thủ công.
- D16: Local HTTP API và Tauri IPC dùng chung một payload dữ liệu chuẩn hóa.
- D17: Ưu tiên local package hợp lệ; link tải chỉ dùng khi người dùng chủ động tải/cập nhật.
- D18: Khi Street View thay đổi, bản đồ chính cập nhật liên tục vị trí, hướng nhìn và góc nhìn của Pegman.
- D19: Local HTTP API chỉ lắng nghe trên `localhost`, dùng cổng cấu hình được.
- D20: Extent được tính cho đối tượng do phần mềm gốc gửi/đồng bộ; bản đồ zoom đến vùng của đối tượng đó, không hợp nhất toàn bộ dữ liệu trong thư mục.

## System Decision Impact

- Impact: existing
- Decision: @decision/20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
- Acceptance gate: Google Street/Hybrid chỉ dùng cho standalone preview, phải hiển thị attribution/source rõ ràng và không được đưa dependency này vào Basemap Platform production, release package hoặc client runtime chính.

## Requirements

### Functional Requirements

- FR-1: Giao diện phải có nút `Zoom +`, `Zoom -`, `Zoom extend`, `Định vị`, chọn `Layer` và nút Pegman ở khu vực phía trên bên phải.
- FR-2: `Zoom +` và `Zoom -` thay đổi zoom của bản đồ một bước; bản đồ vẫn giữ tâm hiện tại.
- FR-3: `Zoom extend` thủ công dùng đối tượng dữ liệu gần nhất/hợp lệ do phần mềm gốc cung cấp để tính extent và gọi viewport fit; nếu chưa có dữ liệu hợp lệ, hiển thị trạng thái giải thích và không đổi viewport.
- FR-4: Khi nhận đối tượng mới từ HTTP API, Tauri IPC hoặc thư mục theo dõi, hệ thống phải cập nhật dữ liệu vùng hiện tại. Nếu tự động zoom đang bật, hệ thống phải fit viewport đến đúng extent của đối tượng mới; nếu tắt, chỉ cập nhật dữ liệu chờ cho lần bấm `Zoom extend`.
- FR-5: Hệ thống phải dùng cùng một payload chuẩn hóa cho HTTP API và IPC, đồng thời chuyển đổi dữ liệu đầu vào sang định dạng mà thư viện bản đồ hiện tại có thể đọc để tính extent.
- FR-6: HTTP API chỉ bind loopback `localhost`; cổng phải đọc/ghi được từ cấu hình người dùng và lỗi bind phải hiển thị rõ ràng.
- FR-7: Hệ thống phải theo dõi thư mục dữ liệu đã cấu hình, nhận file mới hợp lệ và liên kết file đó với đối tượng do phần mềm gốc cung cấp; file không hợp lệ phải không làm thay đổi viewport và phải có lỗi chẩn đoán.
- FR-8: `Layer` phải cho phép chuyển giữa `Google Street`, `Google Hybrid` và `Local package`. Nguồn Google dùng raster preview hiện tại; nguồn local dùng package root hợp lệ hoặc package đã tải thành công.
- FR-9: Khi chọn `Local package`, hệ thống phải ưu tiên package local hợp lệ. Người dùng có thể chọn thư mục local; link `.pdb` chỉ được dùng sau thao tác tải thủ công và chọn thư mục lưu.
- FR-10: Việc chuyển sang package tải về chỉ được thực hiện sau khi tải hoàn tất, package được kiểm tra hợp lệ và các lỗi được hiển thị nếu kiểm tra thất bại.
- FR-11: Cấu hình phải lưu layer, local folder/package, link tải `.pdb`, thư mục theo dõi, cổng localhost và trạng thái tự động zoom; khi khởi động phải khôi phục cấu hình.
- FR-12: Nếu chưa có cấu hình layer, hệ thống phải hiển thị màn hình chọn layer trước khi render bản đồ.
- FR-13: `Định vị` phải xin quyền vị trí khi cần, đặt/cập nhật marker vị trí thiết bị và fit hoặc fly bản đồ đến vị trí đó. Nếu quyền bị từ chối hoặc định vị thất bại, phải báo lỗi và giữ nguyên viewport.
- FR-14: Pegman chỉ mở khi bản đồ đã có điểm được chọn. Nếu chưa có điểm, hệ thống phải yêu cầu chọn điểm.
- FR-15: Pegman phải mở một cửa sổ desktop riêng dùng Google Street View public tại điểm đã chọn, truyền góc nhìn hiện tại khi có.
- FR-16: Cửa sổ Street View phải gửi liên tục các cập nhật vị trí, heading/hướng nhìn và pitch/FOV/khung nhìn về cửa sổ bản đồ chính; bản đồ chính phải cập nhật vị trí và hướng hiển thị của Pegman theo dữ liệu mới nhất.
- FR-17: Đóng cửa sổ Street View, mất kết nối đồng bộ hoặc lỗi nguồn phải đưa trạng thái về thông báo có thể chẩn đoán mà không làm hỏng bản đồ chính.
- FR-18: UI phải hiển thị source/layer hiện tại, attribution, trạng thái tải/lỗi và thông tin package tối thiểu khi đang dùng local source.
- FR-19: Các thao tác vẫn nằm trong ranh giới preview read-only; không có thao tác build, validate, activate, rollback hoặc ghi dữ liệu nghiệp vụ.

### Non-Functional Requirements

- NFR-1: API loopback không mở listener trên địa chỉ LAN hoặc public interface.
- NFR-2: Các thao tác tải package, đọc thư mục và nhận dữ liệu không được chặn UI; phải có trạng thái loading/progress/error.
- NFR-3: Dữ liệu từ API/IPC/file phải được kiểm tra trước khi tính extent; lỗi một đối tượng không được làm mất viewport hợp lệ hiện tại.
- NFR-4: Các thông báo lỗi phải xác định được nguồn lỗi: permission, bind, payload/format, watcher, package, tile hoặc Street View.
- NFR-5: Tính năng phải giữ tương thích với typed basemap adapter/runtime boundary hiện có và không truy cập storage release trực tiếp từ UI.

## Acceptance Criteria

- [ ] AC-1: Người dùng nhìn thấy và sử dụng được năm điều khiển `Zoom +`, `Zoom -`, `Zoom extend`, `Định vị` và `Layer`; Pegman nằm ở góc trên bên phải.
- [ ] AC-2: `Zoom +`/`Zoom -` thay đổi zoom đúng một bước và không làm thay đổi tâm ngoài hành vi tự nhiên của thư viện bản đồ.
- [ ] AC-3: Với một đối tượng hợp lệ nhận từ HTTP API, IPC hoặc file được thư mục theo dõi phát hiện, `Zoom extend` đưa viewport bao phủ extent của đúng đối tượng đó và không tạo overlay.
- [ ] AC-4: Khi tự động zoom bật, đối tượng mới làm viewport fit tự động; khi tắt, viewport không tự đổi cho đến khi người dùng bấm `Zoom extend`.
- [ ] AC-5: HTTP API bind được trên localhost với cổng cấu hình; request đúng payload được xử lý và request sai trả lỗi chẩn đoán mà không làm crash ứng dụng.
- [ ] AC-6: IPC dùng cùng payload chuẩn hóa và cho kết quả extent tương đương HTTP API với cùng một đối tượng.
- [ ] AC-7: Thư mục theo dõi nhận file mới hợp lệ; file không đọc được/không hỗ trợ bị bỏ qua với lỗi chi tiết.
- [ ] AC-8: Layer chuyển được giữa Google Street, Google Hybrid và Local package; source/attribution hiện tại được cập nhật.
- [ ] AC-9: Khi có local package hợp lệ, package local được dùng trước link tải; tải `.pdb` chỉ bắt đầu sau nút tải thủ công và chỉ kích hoạt sau khi tải/kiểm tra thành công.
- [ ] AC-10: Local folder/package không hợp lệ hiển thị danh sách lỗi và yêu cầu người dùng chọn lại nguồn, không âm thầm fallback.
- [ ] AC-11: Cấu hình được lưu và khôi phục; lần đầu chưa có layer đã lưu thì màn hình chọn layer xuất hiện trước bản đồ.
- [ ] AC-12: Định vị thành công đặt marker và đưa viewport đến vị trí thiết bị; từ chối quyền/lỗi định vị báo lỗi và giữ nguyên viewport.
- [ ] AC-13: Pegman không mở cửa sổ khi chưa chọn điểm; sau khi chọn điểm, mở một cửa sổ Street View riêng.
- [ ] AC-14: Thay đổi vị trí, heading và khung nhìn trong cửa sổ Street View cập nhật liên tục marker/Pegman và hướng hiển thị trên bản đồ chính.
- [ ] AC-15: Google raster source và Street View có attribution/trạng thái nguồn; lỗi tile hoặc Street View không tự động chuyển sang nguồn khác ngoài lựa chọn của người dùng.
- [ ] AC-16: Bộ kiểm thử bao phủ payload hợp lệ/không hợp lệ, extent của từng nguồn, watcher, config persistence, layer switch, geolocation failure và Street View sync.

## Scenarios

### Scenario 1: Chọn layer lần đầu

**Given** chưa có cấu hình người dùng

**When** người dùng mở `vietnam-basemap-preview`

**Then** hệ thống hiển thị màn hình chọn layer trước khi render bản đồ và chỉ mở canvas sau khi người dùng chọn nguồn hợp lệ.

### Scenario 2: Zoom thủ công theo đối tượng phần mềm gốc

**Given** phần mềm gốc đã gửi một đối tượng hợp lệ qua localhost HTTP API hoặc Tauri IPC

**When** người dùng bấm `Zoom extend`

**Then** hệ thống tính extent của đối tượng đó, fit viewport bao phủ extent và không tạo overlay.

### Scenario 3: Tự động zoom từ thư mục theo dõi

**Given** thư mục theo dõi đã cấu hình và tự động zoom đang bật

**When** một file mới chứa đối tượng hợp lệ được ghi vào thư mục

**Then** hệ thống đọc đối tượng, cập nhật vùng hiện tại và tự động fit viewport theo đúng đối tượng mới.

### Scenario 4: Layer local và tải package

**Given** có một package local hợp lệ và một link `.pdb`

**When** người dùng chọn `Local package`

**Then** hệ thống dùng package local; chỉ khi người dùng bấm tải, chọn thư mục lưu và tải/kiểm tra thành công thì package từ link mới trở thành nguồn hoạt động.

### Scenario 5: Định vị lỗi

**Given** người dùng chưa cấp quyền vị trí hoặc thiết bị không trả về tọa độ

**When** người dùng bấm `Định vị`

**Then** hệ thống hiển thị lỗi có thể chẩn đoán, không đặt marker mới và giữ nguyên viewport trước đó.

### Scenario 6: Pegman và đồng bộ liên tục

**Given** người dùng đã chọn một điểm trên bản đồ

**When** người dùng bấm Pegman, sau đó di chuyển/xoay trong cửa sổ Street View

**Then** cửa sổ riêng được mở và bản đồ chính liên tục cập nhật vị trí, heading và khung nhìn của Pegman.

### Scenario 7: API không an toàn

**Given** ứng dụng được cấu hình cổng localhost

**When** ứng dụng khởi động API

**Then** listener chỉ bind loopback; không bind địa chỉ LAN/public và lỗi cổng bị chiếm được hiển thị rõ.

## Technical Notes

- Tái sử dụng typed basemap adapter/runtime boundary hiện có; UI không đọc trực tiếp release storage/provider implementation.
- Giữ Google raster exception tách biệt với Basemap Platform production và hiển thị attribution/source.
- Tách transport adapter (HTTP/IPC/file watcher) khỏi bộ chuẩn hóa payload và extent calculator để ba nguồn cho cùng kết quả.
- Tách cửa sổ Street View khỏi bản đồ chính qua một kênh sự kiện hai chiều; bản đồ chính là consumer trạng thái Pegman mới nhất.
- Không khóa cứng một định dạng file riêng trong spec; bộ đọc phải ủy quyền cho thư viện bản đồ hiện tại và trả lỗi định dạng không hỗ trợ.
- Chi tiết triển khai, task decomposition và lựa chọn thư viện thuộc bước lập kế hoạch sau khi spec được duyệt.

- @task-hviomg [vietnam-basemap-preview-controls-and-integration-01] Viewport controls and map interaction foundation — todo
- @task-2vilw9 [vietnam-basemap-preview-controls-and-integration-02] Layer switching, persisted configuration, and local package download — todo
- @task-36g5w8 [vietnam-basemap-preview-controls-and-integration-03] External extent ingestion, localhost HTTP/IPC, watcher, and geolocation — todo
- @task-ab7tpt [vietnam-basemap-preview-controls-and-integration-04] Pegman Street View window and continuous synchronization — todo
- @task-3l3rel [vietnam-basemap-preview-controls-and-integration-05] Integrated verification and standalone preview acceptance — todo

## Open Questions

Không còn câu hỏi blocker trong phạm vi đã chốt. Các chi tiết kỹ thuật chưa khóa sẽ được quyết định trong kế hoạch triển khai, miễn là không thay đổi D1–D20.
