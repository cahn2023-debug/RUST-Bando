---
title: Google Public Street View Coverage Overlay Fallback
description: Specification for fixing the Pegman coverage overlay by attempting best-effort public Google Street View coverage without an API key.
createdAt: '2026-08-13T01:44:07.760Z'
updatedAt: '2026-08-13T02:14:25.350Z'
tags:
  - spec
  - approved
  - pegman
  - street-view
  - coverage
  - preview
---

## Overview

Sửa luồng Pegman của Vietnam Basemap Preview để khi người dùng bật Pegman, ứng dụng thử hiển thị lớp phủ đường có Street View từ dữ liệu coverage công khai của Google. Nguồn này không dùng API key và không phải contract được Google hỗ trợ, vì vậy luồng phải best-effort: nếu nguồn không tải được, payload không hợp lệ hoặc không có coverage, ứng dụng ẩn lớp phủ nhưng vẫn giữ Pegman hoạt động và mở Street View theo tọa độ click.

Spec này là follow-up thay đổi nguồn coverage của @doc/specs/2026-08-12/pegman-street-view-coverage-selection-and-fallback. Spec cũ dùng coverage local/package; spec mới thay đổi quyết định đó cho preview và không mở rộng thành dependency của production basemap platform.

## Locked Decisions

- D1: Lớp phủ coverage dùng nguồn Google public không tài liệu hóa, không API key, theo cơ chế best-effort; nguồn có thể ngừng hoạt động hoặc trả dữ liệu rỗng.
- D2: Khi nguồn coverage lỗi hoặc rỗng, lớp phủ ẩn âm thầm, Pegman vẫn active và bản đồ vẫn nhận click.
- D3: Khi không có lớp phủ usable, click bản đồ dùng tọa độ click để mở Street View public gần vị trí đó.
- D4: Coverage hiển thị theo viewport hiện tại và tải lại sau mỗi lần pan/zoom.
- D5: Trong lúc tải coverage mới, giữ lớp phủ cũ; chỉ thay thế khi dữ liệu mới sẵn sàng.
- D6: Click trên coverage, hoặc click ngoài coverage khi viewport có panorama usable, chọn panorama gần nhất trong viewport rồi mở/tái sử dụng cửa sổ Street View.
- D7: Nếu click ngoài coverage và viewport không có panorama usable, dùng tọa độ click để mở Street View public gần vị trí đó.
- D8: Nếu coverage public tải được nhưng payload không hợp lệ hoặc không chuyển đổi được, ẩn lớp phủ, giữ Pegman active và cho phép fallback theo tọa độ click.
- D9: Khi bản đồ dùng package offline/local, vẫn thử tải coverage Google public qua mạng; nếu thất bại thì áp dụng fallback đã chốt.
- D10: Trong lúc coverage mới đang tải, click vẫn được xử lý; dùng coverage cũ nếu còn phù hợp, nếu không thì fallback theo tọa độ click.
- D11: Khi Street View mở thành công, ẩn lớp phủ nhưng giữ Pegman active để chọn vị trí khác.
- D12: Khi người dùng đóng cửa sổ Street View, tắt Pegman và kết thúc luồng chọn.

## System Decision Impact

- Impact: draft new
- Decision: @decision/20260813-0843-best-effort-google-public-street-view-coverage-in-preview
- Acceptance gate: Chỉ chấp nhận candidate sau khi spec và task triển khai được review, kiểm thử fallback được chứng minh, và xác nhận không có API key/coverage persistence trong diff.

## Requirements

### Functional Requirements

- FR-1: Khi Pegman được bật, ứng dụng phải bắt đầu yêu cầu coverage cho viewport hiện tại từ adapter Google public best-effort.
- FR-2: Khi nhận được payload coverage hợp lệ, ứng dụng phải chuyển đổi được các đoạn đường và panorama để hiển thị lớp phủ màu xanh bán trong suốt.
- FR-3: Khi viewport thay đổi, ứng dụng phải yêu cầu coverage viewport mới; request cũ không được ghi đè dữ liệu mới hơn.
- FR-4: Khi request đang pending, lớp phủ usable gần nhất vẫn được giữ và thao tác click không bị khóa.
- FR-5: Khi coverage không có, lỗi hoặc không hợp lệ, ứng dụng không hiển thị lỗi coverage riêng; lớp phủ được ẩn và Pegman vẫn có thể fallback theo tọa độ click.
- FR-6: Khi click có panorama usable từ coverage hiện tại, ứng dụng chọn panorama gần nhất và mở hoặc tái sử dụng cửa sổ Street View hiện có.
- FR-7: Khi không có panorama usable, ứng dụng mở/tái sử dụng Street View public gần tọa độ click.
- FR-8: Khi cửa sổ Street View đóng, ứng dụng tắt Pegman, ẩn coverage và xóa marker viewpoint.

### Non-Functional Requirements

- NFR-1: Coverage adapter không được yêu cầu, nhúng hoặc log API key.
- NFR-2: Không lưu trữ, lập chỉ mục, đóng gói hoặc tạo database lâu dài từ payload coverage Google.
- NFR-3: Nguồn best-effort phải được cô lập sau một boundary có thể thay thế; thay đổi response của Google không được làm crash bản đồ chính.
- NFR-4: Luồng vẫn hoạt động với package offline/local khi có hoặc không có mạng; chỉ coverage public phụ thuộc mạng.

## Acceptance Criteria

- [x] AC-1: Click Pegman trong preview làm Pegman active và bắt đầu request coverage public mà không yêu cầu API key hoặc asset coverage local.
- [x] AC-2: Khi request trả payload hợp lệ cho viewport hiện tại, lớp phủ đường Street View màu xanh bán trong suốt hiển thị trên bản đồ.
- [x] AC-3: Pan/zoom khi Pegman active yêu cầu coverage viewport mới; lớp phủ cũ vẫn hiển thị trong lúc pending và chỉ bị thay khi response mới hợp lệ.
- [x] AC-4: Coverage lỗi, rỗng hoặc payload không hợp lệ làm lớp phủ ẩn âm thầm, không tắt Pegman và không chặn click.
- [x] AC-5: Click trên coverage hoặc ngoài coverage khi có panorama usable mở/tái sử dụng cửa sổ Street View tại panorama gần nhất trong viewport.
- [x] AC-6: Click khi không có coverage usable hoặc khi coverage đang pending mà không có dữ liệu cũ phù hợp mở/tái sử dụng Street View public gần tọa độ click.
- [x] AC-7: Sau khi mở Street View thành công, lớp phủ ẩn nhưng Pegman vẫn active; chọn lần tiếp theo tái sử dụng cửa sổ hiện tại.
- [x] AC-8: Đóng cửa sổ Street View tắt Pegman, ẩn lớp phủ và xóa marker viewpoint.
- [x] AC-9: Test bao phủ adapter/parser public, chuyển đổi payload, refresh viewport, giữ dữ liệu cũ khi loading, fallback tọa độ, lifecycle mở/tái sử dụng/đóng, và không có API key/persistence.
- [x] AC-10: Package offline/local hiện có không bị yêu cầu thêm asset coverage local để dùng Pegman.

## Scenarios

### Scenario 1: Bật Pegman và hiển thị coverage public

**Given** bản đồ đã sẵn sàng và viewport hiện tại có coverage public hợp lệ  
**When** người dùng click nút Pegman  
**Then** Pegman active và lớp phủ đường Street View màu xanh hiển thị.

### Scenario 2: Coverage public unavailable

**Given** Pegman active nhưng nguồn public lỗi, rỗng hoặc payload không hợp lệ  
**When** request coverage hoàn tất  
**Then** lớp phủ ẩn âm thầm, Pegman vẫn active và click bản đồ vẫn được xử lý.

### Scenario 3: Fallback theo tọa độ

**Given** Pegman active và không có panorama usable trong dữ liệu coverage hiện tại  
**When** người dùng click bản đồ  
**Then** ứng dụng mở hoặc tái sử dụng Street View public gần tọa độ click.

### Scenario 4: Giữ overlay khi viewport loading

**Given** Pegman active và lớp phủ viewport cũ đang hiển thị  
**When** người dùng pan hoặc zoom  
**Then** lớp phủ cũ vẫn hiển thị trong lúc request mới pending và được thay bằng dữ liệu mới khi response hợp lệ.

### Scenario 5: Chọn panorama gần nhất

**Given** Pegman active và viewport có panorama usable  
**When** người dùng click bất kỳ vị trí nào trên bản đồ  
**Then** panorama gần nhất trong viewport được chọn và cửa sổ Street View được mở hoặc tái sử dụng.

### Scenario 6: Package offline

**Given** bản đồ đang dùng package offline/local  
**When** người dùng bật Pegman  
**Then** ứng dụng vẫn thử coverage public qua mạng; nếu thất bại, lớp phủ ẩn và fallback tọa độ vẫn hoạt động.

### Scenario 7: Đóng cửa sổ

**Given** cửa sổ Street View đang mở và Pegman active  
**When** người dùng đóng cửa sổ  
**Then** Pegman tắt, lớp phủ ẩn và marker viewpoint bị xóa.

## Technical Notes

- Có thể dùng boundary adapter riêng cho nguồn coverage public và parser payload; không coi response của Google web experience là schema ổn định.
- Không dùng Maps JavaScript API `StreetViewCoverageLayer`, Street View Metadata API hoặc Street View Tile API trong spec này vì các lựa chọn đó cần cấu hình/API key hoặc là dependency khác với yêu cầu hiện tại.
- Google mô tả `StreetViewCoverageLayer` và `StreetViewService` trong Maps JavaScript API, nhưng đây không phải nguồn được chọn cho spec này: https://developers.google.com/maps/documentation/javascript/reference/street-view
- Google mô tả Street View Metadata API cần API key: https://developers.google.com/maps/documentation/streetview/metadata
- Cửa sổ xem Street View public hiện có tiếp tục được tái sử dụng; spec này chỉ thay đổi nguồn dữ liệu cho lớp phủ/chọn panorama.
- Không ghi lại coverage public vào package, manifest, release contract hoặc durable project data.

## Task Links

- @task-idc190 [google-public-street-view-coverage-overlay-fallback-01] Public Google coverage adapter — done
- @task-iibd2k [google-public-street-view-coverage-overlay-fallback-02] Coverage overlay and click fallback — done
- @task-vl95yh [google-public-street-view-coverage-overlay-fallback-03] Street View lifecycle and regression tests — done

## Open Questions

- [ ] Payload public thực tế có thể thay đổi; task triển khai phải xác định response tối thiểu có thể parse được và có fixture test ổn định.
- [ ] Cần xác nhận domain/endpoint public phù hợp trong môi trường preview và xử lý CORS trước khi triển khai.


Task Links

- @task-idc190 [google-public-street-view-coverage-overlay-fallback-01] Public Google coverage adapter — todo
- @task-iibd2k [google-public-street-view-coverage-overlay-fallback-02] Coverage overlay and click fallback — todo
- @task-vl95yh [google-public-street-view-coverage-overlay-fallback-03] Street View lifecycle and regression tests — todo
