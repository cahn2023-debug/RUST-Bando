---
title: Active Code Workspace Standardization
description: Specification for canonical active-code layout, software tabs and shared data coordination.
createdAt: '2026-08-14T07:44:10.514Z'
updatedAt: '2026-08-14T08:57:07.150Z'
tags:
  - spec
  - approved
---

## Overview

Đặc tả chuẩn hóa code hoạt động của workspace `D:\Code Antinigaty\RUST` về chính thư mục repo gốc. Mục tiêu là tách rõ tab phần mềm, chức năng dùng chung, công cụ và một data hub canonical để điều phối dữ liệu, đồng thời giữ nguyên khả năng chạy hiện tại và bảo đảm migration có thể kiểm chứng/hoàn tác.

Phạm vi gồm toàn bộ code first-party đang chạy hoặc đang được phát triển trực tiếp: Project Manager, Graph Viewer, Apps Script và Sol Advisor. Dependency, cache, log, coverage, build output, metadata tooling và archive không thuộc code hoạt động.

## Locked Decisions

- D1: `D:\Code Antinigaty\RUST` là thư mục canonical; không tạo thêm tầng `RUST\RUST`.
- D2: Đưa toàn bộ code first-party đang hoạt động của Project Manager, Graph Viewer, Apps Script và Sol Advisor vào cấu trúc chuẩn.
- D3: Cấu trúc cấp cao dùng `apps/`, `packages/`, `tools/` và `data/`.
- D4: `data/` là data hub canonical để các tab dùng chung manifest, metadata và dữ liệu dùng chung.
- D5: Các lệnh hiện tại như `npm run dev`, `npm run tauri dev`, `npm run check` và `npm run typecheck` tiếp tục hoạt động sau migration.
- D6: Tên canonical theo vai trò: `apps/project-manager`, `apps/graph-viewer`, `apps/apps-script` và `tools/sol-advisor`.
- D7: Git chỉ theo dõi manifest, schema, metadata và sample nhỏ; dữ liệu raw lớn, normalized, runtime và export mặc định không theo dõi.
- D8: `.git`, `.knowns`, `.codegraph`, `docs`, `specs`, dependency và artifact giữ ở cấp repo gốc; chỉ code hoạt động vào các vùng chuẩn.
- D9: Data hub có `manifests/`, `schemas/`, `raw/`, `normalized/`, `exports/`, `runtime/` và `samples/`.
- D10: Migration phải có manifest nguồn–đích, hash, trạng thái, xử lý xung đột không ghi đè/xóa và khả năng rollback trong `BAK`.
- D11: Với file đã được Git theo dõi, ưu tiên `git mv` để bảo toàn lịch sử; không tự commit.
- D12: Inventory và kiểm tra runtime/build phải xác định cây Project Manager canonical trước khi di chuyển; không mặc định tin cây `BAK` hay `src/` chỉ từ tài liệu.

## System Decision Impact

- Impact: draft new
- Decision: Đề xuất tạo System Decision mới sau khi migration được verify, mô tả canonical workspace layout và data hub contract.
- Acceptance gate: Chỉ promote decision sau khi inventory đã xác nhận source of truth, các lệnh runtime/check chạy từ đường dẫn mới, migration manifest/hash hợp lệ và rollback được kiểm tra.

## Requirements

### Functional Requirements

- FR-1: Lập inventory toàn workspace, bỏ qua `.git`, dependency, cache, log, coverage, build output, archive không hoạt động và data generated khi phân loại code.
- FR-2: Xác định entry point, manifest, script command, import/path reference và build boundary của từng tab; đặc biệt phải giải quyết xung đột hiện tại giữa `package.json`/`README.md` và architecture docs về cây Project Manager.
- FR-3: Đặt code Project Manager đã xác nhận vào `apps/project-manager`, Graph Viewer vào `apps/graph-viewer`, Apps Script vào `apps/apps-script` và Sol Advisor vào `tools/sol-advisor`.
- FR-4: Chỉ tách một phần code vào `packages/<chức-năng>` khi phần đó được ít nhất hai tab sử dụng thực sự; code riêng của tab giữ trong app/tool tương ứng.
- FR-5: Cập nhật manifest, import, relative path, build config và root scripts để không còn entry point hoạt động nào trỏ nhầm tới đường dẫn cũ sau migration.
- FR-6: Duy trì các lệnh runtime và quality gate hiện tại từ repo root; lỗi môi trường phải được ghi rõ, không được che giấu bằng fallback sang archive.
- FR-7: Tạo data hub với các vùng `data/manifests`, `data/schemas`, `data/raw`, `data/normalized`, `data/exports`, `data/runtime` và `data/samples`; manifest/schema/metadata/sample nhỏ là nguồn điều phối dùng chung.
- FR-8: Dữ liệu lớn hoặc dữ liệu sinh ra không được tự động đưa vào Git; quy tắc ignore và tài liệu ownership phải phân biệt raw, normalized, runtime và export.
- FR-9: Tạo migration manifest trong data hub, ghi source path, target path, loại mục, owner/tab, hash trước/sau, lý do, trạng thái và thông tin rollback.
- FR-10: Khi đích tồn tại hoặc hash không khớp, dừng mục đó và ghi conflict; không ghi đè, xóa vĩnh viễn, reset, checkout hoặc phục hồi file đã bị xóa trước đó.
- FR-11: Giữ các thư mục điều hành repo ở root và không di chuyển dependency, cache, log, coverage, dist, tooling metadata hoặc archive không thuộc migration.
- FR-12: Cập nhật README và tài liệu vận hành để mô tả cây mới, tab ownership, data hub contract và lệnh chạy canonical.

### Non-Functional Requirements

- NFR-1: Migration không làm mất dữ liệu; mọi mục di chuyển phải kiểm tra hash và có đường lui.
- NFR-2: Có thể truy nguyên mỗi file đã di chuyển từ source đến target bằng manifest và Git history khi file được Git theo dõi.
- NFR-3: Không tạo bản sao canonical thứ hai trong `BAK`; `BAK` chỉ giữ archive/backup cần thiết cho rollback theo manifest.
- NFR-4: Cấu trúc mới dễ nhận diện bằng tên tab/chức năng và không buộc các app phải biết path nội bộ của app khác.
- NFR-5: Thay đổi phải tối thiểu, không tự commit/push và không ghi đè thay đổi chưa commit của người dùng.

## Acceptance Criteria

- [x] AC-1: Inventory có danh sách entry point/manifest của Project Manager, Graph Viewer, Apps Script và Sol Advisor; kết quả xác nhận rõ cây Project Manager được runtime/build dùng.
- [x] AC-2: Cây code hoạt động sau migration có các vùng canonical `apps/`, `packages/`, `tools/` và `data/`, với mapping tab đúng tên đã khóa.
- [x] AC-3: Không còn root command hoặc manifest hoạt động nào trỏ tới source path cũ, trừ reference lịch sử/rollback được ghi rõ.
- [x] AC-4: `npm run dev`, `npm run tauri dev`, `npm run typecheck` và `npm run check` dùng cấu trúc mới; mỗi kiểm tra pass hoặc ghi nhận lỗi môi trường cụ thể.
- [x] AC-5: `data/` có đủ bảy vùng chuẩn; manifest/schema/metadata/sample nhỏ được quản lý đúng, còn dữ liệu lớn/generated không bị thêm vào Git.
- [x] AC-6: `packages/` chỉ chứa chức năng được chứng minh dùng chung từ ít nhất hai tab; không có code app-specific bị tách theo suy đoán.
- [x] AC-7: Migration manifest chứa source/target, owner, hash trước/sau, status, conflict và rollback information cho mọi mục được xử lý.
- [x] AC-8: Một kiểm tra rollback hoặc dry-run chứng minh mục đã di chuyển có thể khôi phục; đích tồn tại hoặc hash sai không bị ghi đè.
- [x] AC-9: `.git`, `.knowns`, `.codegraph`, `docs`, `specs`, dependency, cache, logs, coverage, dist và archive ngoài phạm vi vẫn ở root và không bị thay đổi ngoài các reference cần thiết.
- [x] AC-10: Git history của file tracked được bảo toàn khi có thể; working-tree changes được giữ nguyên và không có commit/reset/checkout tự động.
- [x] AC-11: README/tài liệu vận hành mô tả đúng layout và lệnh canonical; không còn hướng dẫn chạy trực tiếp từ archive.

## Scenarios

### Scenario 1: Xác nhận source Project Manager trước migration

**Given** `package.json`/`README.md` và architecture docs chỉ tới các cây Project Manager khác nhau
**When** inventory chạy entry point, manifest và build/check thực tế
**Then** chỉ cây được runtime/build xác nhận mới được chọn làm source canonical; cây còn lại được ghi rõ là archive hoặc candidate và không bị di chuyển nhầm.

### Scenario 2: Migration thành công của các tab

**Given** source của từng tab đã được xác nhận và đích canonical chưa tồn tại
**When** migration thực hiện bằng thao tác thân thiện với Git và cập nhật references
**Then** code nằm ở `apps/project-manager`, `apps/graph-viewer`, `apps/apps-script` hoặc `tools/sol-advisor`, hash trước/sau khớp và lệnh root vẫn chạy.

### Scenario 3: Tách chức năng dùng chung

**Given** một module được import hoặc gọi từ ít nhất hai tab
**When** inventory reference xác nhận ownership dùng chung
**Then** module có thể đặt trong `packages/<chức-năng>` với contract rõ; module chỉ dùng trong một tab vẫn nằm trong tab đó.

### Scenario 4: Điều phối dữ liệu dùng chung

**Given** một tab cần dùng manifest, schema hoặc dữ liệu dùng chung
**When** tab truy cập data hub
**Then** nó dùng vùng tương ứng trong `data/`, không tạo bản sao canonical tại app khác; raw/normalized/runtime/export lớn không bị Git track mặc định.

### Scenario 5: Xung đột đích hoặc rollback

**Given** target đã tồn tại hoặc hash sau migration không khớp
**When** migration gặp mục đó
**Then** mục bị đánh dấu conflict, không bị ghi đè/xóa; manifest cung cấp đủ thông tin để rollback các mục đã commit trước đó.

### Scenario 6: Giữ tương thích lệnh và trạng thái người dùng

**Given** worktree có thay đổi chưa commit
**When** migration cập nhật source path và script
**Then** thay đổi chưa commit không bị mất, không có commit/reset/checkout tự động và các lệnh canonical được kiểm tra từ repo root.

## Technical Notes

- Mapping dự kiến là target mapping, không thay thế bước inventory source-of-truth: `apps/project-manager`, `apps/graph-viewer`, `apps/apps-script`, `tools/sol-advisor`.
- `packages/` không được dùng như nơi gom mọi code theo lớp kỹ thuật; chỉ đưa code có bằng chứng tái sử dụng liên-tab.
- Data hub điều phối dữ liệu workspace dùng chung; không thay thế runtime SQLite/project storage contract của Project Manager nếu contract đó là nguồn dữ liệu sản phẩm riêng.
- Root `package.json` hiện có các script delegate vào đường dẫn dưới `BAK`; migration phải thay delegate bằng target canonical sau khi source được xác nhận.
- Không di chuyển `.git`, `.knowns`, `.codegraph`, `docs`, `specs`, `node_modules`, `.venv`, cache, log, coverage, dist hoặc archive ngoài phạm vi.
- Các path lịch sử trong tài liệu phải được đánh dấu là archive/reference, không được để trở thành entry point hoạt động.

## Task Links

- @task-r39gpa [active-code-workspace-standardization-01] Inventory and resolve active source roots — done
- @task-9gyqfv [active-code-workspace-standardization-02] Establish canonical folders and data hub — done
- @task-aqthf6 [active-code-workspace-standardization-03] Migrate Project Manager to canonical app path — done
- @task-od1tg4 [active-code-workspace-standardization-04] Migrate supporting apps and tools — done
- @task-svrusz [active-code-workspace-standardization-05] Integrate compatibility, migration manifest, and verification — done

## Open Questions

- Không còn câu hỏi mở về mục tiêu và cấu trúc; source-of-truth audit của Project Manager là acceptance gate bắt buộc trong FR-2/AC-1.
