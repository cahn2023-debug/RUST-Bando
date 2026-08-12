---
title: Vietnam Basemap Preview Workspace Consolidation
description: Specification for consolidating vietnam-basemap into vietnam-basemap-preview and archiving legacy application code in BAK.
createdAt: '2026-08-12T10:37:20.846Z'
updatedAt: '2026-08-12T11:08:07.704Z'
tags:
  - spec
  - basemap
  - preview
  - workspace
  - migration
  - approved
---

## Overview

Hợp nhất workspace standalone `vietnam-basemap` vào `vietnam-basemap-preview` để tạo một workspace mới chứa cả nền tảng Vietnam Basemap và ứng dụng preview desktop. Code ứng dụng cũ ở repository root được lưu an toàn trong `BAK`; không xóa dữ liệu cũ. Các artifact và nội dung không liên quan trong `dist/` được giữ nguyên.

## Locked Decisions

- D1: Workspace đích duy nhất cho basemap preview/platform là `vietnam-basemap-preview/` ở repository root.
- D2: Di chuyển toàn bộ nội dung hiện tại của `vietnam-basemap/` vào `vietnam-basemap-preview/`, giữ nguyên cấu trúc tương đối của assets, builder, contracts, crates, docs, styles và Cargo workspace.
- D3: Code ứng dụng cũ hiện tại được lưu dưới một snapshot riêng trong `BAK/`; việc lưu snapshot phải hoàn tất và kiểm tra được trước khi loại bỏ code cũ khỏi vị trí active.
- D4: Cập nhật các đường dẫn build, test, Tauri, npm script, README và cấu hình cần thiết để workspace mới chạy độc lập từ `vietnam-basemap-preview/`.
- D5: Không xóa hoặc ghi đè các artifact không liên quan đang có trong `dist/`; artifact build của preview tiếp tục có vị trí rõ ràng, không được trộn với source workspace.
- D6: Không thay đổi contract/chức năng runtime của Vietnam Basemap Platform hoặc preview ngoài thay đổi đường dẫn workspace và cách khởi chạy.

## System Decision Impact

- Impact: none
- Decision: Không tạo hoặc thay đổi System Decision; đây là thay đổi tổ chức source/build và không bổ sung guidance lâu dài.
- Acceptance gate: Xác nhận bằng diff, kiểm tra boundary và toàn bộ build/test của workspace mới.

## Requirements

### Functional Requirements

- FR-1: `vietnam-basemap-preview/` phải chứa đầy đủ source hiện tại của preview và toàn bộ source/assets/docs/config hiện tại của `vietnam-basemap/`.
- FR-2: Cargo workspace trong workspace mới phải resolve được toàn bộ crates platform bằng manifest tương đối, không phụ thuộc vào `../vietnam-basemap`.
- FR-3: Preview frontend/Tauri phải build, test và chạy từ `vietnam-basemap-preview/` bằng các lệnh documented trong README.
- FR-4: Các root-level script/config liên quan phải trỏ tới workspace mới; không còn đường dẫn active yêu cầu thư mục `vietnam-basemap/` cũ.
- FR-5: Code ứng dụng cũ được lưu trong `BAK/` theo một snapshot riêng, giữ nguyên khả năng khôi phục và không bị trộn với source workspace mới.
- FR-6: Thư mục `vietnam-basemap/` cũ không còn tồn tại sau khi di chuyển thành công; không được xóa trước khi snapshot và kiểm tra đích hoàn tất.
- FR-7: `dist/` hiện có và các artifact không liên quan phải vẫn tồn tại; artifact preview mới được ghi vào vị trí được cấu hình rõ ràng.

### Non-Functional Requirements

- NFR-1: Di chuyển phải bảo toàn nội dung file, tên file, quyền/metadata phù hợp trên Windows và không tạo file trùng hoặc mất file do va chạm tên.
- NFR-2: Workspace mới phải có dependency boundary rõ ràng, không vô tình kéo source ứng dụng cũ vào build preview/platform.
- NFR-3: Có thể kiểm tra rollback bằng cách đối chiếu snapshot `BAK/` với trạng thái trước di chuyển.
- NFR-4: Kết quả phải vượt qua kiểm tra whitespace/diff và các quality gate hiện có trong phạm vi workspace.

## Acceptance Criteria

- [ ] AC-1: Tồn tại `vietnam-basemap-preview/` với preview hiện tại và đầy đủ các nhóm nội dung platform từ `vietnam-basemap/`: `assets`, `builder`, `contracts`, `crates`, `docs`, `styles`, `Cargo.toml`, `Cargo.lock`, README.
- [ ] AC-2: `cargo metadata --manifest-path vietnam-basemap-preview/Cargo.toml --no-deps` resolve thành công toàn bộ platform crates và Tauri preview không có đường dẫn tới workspace cũ.
- [ ] AC-3: Từ `vietnam-basemap-preview/`, TypeScript typecheck, Vitest, Vite build, Cargo fmt/check/test đều chạy thành công theo README.
- [ ] AC-4: Các npm/build/debug/verification script liên quan đến preview dùng workspace mới và tạo artifact đúng vị trí; không còn tham chiếu active tới `vietnam-basemap/`.
- [ ] AC-5: Snapshot code cũ tồn tại trong `BAK/` với manifest/danh sách file hoặc cấu trúc đủ để kiểm tra, và không có file cũ bị xóa trước khi snapshot hoàn tất.
- [ ] AC-6: `vietnam-basemap/` cũ không còn là thư mục active sau migration; `dist/` và artifact không liên quan hiện có vẫn nguyên vẹn.
- [ ] AC-7: Kiểm tra boundary xác nhận preview/platform workspace không import hoặc build source ứng dụng cũ; diff không có file ngoài phạm vi ngoại trừ các đường dẫn/config cần cập nhật.
- [ ] AC-8: README của workspace mới mô tả rõ vị trí workspace, lệnh build/test, vị trí artifact và cách khôi phục snapshot BAK.

## Scenarios

### Scenario 1: Build platform từ workspace mới

**Given** repository chỉ còn workspace platform/preview hợp nhất tại `vietnam-basemap-preview/`
**When** operator chạy Cargo checks với manifest trong workspace mới
**Then** tất cả platform crates resolve và build/test thành công mà không cần `vietnam-basemap/` bên ngoài.

### Scenario 2: Build preview desktop

**Given** workspace mới chứa frontend và `src-tauri/`
**When** operator chạy typecheck, Vitest, Vite build và Tauri debug build theo README
**Then** preview build thành công và artifact được tạo ở vị trí documented.

### Scenario 3: Rollback code ứng dụng cũ

**Given** code ứng dụng cũ đã được snapshot vào `BAK/`
**When** operator đối chiếu snapshot với danh sách source trước migration
**Then** các file cũ có thể xác nhận là còn đủ để khôi phục, không bị xóa vĩnh viễn.

### Scenario 4: Giữ artifact hiện có

**Given** `dist/` đã có artifact hoặc nội dung khác
**When** migration và build workspace mới hoàn tất
**Then** nội dung không liên quan trong `dist/` vẫn tồn tại và không bị workspace source ghi đè ngoài vị trí artifact đã định.

### Scenario 5: Boundary không bị rò rỉ

**Given** workspace mới đã cập nhật các manifest/script/config
**When** chạy kiểm tra tham chiếu và build boundary
**Then** không còn active reference tới `vietnam-basemap/` cũ và preview không phụ thuộc source ứng dụng cũ.

## Technical Notes

- Giữ nguyên tên workspace package/crate hiện có nếu không bắt buộc phải đổi để tránh thay đổi contract.
- Ưu tiên cập nhật manifest/config/script bằng đường dẫn tương đối từ workspace mới.
- Snapshot BAK nên dùng thư mục có timestamp/mục đích rõ ràng bên dưới `BAK/` để không va chạm với các archive hiện có.
- Các file Knowns-managed không được chỉnh sửa thủ công; task/spec state phải cập nhật qua Knowns.

## Task Links

Chưa tạo task; sẽ lập task sau khi spec được approve.

## Open Questions

Không còn open question trong phạm vi đã xác nhận.


## Task Links

- @task-93exbv [vietnam-basemap-preview-workspace-consolidation-01] Snapshot legacy application into BAK — todo
- @task-w22s0l [vietnam-basemap-preview-workspace-consolidation-02] Merge Vietnam Basemap platform into preview workspace — todo
- @task-cso903 [vietnam-basemap-preview-workspace-consolidation-03] Rewire standalone build scripts and documentation — todo
- @task-8hjx25 [vietnam-basemap-preview-workspace-consolidation-04] Verify workspace boundaries and integrated migration — todo


## Execution Status

- @task-93exbv — done
- @task-w22s0l — done
- @task-cso903 — done
- @task-8hjx25 — done

SDD verification: 0 errors, 0 warnings. All linked tasks declare System Decision Impact: none and Spec Decision Compliance D1-D6=pass.
