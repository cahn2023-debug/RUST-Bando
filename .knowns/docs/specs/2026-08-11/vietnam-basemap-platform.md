---
title: Vietnam Basemap Platform
description: Specification for a standalone Vietnam basemap platform and reusable basemap service.
createdAt: '2026-08-11T06:12:12.673Z'
updatedAt: '2026-08-11T07:43:15.067Z'
tags:
  - spec
  - approved
  - basemap
  - maplibre
  - rust
---

## Overview

Vietnam Basemap Platform là một platform độc lập để xây dựng, phát hành và phục vụ basemap Việt Nam cho nhiều ứng dụng Rust, web và desktop. Platform tách khỏi dữ liệu nghiệp vụ của từng project, hỗ trợ cả local/offline và LAN/server, đồng thời không phụ thuộc tile API trả phí hoặc tile server công cộng.

Phạm vi gồm pipeline dữ liệu đa nguồn, release package có version, Basemap Service và contract tích hợp online/offline. Frontend hiện tại đã dùng MapLibre và có BasemapRuntime/BasemapProvider; việc tích hợp phải đi qua boundary adapter hiện có theo @doc/architecture/frontend và @doc/architecture/project-summary-current-state.

## Locked Decisions

- D1: MVP là Basemap Platform đầy đủ, gồm pipeline dữ liệu, release package, runtime service và contract dùng chung.
- D2: Platform chạy được ở cả local/offline và LAN/server.
- D3: Phạm vi địa lý là toàn bộ Việt Nam kèm vùng đệm hiển thị xung quanh.
- D4: MVP có bộ lớp nền kỹ thuật đầy đủ: giao thông, đường sắt, nước, landuse/landcover, công trình, ranh giới hành chính, địa danh, nhãn, POI, sân bay và bến phà.
- D5: Pipeline hỗ trợ nhiều nguồn dữ liệu cấu hình được; OSM là nguồn mặc định ban đầu.
- D6: Cập nhật là manual release có kiểm duyệt trước khi publish.
- D7: Mỗi release là immutable; platform có active-version pointer và hỗ trợ rollback.
- D8: Client online dùng API; client offline dùng package cục bộ; cả hai tuân theo manifest/version contract chung.
- D9: MVP cung cấp \`light\`, \`dark\` và \`engineering\`; \`engineering\` là style mặc định.
- D10: Font tiếng Việt, glyphs và sprite được self-host trong release; runtime không phụ thuộc CDN.
- D11: Platform không tự động kiểm tra license/attribution; operator của từng pipeline chịu trách nhiệm tuân thủ.
- D12: Release phải vượt qua validation tự động và health smoke test trước khi active.
- D13: Release active hiện tại được giữ nguyên nếu release mới không đạt validation hoặc gặp lỗi.

## System Decision Impact

- Impact: draft new
- Decision: @decision/20260811-1311-standalone-vietnam-basemap-platform-and-release-contract
- Acceptance gate: Decision chỉ được chuyển sang accepted sau khi các task liên kết chứng minh contract online/offline, release validation, active-version rollback và boundary với dữ liệu nghiệp vụ hoạt động đúng.

## Requirements

### Functional Requirements

- FR-1: Platform phải có lifecycle độc lập với các project nghiệp vụ và không lưu feature, node, line, metadata hoặc dữ liệu domain riêng của từng project trong basemap release.
- FR-2: Pipeline phải cho phép khai báo nhiều nguồn dữ liệu; mỗi release phải ghi nhận source identity và metadata do operator cung cấp. OSM Vietnam là nguồn mặc định cho baseline.
- FR-3: Pipeline phải tạo được release package chứa dữ liệu tile, manifest, styles, font/glyph và sprite cần thiết để client sử dụng basemap.
- FR-4: Release phải bao phủ toàn bộ lãnh thổ Việt Nam và vùng đệm địa lý đã xác định.
- FR-5: Release phải cung cấp các lớp dữ liệu D4 và các nhãn cần thiết cho việc hiển thị basemap kỹ thuật.
- FR-6: Service/package phải cung cấp ba style chuẩn \`light\`, \`dark\` và \`engineering\`; manifest phải xác định style mặc định là \`engineering\`.
- FR-7: Client offline phải có thể tải font/glyph và sprite từ release package cục bộ, không cần CDN hoặc external asset runtime.
- FR-8: Client online phải có contract ổn định để lấy manifest, danh sách/chi tiết style, tile, font/glyph, sprite, version và health. Contract phải che giấu đường dẫn file vật lý của release.
- FR-9: Client offline phải có thể sử dụng cùng manifest/version contract từ package cục bộ và xác định compatibility trước khi render.
- FR-10: Pipeline phải hỗ trợ quy trình candidate release → validation → manual approval → publish/activate; không được tự động thay thế active version trước bước approval.
- FR-11: Release đã publish phải bất biến; việc chuyển active chỉ thay đổi pointer/version metadata, không sửa nội dung release cũ.
- FR-12: Platform phải hỗ trợ rollback về một release bất biến trước đó mà không cần rebuild dữ liệu.
- FR-13: Validation phải kiểm tra tối thiểu tính đầy đủ và hợp lệ của manifest, tile package, styles, font/glyph, sprite và health của service trước khi active.
- FR-14: Nếu candidate release fail validation hoặc health smoke test, service phải tiếp tục phục vụ release active trước đó và báo trạng thái candidate lỗi.
- FR-15: Manifest hoặc metadata release phải chứa thông tin source, version, coverage, schema/contract version, style mặc định và attribution do operator khai báo; platform không tự phán quyết tính hợp pháp của metadata đó.
- FR-16: Service phải cung cấp health/version status để operator và client phân biệt release đang active, candidate và trạng thái lỗi.
- FR-17: Contract phải cho phép nhiều client độc lập dùng cùng một release mà không làm thay đổi nội dung release hoặc dữ liệu của client khác.

### Non-Functional Requirements

- NFR-1: Basemap phải render được trong môi trường offline sau khi package đã có sẵn trên máy; không được có dependency bắt buộc vào external tile, font, sprite hoặc CDN runtime.
- NFR-2: Online và offline integration phải dùng cùng semantics về version, style name, asset identity và compatibility.
- NFR-3: Release artifact và active pointer phải có thể audit được theo version, source metadata và thời điểm publish.
- NFR-4: Việc thay đổi basemap không được làm thay đổi schema, event flow hoặc dữ liệu canonical của project nghiệp vụ hiện tại.
- NFR-5: Service phải có hành vi an toàn khi release mới lỗi: release đang active tiếp tục phục vụ được cho đến khi có release mới vượt qua gate.
- NFR-6: Các client hiện tại tích hợp basemap phải tiếp tục giữ boundary typed adapter; component không truy cập trực tiếp file release hoặc tile provider implementation.

## Acceptance Criteria

- [x] AC-1: Có một release package mẫu bao phủ Việt Nam và vùng đệm, chứa đủ các lớp D4, ba style chuẩn, manifest, font/glyph và sprite.
- [x] AC-2: Pipeline có thể chọn OSM làm nguồn mặc định và khai báo ít nhất một nguồn bổ sung theo cấu hình mà không thay đổi contract của client.
- [x] AC-3: Một candidate release chỉ trở thành active sau khi validation tự động, health smoke test và manual approval đều đạt.
- [x] AC-4: Client online lấy được manifest, style, tile, font/glyph, sprite, version và health qua contract; không cần biết đường dẫn file vật lý.
- [x] AC-5: Client offline dùng package cục bộ với cùng manifest/version contract và render được không cần Internet hoặc CDN.
- [x] AC-6: Hai release bất biến có thể cùng tồn tại; active pointer có thể chuyển từ release mới về release trước mà không rebuild.
- [x] AC-7: Khi candidate fail validation/health, release active trước đó vẫn được phục vụ và không bị sửa hoặc thay thế.
- [x] AC-8: Manifest của release ghi nhận source, version, coverage, contract/schema version, style mặc định và attribution do operator khai báo.
- [x] AC-9: Basemap release không chứa dữ liệu feature/domain riêng của project nghiệp vụ và không làm thay đổi database/IPC contract hiện tại.
- [x] AC-10: Service có endpoint/status để xác định active version, candidate validation result và health hiện tại.

## Scenarios

### Scenario 1: Build và publish release hợp lệ

**Given** operator đã cấu hình OSM và một nguồn dữ liệu bổ sung, cùng phạm vi Việt Nam + vùng đệm  
**When** operator chạy pipeline, validation, health smoke test và manual approval đều đạt  
**Then** platform tạo một immutable release, cập nhật active pointer và client nhận được manifest của version mới.

### Scenario 2: Sử dụng offline

**Given** client desktop đã có một release package hợp lệ  
**When** client khởi động trong môi trường không có Internet  
**Then** client đọc manifest, chọn style và tải tile/font/glyph/sprite từ package cục bộ mà không gọi external asset.

### Scenario 3: Candidate không hợp lệ

**Given** một candidate release thiếu asset hoặc health smoke test thất bại  
**When** operator cố gắng activate candidate  
**Then** platform từ chối activate, giữ nguyên active version trước đó và ghi trạng thái lỗi có thể kiểm tra được.

### Scenario 4: Rollback

**Given** release R2 đã active nhưng phát hiện lỗi sau publish và release R1 vẫn còn nguyên  
**When** operator yêu cầu rollback  
**Then** active pointer chuyển về R1, client tiếp tục dùng contract tương thích của R1 và không cần rebuild.

### Scenario 5: Client online tích hợp qua contract

**Given** client web dùng Basemap Service qua LAN/server  
**When** client lấy manifest và chọn style \`engineering\`  
**Then** client có thể lấy các asset/tile tương ứng qua service contract mà không truy cập trực tiếp storage.

## Technical Notes

- Kiến trúc tham chiếu từ yêu cầu hiện tại là data source → build pipeline → vector tile release package → Basemap Service → MapLibre clients.
- PMTiles/MVT, Planetiler, Martin và Rust/Axum là các ứng viên triển khai được đề xuất trong tài liệu đầu vào; lựa chọn cụ thể thuộc bước planning và không phải Locked Decision của spec này.
- Basemap không bao gồm camera, intersection, cabinet, fiber, duct, pole, equipment hoặc project point/line của ứng dụng nghiệp vụ.
- Tích hợp với frontend hiện tại cần đi qua BasemapRuntime/BasemapProvider và typed adapter boundary đã ghi nhận trong @doc/architecture/frontend.
- Quy tắc license/attribution là trách nhiệm của operator pipeline; spec này chỉ yêu cầu metadata được khai báo trong release, không biến platform thành công cụ tư vấn pháp lý.

## Task Links

- @task-eudf3a [vietnam-basemap-platform-01] Basemap package và manifest contract (done)
- @task-l4pkjd [vietnam-basemap-platform-02] Multi-source Vietnam data pipeline (done)
- @task-3cldug [vietnam-basemap-platform-03] Styles và self-hosted assets (done)
- @task-5m9287 [vietnam-basemap-platform-04] Online Basemap Service API (done)
- @task-qix90y [vietnam-basemap-platform-05] Offline package integration (done)
- @task-cg4bdi [vietnam-basemap-platform-06] Release validation, activation và rollback (done)
- @task-5n9tjd [vietnam-basemap-platform-07] MapLibre client integration và operational docs (done)

## Open Questions

- [ ] Những nguồn dữ liệu cụ thể nào ngoài OSM phải có trong release MVP?
- [ ] Basemap Platform sẽ nằm trong workspace hiện tại hay là repository/service độc lập bên cạnh workspace?
- [ ] LAN/server MVP có cần authentication, authorization hoặc giới hạn client không?
- [ ] Có cần phát hành Rust/TypeScript SDK cùng MVP, hay raw contract là đủ?
- [ ] Quy tắc retention cho immutable releases là giữ vô hạn hay có chính sách archive riêng?
