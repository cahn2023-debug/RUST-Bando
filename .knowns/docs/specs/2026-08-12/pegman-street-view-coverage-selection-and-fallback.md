---
title: Pegman Street View Coverage Selection and Fallback
description: Revised specification for local Street View coverage selection, nearest-panorama behavior, Pegman map interaction, and public Street View window lifecycle.
createdAt: '2026-08-12T16:55:00.150Z'
updatedAt: '2026-08-12T17:20:40.698Z'
tags:
  - spec
  - approved
  - pegman
  - street-view
  - coverage
  - basemap
---

## Overview

Hoàn thiện quy trình Pegman–Street View trên bản đồ preview. Khi người dùng bật Pegman, bản đồ hiển thị các đoạn đường có dữ liệu Street View cục bộ để người dùng chọn vị trí. Một lần click sẽ chọn panorama gần nhất trong viewport và mở hoặc tái sử dụng cửa sổ Street View public. Quy trình hỗ trợ cập nhật coverage theo viewport, hủy bằng chuột phải và thông báo lỗi có thể thử lại.

Feature này bổ sung cho spec đã approved: @doc/specs/2026-08-12/vietnam-basemap-preview-controls-and-integration. Các hành vi đồng bộ vị trí, heading, pitch và FOV sau khi cửa sổ mở tiếp tục tuân theo spec đó.

## Locked Decisions

- D1: Bật Pegman hiển thị lớp phủ phạm vi có dữ liệu Street View.
- D2: Click ngoài đoạn coverage chọn panorama gần nhất trong viewport hiện tại.
- D3: Nếu viewport không có dữ liệu, hiển thị thông báo và giữ Pegman/lớp phủ để thử lại.
- D4: Sau khi mở Street View, ẩn coverage nhưng giữ Pegman để chọn lại.
- D5: Chọn vị trí mới tái sử dụng cửa sổ Street View hiện tại.
- D6: Lỗi mở hoặc tái sử dụng cửa sổ hiển thị trên bản đồ và giữ Pegman/lớp phủ để thử lại.
- D7: Đóng cửa sổ Street View tắt Pegman và kết thúc quy trình.
- D8: Coverage Street View chỉ lấy từ dữ liệu cục bộ của package/dự án; Google public Street View chỉ dùng để mở cửa sổ xem sau khi đã chọn panorama.
- D9: Lỗi tải coverage cục bộ hiển thị chẩn đoán và vẫn giữ trạng thái Pegman để retry hoặc tắt.
- D10: Coverage tự động cập nhật khi pan/zoom trong chế độ Pegman.
- D11: Khi cập nhật coverage, giữ coverage cũ, hiển thị trạng thái đang tải và tạm khóa chọn điểm.
- D12: Chọn panorama gần nhất trong viewport, không giới hạn bán kính.
- D13: Click lại Pegman tắt Pegman và ẩn coverage, không đóng cửa sổ Street View đang mở.
- D14: Khi loading hoặc lỗi, Pegman vẫn ở trạng thái hoạt động và cho phép retry hoặc tắt.
- D15: Click chuột phải trên bản đồ hủy chọn điểm và ẩn coverage.
- D16: Coverage hiển thị bằng các đoạn đường màu xanh bán trong suốt.
- D17: Click coverage chọn panorama gần nhất và tự động mở Street View.
- D18: Không gọi Google Street View Coverage/Metadata/Maps JavaScript API để tải coverage và không yêu cầu API key; Google public Street View tiếp tục được dùng bởi cửa sổ xem hiện tại.
- D19: Khi coverage cục bộ được sử dụng, hiển thị thông báo nguồn cục bộ và giữ nguyên chế độ Pegman.
- D20: Nếu coverage cục bộ không có dữ liệu, hiển thị “Không có dữ liệu Street View” và giữ Pegman/lớp coverage để thử lại.

## System Decision Impact

- Impact: none
- Decision: Không thay đổi hướng dẫn hệ thống hoặc contract production hiện có.
- Acceptance gate: Hành vi phải được kiểm tra bằng unit/integration tests cho coverage selection, fallback, lifecycle và map interaction; kiểm tra không làm hỏng luồng Street View đã approved.

## Requirements

### Functional Requirements

- FR-1: Khi Pegman được bật, ứng dụng chuyển bản đồ sang chế độ chọn Street View và tải coverage cục bộ cho viewport hiện tại.
- FR-2: Coverage được vẽ thành các đoạn đường xanh bán trong suốt, có thể phân biệt với các lớp nền.
- FR-3: Coverage chỉ lấy từ package/dữ liệu cục bộ của dự án; luồng coverage không gọi Google Coverage API, Metadata API hoặc Maps JavaScript API.
- FR-4: Khi pan/zoom trong chế độ Pegman, ứng dụng tải coverage cục bộ theo viewport mới; trong lúc tải, coverage trước đó vẫn hiển thị và không thể chọn điểm.
- FR-5: Click trên hoặc ngoài coverage đều chọn panorama gần nhất trong viewport hiện tại; click ngoài coverage không bị giới hạn bởi bán kính.
- FR-6: Sau khi chọn panorama, ứng dụng tự động mở hoặc tái sử dụng cửa sổ Street View public hiện có và truyền vị trí đã chọn.
- FR-7: Khi cửa sổ mở thành công, coverage được ẩn nhưng chế độ Pegman vẫn hoạt động để chọn lại.
- FR-8: Click lại Pegman tắt chế độ chọn và ẩn coverage nhưng không đóng cửa sổ Street View đang mở.
- FR-9: Click chuột phải trên bản đồ hủy chế độ chọn và ẩn coverage trước khi mở cửa sổ.
- FR-10: Khi cửa sổ Street View đóng, ứng dụng tắt Pegman và kết thúc quy trình.
- FR-11: Lỗi tải coverage cục bộ, lỗi mở hoặc lỗi tái sử dụng cửa sổ phải hiển thị trên giao diện bản đồ; trạng thái Pegman vẫn cho phép retry hoặc tắt.
- FR-12: Nếu viewport không có panorama cục bộ, hiển thị “Không có dữ liệu Street View”, giữ Pegman và cho phép thử lại.
- FR-13: Khi dùng coverage cục bộ, hiển thị thông báo nguồn cục bộ hoặc thông báo tương đương dễ nhận biết.
- FR-14: Luồng này không tạo marker điểm chọn thông thường; sau khi có viewpoint, marker Pegman và overlay hướng nhìn tiếp tục tuân theo spec Street View đã approved.

### Non-Functional Requirements

- NFR-1: Trạng thái loading, nguồn local, lỗi, retry và active phải có nhãn hiển thị rõ ràng, không chỉ ghi log.
- NFR-2: Coverage selection phải có test deterministic cho happy path, dữ liệu rỗng, payload không hợp lệ và lỗi tải cục bộ.
- NFR-3: Coverage không gọi Google Coverage/Metadata/Maps JavaScript API và không yêu cầu API key; Google public chỉ dùng trong cửa sổ Street View hiện có.

## Acceptance Criteria

- [ ] AC-1: Click Pegman làm coverage đoạn đường xanh bán trong suốt xuất hiện cho viewport hiện tại và nút Pegman chuyển sang trạng thái active.
- [ ] AC-2: Click trên coverage chọn panorama gần nhất và tự động mở cửa sổ Street View.
- [ ] AC-3: Click ngoài coverage chọn panorama gần nhất trong viewport thay vì bỏ qua click.
- [ ] AC-4: Khi pan/zoom, coverage tự động cập nhật; coverage cũ vẫn hiển thị, trạng thái loading xuất hiện và click bị khóa trong thời gian tải.
- [ ] AC-5: Sau khi mở cửa sổ, coverage ẩn nhưng Pegman vẫn active và có thể chọn vị trí khác.
- [ ] AC-6: Chọn vị trí thứ hai tái sử dụng cửa sổ Street View hiện tại, không tạo thêm cửa sổ.
- [ ] AC-7: Click chuột phải trước khi mở cửa sổ hủy chế độ chọn và ẩn coverage.
- [ ] AC-8: Click lại Pegman ẩn coverage và tắt chế độ chọn nhưng không đóng cửa sổ Street View đang mở.
- [ ] AC-9: Đóng cửa sổ Street View tắt Pegman và kết thúc quy trình.
- [ ] AC-10: Coverage cục bộ được đọc từ package/dataset hợp lệ, hiển thị thông báo nguồn cục bộ và vẫn giữ chế độ Pegman.
- [ ] AC-11: Khi coverage cục bộ không có dữ liệu trong viewport, ứng dụng hiển thị “Không có dữ liệu Street View”, giữ Pegman/lớp coverage và cho phép retry.
- [ ] AC-12: Lỗi tải coverage hoặc lỗi mở/tái sử dụng cửa sổ hiển thị trên bản đồ, không làm mất trạng thái để người dùng retry hoặc tắt.
- [ ] AC-13: Luồng coverage không gọi Google Coverage/Metadata/Maps JavaScript API và không yêu cầu API key; Google public chỉ được dùng bởi cửa sổ Street View sau khi chọn.
- [ ] AC-14: Test bao phủ chọn điểm gần nhất, cập nhật viewport, loading lock, local coverage, retry, contextmenu cancel, reuse window và close lifecycle.

## Scenarios

### Scenario 1: Bật Pegman và hiển thị coverage

**Given** bản đồ đã sẵn sàng và viewport có dữ liệu Street View  
**When** người dùng click nút Pegman  
**Then** Pegman active, coverage đoạn đường xanh xuất hiện và bản đồ bắt đầu nhận thao tác chọn điểm.

### Scenario 2: Chọn trên coverage

**Given** Pegman active và coverage đã tải  
**When** người dùng click một đoạn coverage  
**Then** panorama gần nhất được chọn và cửa sổ Street View được mở hoặc tái sử dụng tự động.

### Scenario 3: Chọn ngoài coverage

**Given** Pegman active và viewport có ít nhất một panorama  
**When** người dùng click vị trí không nằm trên đoạn coverage  
**Then** panorama gần nhất trong viewport được chọn và cửa sổ Street View được mở.

### Scenario 4: Cập nhật coverage khi di chuyển bản đồ

**Given** Pegman active và coverage hiện tại đang hiển thị  
**When** người dùng pan hoặc zoom  
**Then** coverage cũ vẫn hiển thị, trạng thái loading xuất hiện, thao tác chọn bị khóa, sau đó coverage được thay bằng dữ liệu của viewport mới.

### Scenario 5: Coverage cục bộ

**Given** package/dataset cục bộ có coverage Street View hợp lệ  
**When** người dùng bật Pegman hoặc ứng dụng cập nhật viewport  
**Then** coverage cục bộ được hiển thị, thông báo nguồn cục bộ xuất hiện và Pegman vẫn active.

### Scenario 6: Không có coverage

**Given** package/dataset cục bộ không có panorama trong viewport  
**When** ứng dụng hoàn tất việc tải coverage  
**Then** thông báo “Không có dữ liệu Street View” xuất hiện, Pegman/lớp coverage vẫn giữ để retry, và ứng dụng không mở Street View từ điểm tùy ý.

### Scenario 7: Hủy thao tác

**Given** Pegman active và cửa sổ Street View chưa được mở từ lần chọn hiện tại  
**When** người dùng click chuột phải trên bản đồ  
**Then** chế độ chọn bị hủy và coverage bị ẩn.

### Scenario 8: Chọn lại và tái sử dụng cửa sổ

**Given** cửa sổ Street View đang mở và Pegman active  
**When** người dùng chọn panorama khác  
**Then** cửa sổ hiện tại chuyển sang viewpoint mới, không tạo cửa sổ thứ hai.

### Scenario 9: Đóng cửa sổ

**Given** cửa sổ Street View đang mở  
**When** người dùng đóng cửa sổ  
**Then** Pegman tắt, coverage không còn active và quy trình kết thúc.

### Scenario 10: Lỗi mở cửa sổ

**Given** panorama đã được chọn nhưng cửa sổ không thể mở hoặc tái sử dụng  
**When** thao tác mở thất bại  
**Then** lỗi hiển thị trên bản đồ, Pegman/lớp coverage vẫn giữ để người dùng retry hoặc tắt.

## Technical Notes

- Thành phần hiện có trong `vietnam-basemap-preview` đã có bridge mở/tái sử dụng cửa sổ Street View, controller viewpoint và marker Pegman; implementation nên mở rộng các boundary hiện có thay vì tạo một luồng cửa sổ mới.
- Coverage adapter cục bộ cần đọc từ package/dataset hiện có hoặc một asset coverage được khai báo trong manifest; contract dữ liệu phải biểu diễn được đoạn đường và panorama gần nhất trong viewport.
- Không triển khai Google Street View CoverageLayer, Street View Metadata API hoặc endpoint coverage không tài liệu hóa. Không đưa API key vào mã nguồn hay cấu hình coverage.
- Luồng đồng bộ viewpoint về bản đồ chính tiếp tục dùng contract Street View hiện có trong @doc/specs/2026-08-12/vietnam-basemap-preview-controls-and-integration.

## Task Links

- @task-552dl2 [pegman-street-view-coverage-selection-and-fallback-01] Coverage source and nearest-panorama selection — done
- @task-bk4txh [pegman-street-view-coverage-selection-and-fallback-02] Pegman coverage mode and map interaction — done
- @task-mzpvou [pegman-street-view-coverage-selection-and-fallback-03] Street View lifecycle integration and regression coverage — done

## Open Questions

- [ ] Coverage cục bộ hiện có nằm ở package/asset nào và contract dữ liệu panorama gần nhất là gì?
- [ ] Nếu coverage cục bộ trả về coverage từng phần, cách xác định “không có dữ liệu trong viewport” cần dựa trên response rỗng hay trạng thái nguồn riêng?
