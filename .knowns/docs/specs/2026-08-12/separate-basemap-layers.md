---
title: Separate Basemap Layers
description: Specification for independently separated basemap layers across Google Street, Google Hybrid, and Local package sources.
createdAt: '2026-08-12T13:17:50.887Z'
updatedAt: '2026-08-12T13:58:01.919Z'
tags:
  - spec
  - basemap
  - layers
  - preview
  - approved
---

## Overview

Tách các thành phần bản đồ nền thành các layer độc lập để người dùng có thể bật/tắt đồng thời nhiều layer mà không làm các layer khác tự động tắt. Tính năng áp dụng cho Google Street, Google Hybrid và Local package trong Vietnam Basemap Preview.

Vấn đề hiện tại: khi chọn hoặc bỏ chọn một layer, nguồn bản đồ vẫn hiển thị toàn bộ nội dung vì nhiều thành phần đang nằm chung trong một raster composite hoặc chưa được ánh xạ thành các layer MapLibre độc lập.

## Locked Decisions

- D1: Các layer hoạt động độc lập; người dùng có thể bật/tắt nhiều layer cùng lúc. Chọn một layer không tự động tắt layer khác.
- D2: Local package hỗ trợ 8 nhóm theo thứ tự cố định: Nền đất, Nước, Ranh giới, Đường, Nhãn, POI, Công trình, Địa hình.
- D3: Phạm vi áp dụng gồm Google Street, Google Hybrid và Local package.
- D4: Khi tắt toàn bộ layer, Google Street/Hybrid vẫn giữ raster nền; Local package có thể hiển thị nền trống.
- D5: Google dùng tile/overlay riêng kết hợp apistyle; các nhóm Google hỗ trợ được tách chính xác, còn phần nền không hỗ trợ riêng vẫn thuộc raster nền chung.
- D6: Với Local package, nhóm không tồn tại trong style được ẩn khỏi danh sách layer.
- D7: Mặc định khôi phục trạng thái lần dùng trước; nếu chưa có trạng thái thì bật tất cả layer có sẵn.
- D8: Trạng thái layer được lưu riêng theo từng nguồn Google Street, Google Hybrid và Local package.
- D9: Với Google, chỉ hiển thị các nhóm có thể điều khiển chính xác; nhóm không hỗ trợ bị ẩn khỏi UI.
- D10: Google Street/Hybrid hiển thị riêng Đường, Nhãn, POI và Ranh giới.
- D11: Local package phân nhóm theo source-layer/ID chuẩn: landcover, water, boundary, transportation, place, poi, building, terrain/contour.
- D12: Thay đổi layer áp dụng ngay lập tức, không cần nút Áp dụng.
- D13: Danh sách layer dùng thứ tự cố định: Nền đất → Nước → Ranh giới → Đường → Nhãn → POI → Công trình → Địa hình.
- D14: Ranh giới Google phải là overlay riêng và bật/tắt độc lập.
- D15: Nếu không có tile/overlay ranh giới Google tách chính xác, ẩn layer Ranh giới khỏi Google.
- D16: Khi chuyển nguồn, lưu trạng thái nguồn cũ và khôi phục khi quay lại.
- D17: Tất cả Local package dùng chung một trạng thái layer.
- D18: Checkbox của một nhóm Local package điều khiển toàn bộ layer con thuộc nhóm đó.
- D19: Layer Local package không khớp nhóm chuẩn giữ hiển thị mặc định và không xuất hiện trong danh sách checkbox.
- D20: Khi đang tải hoặc chưa xác định layer khả dụng, hiển thị “Đang tải layer…” và khóa checkbox.
- D21: Khi thay đổi chưa áp dụng xong, giữ lựa chọn checkbox và hiển thị “Đang cập nhật…”.
- D22: Nếu cập nhật thất bại, giữ lựa chọn người dùng, hiển thị cảnh báo lỗi và cho phép thử lại.

## System Decision Impact

- Impact: existing
- Decision: @decision/20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
- Acceptance gate: Xác nhận Google vẫn chỉ được dùng cho Basemap Preview read-only, attribution vẫn hiển thị, lỗi tile không tự động fallback, và thay đổi không đưa Google dependency vào production Basemap Platform hoặc release package.

## Requirements

### Functional Requirements

- FR-1: UI hiển thị các layer khả dụng của nguồn hiện tại theo thứ tự cố định D13.
- FR-2: Mỗi checkbox điều khiển độc lập nhóm layer tương ứng; bật/tắt một nhóm không thay đổi trạng thái các nhóm khác.
- FR-3: Thay đổi checkbox được phản ánh ngay trên bản đồ và không yêu cầu reload toàn bộ bản đồ hoặc đổi viewport.
- FR-4: Google Street/Hybrid chỉ hiển thị các checkbox Đường, Nhãn, POI và Ranh giới khi nguồn tương ứng có cơ chế tách chính xác.
- FR-5: Google giữ raster nền khi các lớp thông tin bị tắt; Ranh giới Google chỉ xuất hiện khi có overlay riêng chính xác.
- FR-6: Local package ánh xạ các layer theo source-layer/ID chuẩn của D11. Một checkbox phải điều khiển toàn bộ layer con cùng nhóm.
- FR-7: Local package ẩn các nhóm không có layer tương ứng; layer không khớp nhóm chuẩn vẫn hiển thị mặc định và không được đưa vào danh sách checkbox.
- FR-8: Trạng thái layer được lưu và khôi phục theo D7, D8, D16 và D17.
- FR-9: Khi layer availability chưa sẵn sàng, UI hiển thị trạng thái tải và khóa thao tác.
- FR-10: Khi cập nhật đang thực hiện, UI hiển thị trạng thái cập nhật; khi thất bại, UI giữ lựa chọn, hiển thị lỗi và cung cấp thao tác thử lại.

### Non-Functional Requirements

- NFR-1: Việc bật/tắt layer không làm mất tâm bản đồ, zoom, marker, trạng thái đo khoảng cách hoặc dữ liệu extent hiện tại.
- NFR-2: Tách layer phải dùng contract có thể kiểm thử cho cả nguồn Google và Local package; không phụ thuộc vào việc người dùng đoán tên layer.
- NFR-3: Google source và attribution/error-only policy hiện tại không được mở rộng thành dependency của production Basemap Platform.
- NFR-4: Các trạng thái tải, cập nhật và lỗi phải được đọc được bằng UI automation/accessibility semantics.

## Acceptance Criteria

- [x] AC-1: Khi bật/tắt một layer, các layer khác giữ nguyên trạng thái và vẫn hiển thị độc lập.
- [x] AC-2: Local package hiển thị đúng các nhóm có dữ liệu theo mapping D11, theo đúng thứ tự D13.
- [x] AC-3: Local package ẩn nhóm không tồn tại; layer không khớp mapping vẫn hiển thị và không có checkbox.
- [x] AC-4: Google Street/Hybrid hiển thị riêng Đường, Nhãn, POI và chỉ hiển thị Ranh giới khi có overlay tách chính xác.
- [x] AC-5: Tắt toàn bộ layer thông tin của Google vẫn giữ raster nền; Local package có thể trở thành nền trống.
- [x] AC-6: Tất cả thay đổi được áp dụng ngay lập tức mà không reload toàn bộ map hoặc làm mất viewport.
- [x] AC-7: Trạng thái layer được khôi phục sau khi đổi nguồn và quay lại; Local package dùng chung trạng thái giữa các package.
- [x] AC-8: Lần đầu chưa có cấu hình, tất cả layer khả dụng được bật.
- [x] AC-9: Trong lúc tải layer, UI hiển thị “Đang tải layer…” và khóa checkbox.
- [x] AC-10: Trong lúc cập nhật, UI hiển thị “Đang cập nhật…” nhưng giữ lựa chọn checkbox.
- [x] AC-11: Khi cập nhật lỗi, UI giữ lựa chọn, hiển thị cảnh báo và có thao tác thử lại.
- [x] AC-12: Test tự động xác nhận Google vẫn là preview-only, attribution/error policy không đổi, và không có fallback production.

## Scenarios

### Scenario 1: Bật nhiều layer độc lập

**Given** nguồn hiện tại có các layer Đường, Nhãn và POI

**When** người dùng tắt Nhãn nhưng bật Đường và POI

**Then** Đường và POI vẫn hiển thị, Nhãn biến mất, và trạng thái hai layer còn lại không thay đổi

### Scenario 2: Local package không có đủ nhóm

**Given** Local package chỉ có landcover, water, transportation và poi

**When** style được tải xong

**Then** UI chỉ hiển thị Nền đất, Nước, Đường và POI theo thứ tự D13; các nhóm còn lại bị ẩn

### Scenario 3: Layer Local package không khớp chuẩn

**Given** style có một layer custom không khớp source-layer/ID chuẩn

**When** style được tải xong

**Then** layer custom vẫn hiển thị mặc định và không xuất hiện trong danh sách checkbox

### Scenario 4: Google không có overlay ranh giới chính xác

**Given** Google Street/Hybrid không cung cấp overlay chỉ chứa ranh giới

**When** UI dựng danh sách layer Google

**Then** UI hiển thị Đường, Nhãn và POI; không hiển thị checkbox Ranh giới

### Scenario 5: Tắt toàn bộ layer thông tin Google

**Given** Google Street/Hybrid đang hiển thị raster nền cùng các lớp thông tin

**When** người dùng tắt tất cả layer thông tin khả dụng

**Then** raster nền vẫn hiển thị và bản đồ không trở thành màn hình trống

### Scenario 6: Đổi nguồn và khôi phục trạng thái

**Given** Google Street có Đường tắt và POI bật

**When** người dùng chuyển sang Google Hybrid rồi quay lại Google Street

**Then** trạng thái Đường tắt và POI bật được khôi phục; trạng thái Google Hybrid được lưu độc lập

### Scenario 7: Local package dùng chung trạng thái

**Given** người dùng đã tắt Nước trong một Local package

**When** người dùng mở một Local package khác

**Then** trạng thái Local package dùng chung vẫn ghi nhận Nước đang tắt, trong giới hạn các nhóm thực sự tồn tại của package mới

### Scenario 8: Đang tải và cập nhật lỗi

**Given** style hoặc layer metadata chưa tải xong

**When** người dùng mở panel layer

**Then** UI hiển thị “Đang tải layer…” và khóa checkbox

**Given** người dùng đã tắt một layer nhưng tile/source chưa áp dụng xong

**When** quá trình cập nhật đang diễn ra hoặc thất bại

**Then** UI hiển thị “Đang cập nhật…”; nếu thất bại, giữ lựa chọn, hiển thị cảnh báo và cho phép thử lại

## Technical Notes

- Nguồn Google hiện tại là raster composite. Việc tách độc lập phải dựa trên các tile/layer overlay thực sự có thể tách và apistyle; không coi việc đổi visibility của một raster composite là đã tách layer.
- Local package dùng style MapLibre v8 và phân nhóm từ source-layer/ID; cần áp dụng một checkbox cho toàn bộ layer con cùng nhóm.
- Khi đổi visibility, giữ nguyên camera và các state tương tác hiện tại.
- Không thay đổi phạm vi Google preview-only hoặc thêm Google tile dependency vào production contract.

## Task Links

- @task-mwmawd [separate-basemap-layers-01] Layer capability model and Local package mapping (todo)
- @task-kqgtq3 [separate-basemap-layers-02] Independent Google and Local layer rendering (todo)
- @task-dwyxu3 [separate-basemap-layers-03] Layer UI persistence and update states (todo)
- @task-dmm2m5 [separate-basemap-layers-04] Layer integration tests and spec verification (todo)

## Open Questions

Không còn câu hỏi mở; các giới hạn Google ranh giới và hành vi khi không hỗ trợ đã được khóa trong D14–D15.
