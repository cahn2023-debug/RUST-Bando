---
title: design-canvas-pmp-only
description: Specification for a transparent DESIGN canvas that renders PMP-backed objects and warns about unsaved data.
createdAt: '2026-08-15T09:37:03.740Z'
updatedAt: '2026-08-15T10:44:51.095Z'
tags:
  - spec
  - approved
---

# Specification: Canvas chỉ hiển thị dữ liệu `.pmp`

**Status**: Approved

## Overview

Điều chỉnh canvas của màn hình Thiết kế để loại bỏ hoàn toàn nền hiển thị và chỉ tập trung vào các đối tượng thiết kế. Khi mở dự án, canvas hiển thị các đối tượng đã được lưu trong file `.pmp`; đối tượng mới tạo nhưng chưa lưu vẫn hiển thị trong phiên hiện tại và được đánh dấu là dữ liệu chưa lưu.

Nếu người dùng rời màn hình Thiết kế hoặc đóng/mở dự án mà không lưu, các đối tượng chưa được ghi vào `.pmp` không được xuất hiện lại.

## Locked Decisions

- D1: Canvas hoàn toàn trong suốt; loại bỏ map/GIS, map tile, nền grid và màu nền riêng của canvas.
- D2: Đối tượng mới vẽ nhưng chưa lưu vẫn hiển thị trong phiên hiện tại. Hệ thống phải nhắc người dùng lưu; nếu không lưu thì đối tượng không tồn tại sau khi dự án được mở lại.
- D3: Cảnh báo dữ liệu chưa lưu chỉ xuất hiện khi người dùng đóng/mở dự án hoặc rời màn hình Thiết kế; không hiển thị liên tục trong lúc chỉnh sửa.
- D4: Giữ các lớp hỗ trợ thao tác gồm highlight đối tượng được chọn, điểm điều khiển chỉnh sửa, nhãn đối tượng và đường preview tạm thời.

## System Decision Impact

- Impact: none
- **Decision**: N/A
- **Acceptance gate**: Không yêu cầu System Decision mới; hành vi phải được kiểm tra trên cả dữ liệu đã lưu và dữ liệu chưa lưu.

## Requirements

### Functional Requirements

- **FR-1**: Khi vào màn hình Thiết kế, canvas không được hiển thị hoặc tải bất kỳ nền map/GIS, map tile, ảnh vệ tinh, lớp vector nền, grid hoặc màu nền riêng nào.
- **FR-2**: Khi mở một file `.pmp`, canvas phải hiển thị các đối tượng thiết kế đã được lưu trong file đó theo dữ liệu/geometry hiện có.
- **FR-3**: Đối tượng vừa tạo hoặc chỉnh sửa nhưng chưa lưu phải tiếp tục hiển thị ngay trong phiên hiện tại để người dùng có thể kiểm tra và thao tác tiếp.
- **FR-4**: Hệ thống phải xác định trạng thái có thay đổi chưa lưu và cung cấp thông báo hướng dẫn người dùng lưu dữ liệu `.pmp` khi người dùng rời màn hình Thiết kế hoặc đóng/mở dự án.
- **FR-5**: Nếu người dùng rời màn hình hoặc đóng dự án mà không lưu, lần mở lại file `.pmp` kế tiếp không được hiển thị các đối tượng chỉ tồn tại trong phiên chưa lưu.
- **FR-6**: Các lớp hỗ trợ thao tác gồm selection highlight, edit handles, labels và temporary preview vẫn phải hiển thị đúng trên canvas khi có đối tượng tương ứng; các lớp này không được bị xem là nền và không bị loại bỏ bởi FR-1.
- **FR-7**: Việc loại bỏ nền không được làm thay đổi dữ liệu, vị trí, geometry, thuộc tính, selection hoặc khả năng lưu của các đối tượng thiết kế.

### Non-Functional Requirements

- **NFR-1**: Canvas không phát sinh yêu cầu mạng hoặc tải tài nguyên bản đồ nền khi mở màn hình Thiết kế.
- **NFR-2**: Thông báo chưa lưu phải rõ ràng, cho phép người dùng nhận biết rằng dữ liệu chưa lưu sẽ mất sau khi mở lại dự án.
- **NFR-3**: Thay đổi chỉ áp dụng cho vùng canvas của màn hình Thiết kế; các nền/lớp bản đồ ở màn hình hoặc tính năng khác không nằm trong phạm vi này.

## Acceptance Criteria

- [x] **AC-1**: Khi mở màn hình Thiết kế, canvas trong suốt và không có map tile, ảnh vệ tinh, lớp GIS, grid hoặc màu nền canvas; chỉ vùng giao diện ứng dụng bên ngoài canvas mới có thể giữ styling riêng.
- [x] **AC-2**: Khi mở file `.pmp` có dữ liệu đã lưu, toàn bộ đối tượng hợp lệ được lưu trong file hiển thị trên canvas ở đúng vị trí và geometry.
- [x] **AC-3**: Khi người dùng tạo một đối tượng mới nhưng chưa lưu, đối tượng xuất hiện ngay trên canvas trong phiên hiện tại.
- [x] **AC-4**: Khi người dùng rời màn hình Thiết kế hoặc đóng/mở dự án trong lúc có thay đổi chưa lưu, hệ thống hiển thị thông báo yêu cầu lưu và nêu rõ dữ liệu sẽ không tồn tại sau khi mở lại nếu không lưu.
- [x] **AC-5**: Nếu người dùng bỏ qua việc lưu và mở lại file `.pmp`, đối tượng chưa từng được lưu không xuất hiện; nếu người dùng lưu trước khi đóng/rời, đối tượng xuất hiện lại từ dữ liệu `.pmp`.
- [x] **AC-6**: Khi chọn hoặc chỉnh sửa đối tượng, highlight, điểm điều khiển, nhãn và preview tạm thời vẫn hoạt động; chúng không bị xóa cùng với nền.
- [x] **AC-7**: Trong khi người dùng chỉ đang chỉnh sửa bình thường trên canvas, không xuất hiện cảnh báo chưa lưu liên tục hoặc lặp lại ngoài các thời điểm đã chốt ở D3.

## Scenarios

### Scenario 1: Mở dự án chỉ hiển thị dữ liệu `.pmp`

**Given** file `.pmp` chứa các đối tượng thiết kế đã lưu
**When** người dùng mở dự án và vào màn hình Thiết kế
**Then** canvas trong suốt chỉ hiển thị các đối tượng từ file `.pmp`, không hiển thị bất kỳ nền bản đồ/grid nào.

### Scenario 2: Đối tượng chưa lưu vẫn hiển thị trong phiên hiện tại

**Given** người dùng đang ở màn hình Thiết kế
**When** người dùng tạo hoặc chỉnh sửa một đối tượng nhưng chưa lưu
**Then** đối tượng vẫn hiển thị và có thể được chọn/chỉnh sửa trong phiên hiện tại.

### Scenario 3: Cảnh báo khi rời màn hình có dữ liệu chưa lưu

**Given** phiên hiện tại có ít nhất một thay đổi chưa được lưu vào `.pmp`
**When** người dùng rời màn hình Thiết kế hoặc đóng/mở dự án
**Then** hệ thống hiển thị thông báo hướng dẫn lưu và cảnh báo rằng bỏ qua lưu sẽ làm mất dữ liệu sau khi mở lại.

### Scenario 4: Mở lại sau khi không lưu

**Given** người dùng đã tạo một đối tượng nhưng chọn rời/đóng dự án mà không lưu
**When** người dùng mở lại cùng file `.pmp`
**Then** đối tượng chưa lưu không xuất hiện trên canvas.

### Scenario 5: Giữ lớp hỗ trợ thao tác

**Given** canvas có đối tượng được chọn hoặc đang chỉnh sửa
**When** nền canvas đã được loại bỏ
**Then** selection highlight, edit handles, labels và preview tạm thời vẫn hiển thị và hoạt động bình thường.

## Technical Notes

- Dữ liệu bền vững của canvas là state/feature được hydrate từ file `.pmp`; state runtime chưa lưu chỉ có hiệu lực trong phiên hiện tại.
- Cần phân biệt việc canvas không có nền với các lớp overlay phục vụ tương tác để không ẩn nhầm selection/edit/preview.
- Phạm vi triển khai tập trung vào canvas và vòng đời dữ liệu của màn hình Thiết kế; không mở rộng sang thay đổi nền của các màn hình khác.

## Task Links

- @task-2i7vua [design-canvas-pmp-only-01] Remove DESIGN canvas background — done
- @task-axtx3f [design-canvas-pmp-only-02] Render PMP-backed and unsaved design objects — done
- @task-rfjg63 [design-canvas-pmp-only-03] Warn about unsaved DESIGN data on exit — done
- @task-pisu44 [design-canvas-pmp-only-04] Preserve DESIGN overlays and add regression coverage — done

## Open Questions

Không còn câu hỏi mở. Các quyết định D1–D4 đã được chốt.
