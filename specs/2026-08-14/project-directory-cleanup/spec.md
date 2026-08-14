## Overview

Đặc tả cho việc làm gọn toàn bộ workspace D:\Code Antinigaty\RUST bằng cách rà soát các file/thư mục mã nguồn và chuyển phần code không thuộc đường chạy của bất kỳ dự án nào vào BAK. Thao tác phải có thể khôi phục, không xóa dữ liệu và không làm thay đổi dependency, tooling, cache hoặc artefact đang có.

Trạng thái: approved.

## Locked Decisions

- D1: Phạm vi là toàn bộ workspace, gồm các dự án con và các mục ở thư mục gốc.
- D2: Code không sử dụng là code không nằm trong đường chạy chính; bao gồm test, script chạy thủ công, công cụ migrate/inspect và code chỉ được gọi tùy chọn.
- D3: File đang có thay đổi trong git vẫn được xét; nếu là code không dùng thì vẫn chuyển vào BAK. File đã bị xóa khỏi working tree giữ nguyên trạng thái xóa hiện tại.
- D4: Mục được chuyển vào BAK/2026-08-14/<đường-dẫn-gốc>, giữ nguyên đường dẫn tương đối ban đầu.
- D5: Code được bảo toàn nếu được tham chiếu từ bất kỳ manifest hoặc entry point nào trong workspace, kể cả các dự án phụ và code hiện đang nằm trong BAK.
- D6: Chỉ di chuyển mã nguồn và thư mục chứa mã nguồn; giữ nguyên dependency, tooling, cache và artefact.

## System Decision Impact

- Impact: none.
- Decision: Không tạo hoặc thay thế System Decision; đây là thao tác tổ chức lại file có thể hoàn tác.
- Acceptance gate: Chỉ hoàn tất sau khi manifest khôi phục được đường dẫn, không có file bị ghi đè và các kiểm tra xác minh đạt yêu cầu.

## Requirements

### Functional Requirements

- FR-1: Lập inventory cho toàn bộ workspace, bỏ qua thư mục đích BAK/2026-08-14 trong lúc quét để không quét lặp.
- FR-2: Xác định các entry point và manifest của mọi dự án trong workspace, bao gồm package.json, appsscript.json và các manifest tương đương.
- FR-3: Xác định tập code đang dùng bằng các tham chiếu tĩnh, cấu hình entry point, import/export, script command và quan hệ build đã phát hiện.
- FR-4: Bảo toàn mọi code thuộc tập đang dùng; code đang nằm trong BAK cũng được giữ nguyên nếu còn được entry point tham chiếu.
- FR-5: Chuyển các file code không thuộc tập đang dùng vào BAK/2026-08-14/<đường-dẫn-gốc>.
- FR-6: Nếu một thư mục chứa cả code đang dùng và code không dùng, chỉ chuyển phần không dùng; chỉ chuyển cả thư mục khi toàn bộ nội dung code của thư mục đó không dùng.
- FR-7: Giữ nguyên nội dung và cấu trúc tương đối của từng mục được chuyển, không ghi đè mục đã tồn tại trong BAK.
- FR-8: Tạo manifest kiểm kê cho lần dọn dẹp, ghi đường dẫn cũ, đường dẫn mới, loại mục, lý do chuyển và trạng thái xác minh.
- FR-9: Không khôi phục các file đã bị xóa trong git; không tự động commit, reset hoặc checkout.
- FR-10: Giữ nguyên node_modules, .venv, .codegraph, .knowns, cache, log, coverage, dist, scratch, graphify-out, dependency và các artefact tái tạo.
- FR-11: Sau khi di chuyển, cập nhật hoặc kiểm tra các tham chiếu trực tiếp bị ảnh hưởng; không để manifest đang dùng trỏ tới đường dẫn đã chuyển.
- FR-12: Nếu đường dẫn đích đã tồn tại, không ghi đè; giữ mục hiện có và ghi xung đột vào manifest để xử lý riêng.

### Non-Functional Requirements

- NFR-1: Không xóa dữ liệu; mọi thay đổi phải có bản sao tại BAK hoặc được giữ nguyên tại vị trí cũ.
- NFR-2: Thao tác phải có thể đảo ngược bằng manifest đường dẫn cũ–mới.
- NFR-3: Không làm thay đổi nội dung của file được chuyển; kiểm tra hash trước và sau khi chuyển.
- NFR-4: Không làm thay đổi các file ngoài phạm vi mã nguồn, dependency, tooling, cache và artefact đã được khóa.
- NFR-5: Kết quả phải có báo cáo số lượng mục đã quét, bảo toàn, chuyển, bỏ qua, xung đột và lỗi.

## Acceptance Criteria

- [x] AC-1: Có inventory của toàn bộ workspace và danh sách entry point/manifest được dùng để phân tích.
- [x] AC-2: Mọi mục được phân loại là code đang dùng đều còn tồn tại ở vị trí đang được manifest/entry point tham chiếu.
- [x] AC-3: Mọi mục code không dùng được chuyển vào BAK/2026-08-14/<đường-dẫn-gốc> hoặc được ghi rõ là bị bỏ qua do xung đột.
- [x] AC-4: Không có mục nào trong node_modules, .venv, metadata tooling, cache hoặc artefact bị di chuyển.
- [x] AC-5: Manifest kiểm kê có đủ đường dẫn cũ, đường dẫn mới, lý do, hash và trạng thái cho mọi mục đã chuyển.
- [x] AC-6: Không có thao tác xóa vĩnh viễn, reset, checkout hoặc commit tự động; trạng thái git trước các mục không liên quan vẫn được bảo toàn.
- [x] AC-7: Các kiểm tra phù hợp với từng entry point còn lại chạy được, hoặc lỗi môi trường được ghi nhận mà không bị che giấu.
- [x] AC-8: Chạy lại inventory không phát hiện thêm code không dùng chưa được xử lý ngoài các mục đã ghi nhận trong manifest.

## Scenarios

### Scenario 1: Chuyển code cũ không được tham chiếu

**Given** một file mã nguồn không được manifest, entry point hoặc code đang dùng tham chiếu
**When** chạy quy trình dọn dẹp
**Then** file được chuyển tới BAK/2026-08-14/<đường-dẫn-gốc>, hash không đổi và manifest ghi lại lý do chuyển.

### Scenario 2: Giữ code đang được dùng trong BAK

**Given** một entry point đang tham chiếu code nằm dưới BAK
**When** inventory toàn workspace được thực hiện
**Then** code đó không bị chuyển tiếp hoặc thay đổi đường dẫn.

### Scenario 3: Thư mục chứa code dùng và không dùng

**Given** một thư mục có cả file được tham chiếu và file không được tham chiếu
**When** quy trình dọn dẹp phân loại thư mục
**Then** chỉ file không dùng được chuyển, còn file dùng và thư mục cha vẫn giữ nguyên.

### Scenario 4: File đang có thay đổi git

**Given** một file code đang được chỉnh sửa nhưng không được tham chiếu
**When** quy trình dọn dẹp xử lý file đó
**Then** file được chuyển nguyên nội dung hiện tại vào BAK, không khôi phục trạng thái cũ và không commit thay đổi.

### Scenario 5: Đường dẫn sao lưu đã tồn tại

**Given** đường dẫn đích trong BAK/2026-08-14 đã tồn tại
**When** quy trình cần chuyển một mục tới cùng đường dẫn
**Then** không ghi đè mục đích và manifest ghi nhận xung đột để xử lý thủ công.

### Scenario 6: Dependency và artefact

**Given** một thư mục như node_modules, .venv, cache hoặc dist không phải mã nguồn cần bảo toàn môi trường
**When** quy trình dọn dẹp chạy
**Then** thư mục đó được giữ nguyên và được ghi nhận là bị loại khỏi phạm vi di chuyển.

## Technical Notes

- Đường dẫn đích phải được tạo trong cùng workspace để thao tác move không làm mất dữ liệu do khác volume.
- Phải loại trừ .git và thư mục đích hiện tại khỏi thao tác di chuyển.
- Root package.json hiện tham chiếu một ứng dụng nằm dưới BAK; đây là một tham chiếu active và phải được kiểm tra trước khi di chuyển.
- Các dự án có manifest riêng phải được phân tích độc lập nhưng dùng chung báo cáo inventory.
- Vì CodeGraph hiện báo trạng thái auto-sync bị vô hiệu hóa, mọi kết luận liên quan đến file đã thay đổi phải được xác nhận từ filesystem hiện tại và công cụ build/reference thực tế.

## Task Links

- @task-eou1qn [project-directory-cleanup-01] Inventory and classify code — done
- @task-9ba20i [project-directory-cleanup-02] Move unused code to BAK — done
- @task-js0s9a [project-directory-cleanup-03] Review and verify cleanup — done

## Open Questions

- [ ] Có cần tạo thêm script khôi phục tự động từ manifest sau khi dọn dẹp không?
- [ ] Với xung đột đích, có muốn cho phép so sánh hash và tự bỏ qua bản sao giống hệt hay luôn yêu cầu xử lý thủ công?
