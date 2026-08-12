---
title: Vietnam Basemap Preview Desktop
description: Specification for a standalone desktop UI to preview Vietnam Basemap sources and styles.
createdAt: '2026-08-11T08:58:35.358Z'
updatedAt: '2026-08-11T09:35:58.097Z'
tags:
  - spec
  - basemap
  - preview
  - desktop
  - approved
---

## Overview

Standalone Basemap Preview là một công cụ desktop riêng dành cho developer/operator để xem trực quan Basemap Platform trước khi tích hợp hoặc phát hành. Công cụ không phụ thuộc vào app nghiệp vụ, không đọc dữ liệu project và không thực hiện thao tác thay đổi release.

Preview hỗ trợ hai nhóm nguồn: package local/offline và nguồn online/LAN. Ở online mode, Google raster tile template là nguồn chính theo một exception chỉ dành cho preview; production Basemap Platform vẫn giữ contract release/service hiện tại.

## Locked Decisions

- D1: Preview là công cụ standalone dành cho developer/operator, tách khỏi luồng dữ liệu nghiệp vụ của app hiện tại.
- D2: MVP được phân phối dưới dạng desktop executable riêng cho Windows, kèm debug symbols khi build debug.
- D3: Preview hỗ trợ cả local package/offline và online/LAN, có source selector trong UI.
- D4: Preview hiển thị và chuyển runtime giữa `engineering`, `light`, `dark`; `engineering` là mặc định.
- D5: MVP chỉ read-only: hiển thị bản đồ, source/style, version, health, manifest summary và attribution; không có validate/activate/rollback.
- D6: Khi ở online mode, Google raster tile là nguồn chính của preview.
- D7: Nếu Google tile không tải được, UI chỉ hiển thị lỗi và yêu cầu operator chọn nguồn khác; không tự động fallback.
- D8: Google online source dùng cố định template `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`; template này chỉ áp dụng cho preview, không thay đổi release contract production.
- D9: Bản đồ hỗ trợ pan/zoom, nút đưa về toàn cảnh Việt Nam và attribution.
- D10: Bản đồ chiếm toàn bộ cửa sổ; controls và metadata mở bằng drawer/modal.
- D11: Giao diện dùng tiếng Việt làm mặc định.
- D12: Local package có thể được chọn bằng file picker trong UI hoặc truyền qua configuration/command line.

## System Decision Impact

- Impact: draft new
- Decision: @decision/20260811-1558-google-raster-tiles-are-preview-only-for-the-standalone-basemap-viewer
- Acceptance gate: Candidate chỉ được xem xét sau khi spec được approve và preview chứng minh được exception Google chỉ tồn tại trong công cụ read-only, không làm thay đổi release package/service/client production; attribution và trạng thái lỗi phải hiển thị rõ.

## Requirements

### Functional Requirements

- FR-1: Desktop preview phải khởi chạy độc lập với app nghiệp vụ và không yêu cầu project, database, IPC hoặc feature/domain data của app hiện tại.
- FR-2: Preview phải cho phép chọn source local/offline hoặc online/LAN từ source selector.
- FR-3: Local source phải nhận package root từ file picker hoặc configuration/command line; package không tương thích phải bị từ chối trước khi render.
- FR-4: Online source mặc định phải dùng đúng Google raster tile template đã khóa ở D8.
- FR-5: Khi online source không tải được, preview phải hiển thị trạng thái lỗi có thể kiểm tra, giữ nguyên trạng thái lỗi và chờ operator chọn source khác; không tự động đổi nguồn.
- FR-6: Preview phải cho phép chuyển giữa ba style `engineering`, `light`, `dark` mà không cần khởi động lại executable.
- FR-7: Preview phải hỗ trợ pan, zoom, reset về toàn cảnh Việt Nam và hiển thị attribution/source hiện tại.
- FR-8: Drawer/modal phải hiển thị tối thiểu source mode, source name, active style, release/manifest version khi có, health/loading/error status và attribution.
- FR-9: Preview không được cung cấp thao tác ghi hoặc lifecycle release như build, validate, activate, rollback; mọi dữ liệu hiển thị là read-only.
- FR-10: Preview phải ghi nhận hoặc hiển thị lỗi khởi tạo source, lỗi manifest/package và lỗi tile theo thông báo có thể chẩn đoán.

### Non-Functional Requirements

- NFR-1: Local/offline mode phải render được sau khi package hợp lệ có sẵn mà không cần Internet, CDN hoặc Google tile.
- NFR-2: Google tile exception chỉ được liên kết với preview executable; không được làm thay đổi manifest, release package, Basemap Service hoặc client adapter production.
- NFR-3: UI phải luôn phân biệt rõ source Google external với source Basemap Platform/local package.
- NFR-4: Build debug phải tạo executable riêng và file debug symbols tương ứng để developer chẩn đoán lỗi.
- NFR-5: Preview không được truy cập hoặc làm thay đổi dữ liệu nghiệp vụ, database hoặc IPC contract của app hiện tại.
- NFR-6: Attribution và source metadata phải hiển thị trong cả trạng thái bản đồ bình thường và drawer thông tin.

## Acceptance Criteria

- [x] AC-1: Có desktop executable standalone mở được màn hình Basemap Preview mà không cần chạy app nghiệp vụ.
- [x] AC-2: Người dùng chuyển được giữa local package và online/LAN source từ UI; local package cũng nhận được qua file picker và configuration/command line.
- [x] AC-3: Online mode dùng đúng Google tile template `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}` và hiển thị nhãn external source/attribution.
- [x] AC-4: Local mode từ package hợp lệ render được không cần Internet; package không tương thích bị từ chối trước khi render.
- [x] AC-5: Người dùng chuyển được giữa `engineering`, `light`, `dark`, với `engineering` là style mặc định.
- [x] AC-6: Pan, zoom và reset về toàn cảnh Việt Nam hoạt động; bản đồ chiếm toàn cửa sổ và controls/metadata mở bằng drawer/modal.
- [x] AC-7: Drawer/modal hiển thị source, style, version/manifest, health/loading/error và attribution đúng trạng thái hiện tại.
- [x] AC-8: Khi Google tile lỗi, UI hiển thị lỗi rõ ràng và không tự động chuyển sang source khác.
- [x] AC-9: Không có nút hoặc code path trong preview để activate, rollback, mutate release hoặc truy cập dữ liệu nghiệp vụ.
- [x] AC-10: Debug build tạo được executable và PDB riêng; smoke test khởi chạy được cả online và local configuration path.

## Scenarios

### Scenario 1: Mở preview online

**Given** operator khởi chạy desktop preview không truyền local package  
**When** chọn online source  
**Then** preview dùng Google tile template mặc định, mở toàn cảnh Việt Nam, hiển thị style engineering và attribution external source.

### Scenario 2: Xem package local

**Given** operator có một release package hợp lệ trên máy  
**When** chọn thư mục package bằng file picker hoặc truyền package root qua configuration  
**Then** preview validate compatibility trước, load style engineering và render không cần Internet.

### Scenario 3: Đổi style

**Given** bản đồ đang hiển thị  
**When** operator chọn light hoặc dark trong drawer  
**Then** style được đổi runtime và source/version metadata vẫn giữ đúng nguồn hiện tại.

### Scenario 4: Google tile lỗi

**Given** online source đã chọn nhưng Google tile request bị lỗi hoặc bị chặn  
**When** preview nhận lỗi source  
**Then** UI hiển thị lỗi có thể chẩn đoán, không tự fallback và cho phép operator mở source selector để chọn nguồn khác.

### Scenario 5: Package không tương thích

**Given** operator chọn package thiếu manifest, sai contract/schema version hoặc thiếu asset  
**When** preview bắt đầu load package  
**Then** preview không render package đó và hiển thị lỗi validation trong drawer.

### Scenario 6: Kiểm tra read-only boundary

**Given** operator đang xem metadata release  
**When** thao tác với preview controls  
**Then** chỉ có các thao tác xem/chọn source/chọn style/reset viewport; không có thay đổi release hoặc dữ liệu project.

## Technical Notes

- Tích hợp nên đi qua typed Basemap adapter/runtime boundary; preview không truy cập storage release hoặc provider implementation trực tiếp từ UI components.
- Có thể tái sử dụng manifest/style/offline validation của standalone `vietnam-basemap/` và giữ Google template ở adapter riêng cho preview.
- Google raster tile exception phải được đánh dấu rõ trong UI và tài liệu vận hành; trách nhiệm attribution/điều kiện sử dụng thuộc operator.
- Chi tiết build pipeline, route/service và release lifecycle của Basemap Platform nằm trong @doc/specs/2026-08-11/vietnam-basemap-platform và @doc/architecture/vietnam-basemap-platform-integration.

## Task Links

- @task-zlmjd5 [vietnam-basemap-preview-desktop-01] Desktop preview shell và launch configuration (done)
- @task-xa5iuq [vietnam-basemap-preview-desktop-02] Local package và Google online source adapters (done)
- @task-g6kor5 [vietnam-basemap-preview-desktop-03] Map canvas, styles và viewport controls (done)
- @task-w4nhf5 [vietnam-basemap-preview-desktop-04] Metadata drawer và read-only boundary (done)
- @task-4r4f8r [vietnam-basemap-preview-desktop-05] Debug packaging và end-to-end verification (done)

## Open Questions

- [ ] Tên hiển thị và icon cuối cùng của executable preview là gì?
