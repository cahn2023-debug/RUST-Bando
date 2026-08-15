# Feature Specification: Chuẩn hóa ánh xạ biểu tượng–đối tượng trong DESIGN

**Feature Branch**: `design-icon-type-mapping`  
**Created**: 2026-08-15  
**Status**: Draft — chờ người dùng duyệt  
**Input**: Xóa code bị lặp và xây dựng lại bộ hiển thị biểu tượng, đối tượng, loại đối tượng với hình ảnh trên màn hình chính phần DESIGN.

## Overview

Chuẩn hóa cách phần DESIGN xác định và hiển thị biểu tượng của đối tượng trên ba khu vực chính: CAD Canvas, cây đối tượng bên trái và Property Panel bên phải. Một mapping chuẩn sẽ liên kết biểu tượng, tên hiển thị và loại đối tượng; mọi khu vực dùng cùng ngữ nghĩa nhưng được phép điều chỉnh kích thước và màu theo layout.

Phạm vi bao gồm dọn các định nghĩa và logic ánh xạ bị lặp trong luồng DESIGN và các utility trực tiếp liên quan. Dữ liệu dự án cũ được chuyển sang bộ trường chuẩn; trước khi chuyển, chỉ các bản ghi bị ảnh hưởng được snapshot vào thư mục `BAK` có phiên bản.

Phạm vi không bao gồm mở rộng loại đối tượng mới, thay đổi các view phụ ngoài ba khu vực trên hoặc xây dựng chế độ 3D.

## Locked Decisions

- D1: Phạm vi hiển thị gồm CAD Canvas, cây đối tượng và Property Panel.
- D2: Chuẩn hóa `icon`, `type` và `objectType` theo mapping chuẩn khi tải, chọn và lưu.
- D3: Giữ toàn bộ loại đang hỗ trợ; ưu tiên CCTV, PTZ, SPEED, LPR, tủ thông tin và tủ đèn.
- D4: Ba khu vực dùng chung `iconKey` chuẩn; kích thước và màu có thể khác theo layout.
- D5: Hợp nhất logic lặp của luồng icon–object type–display mapping và giữ tương thích caller cũ khi cần.
- D6: Chuyển dữ liệu cũ sang trường chuẩn và không giữ alias cũ trong dữ liệu hoạt động.
- D7: Tạo snapshot có phiên bản trong `BAK` chỉ cho bản ghi bị ảnh hưởng trước khi chuẩn hóa.
- D8: Loại chưa ánh xạ dùng icon mặc định, giữ nhãn/loại, ghi nhận mục chưa ánh xạ và cảnh báo nhẹ có tooltip.
- D9: Thay đổi icon cập nhật preview ngay trên ba khu vực; chỉ ghi chính thức khi bấm Lưu.
- D10: Bộ chọn hiển thị biểu tượng, tên hiển thị và loại đối tượng chuẩn.
- D11: Line/polygon ưu tiên biểu tượng theo hình học; mapping icon–type áp dụng cho point và thiết bị.
- D12: Nhiều icon/type khác nhau hiển thị “Khác nhau” và cho phép áp dụng icon mới cho toàn bộ tập chọn.
- D13: Tên/loại chuẩn lấy từ mapping tập trung; người dùng chỉ đổi tên riêng.
- D14: Mapping quyết định hình dạng/ngữ nghĩa; màu và kích thước vẫn là thuộc tính riêng.
- D15: Đối tượng chưa ánh xạ vẫn làm việc bình thường với icon mặc định và cảnh báo nhẹ.

## System Decision Impact

- Impact: none
- **Decision**: Không có.
- **Acceptance gate**: Hoàn tất ma trận kiểm thử mapping và kiểm tra snapshot/khôi phục trước khi triển khai.

## User Scenarios & Testing

### User Story 1 — Nhận diện nhất quán đối tượng (Priority: P1)

Là kỹ sư thiết kế, tôi muốn một đối tượng có cùng biểu tượng và loại đối tượng ở Canvas, cây đối tượng và Property Panel để nhận diện và chỉnh sửa mà không bị nhầm.

**Why this priority**: Đây là giá trị cốt lõi của việc xây dựng lại bộ hiển thị và loại bỏ mapping trùng.

**Independent Test**: Tạo hoặc mở một bản đồ có từng loại đối tượng hiện có, sau đó đối chiếu ba khu vực mà không cần thực hiện thao tác lưu.

**Acceptance Scenarios**:

1. **Given** một đối tượng có `iconKey` chuẩn, **When** đối tượng xuất hiện ở ba khu vực, **Then** cả ba khu vực hiển thị cùng biểu tượng ngữ nghĩa và cùng tên/loại chuẩn.
2. **Given** đối tượng là line hoặc polygon, **When** đối tượng được hiển thị, **Then** biểu tượng theo hình học được ưu tiên và không bị icon của point ghi đè.

### User Story 2 — Đổi biểu tượng có xem trước tức thời (Priority: P1)

Là kỹ sư thiết kế, tôi muốn chọn biểu tượng trong Property Panel và thấy kết quả ngay trên toàn bộ màn hình DESIGN trước khi lưu.

**Why this priority**: Giảm lỗi chọn nhầm loại và làm cho thao tác chỉnh sửa có thể kiểm chứng ngay.

**Independent Test**: Chọn một đối tượng, đổi lần lượt các biểu tượng thiết bị, quan sát ba khu vực trước và sau thao tác Lưu.

**Acceptance Scenarios**:

1. **Given** một đối tượng được chọn, **When** người dùng chọn biểu tượng mới, **Then** Canvas, cây đối tượng và Property Panel cập nhật xem trước ngay, còn dữ liệu chính thức chưa thay đổi trước khi bấm Lưu.
2. **Given** người dùng bấm Lưu sau khi đổi biểu tượng, **When** mở lại đối tượng, **Then** `icon`, `type` và `objectType` khớp mapping chuẩn.
3. **Given** nhiều đối tượng đang được chọn và có biểu tượng khác nhau, **When** người dùng áp dụng một biểu tượng mới, **Then** tất cả đối tượng trong tập chọn nhận xem trước mới và được lưu theo cùng mapping khi xác nhận.

### User Story 3 — Migrate dữ liệu cũ an toàn (Priority: P1)

Là người quản lý dự án, tôi muốn dữ liệu cũ được chuẩn hóa nhưng vẫn có bản snapshot của các bản ghi bị ảnh hưởng để có thể khôi phục khi cần.

**Why this priority**: Tránh mất dữ liệu và chặn việc triển khai khi dữ liệu lịch sử còn dùng tên trường hoặc loại không thống nhất.

**Independent Test**: Chạy migration trên bản sao dự án có dữ liệu lệch mapping, kiểm tra snapshot trong `BAK`, sau đó khôi phục một bản ghi và đối chiếu kết quả.

**Acceptance Scenarios**:

1. **Given** bản ghi cũ có `icon`, `type` và `objectType` không khớp, **When** chuẩn hóa được chạy, **Then** bản ghi đó được snapshot có phiên bản trong `BAK` trước khi dữ liệu hoạt động được ghi lại theo bộ trường chuẩn.
2. **Given** bản ghi không bị ảnh hưởng, **When** chuẩn hóa được chạy, **Then** bản ghi đó không bị sao chép vào snapshot và nội dung không bị thay đổi ngoài phạm vi mapping.
3. **Given** snapshot hợp lệ trong `BAK`, **When** người dùng yêu cầu khôi phục, **Then** bản ghi có thể trở về trạng thái trước chuẩn hóa.

### User Story 4 — Làm việc an toàn với loại chưa ánh xạ (Priority: P2)

Là kỹ sư thiết kế, tôi muốn vẫn nhìn thấy và chỉnh sửa đối tượng chưa có mapping thay vì mất đối tượng khỏi bản đồ.

**Why this priority**: Dữ liệu thực tế có thể chứa loại mới hoặc dữ liệu lịch sử chưa được đăng ký.

**Independent Test**: Nạp một đối tượng có loại/biểu tượng không nằm trong mapping và kiểm tra Canvas, cây đối tượng, Property Panel, tooltip và thao tác lưu.

**Acceptance Scenarios**:

1. **Given** đối tượng chưa ánh xạ, **When** mở màn hình DESIGN, **Then** đối tượng dùng icon mặc định, vẫn có nhãn/loại hiện có và hiển thị cảnh báo nhẹ kèm tooltip.
2. **Given** đối tượng chưa ánh xạ đang được chọn, **When** người dùng chọn một biểu tượng hợp lệ và lưu, **Then** đối tượng chuyển sang mapping chuẩn và cảnh báo được loại bỏ.

## Edge Cases

- `icon`, `type` và `objectType` trống, null hoặc chứa alias cũ phải được chuẩn hóa về mapping hợp lệ hoặc fallback mặc định.
- Hai bản ghi có cùng loại chuẩn nhưng khác màu/kích thước vẫn dùng cùng biểu tượng ngữ nghĩa, không ghi đè style riêng.
- Tập chọn có cả point, line và polygon phải giữ quy tắc ưu tiên hình học; không áp dụng icon point lên line/polygon.
- Snapshot migration thất bại phải dừng việc ghi lại các bản ghi bị ảnh hưởng và báo lỗi có thể hành động; không được âm thầm xóa dữ liệu cũ.
- Dữ liệu không bị ảnh hưởng không được đưa vào `BAK` chỉ vì chạy migration.

## Requirements

### Functional Requirements

- **FR-001**: Hệ thống MUST có một mapping chuẩn liên kết `iconKey`, tên hiển thị và loại đối tượng cho toàn bộ loại hiện đang hỗ trợ, bao gồm pole, cabinet, info cabinet, light cabinet, splice, ODF, splitter, camera/CCTV, PTZ, SPEED, LPR, intersection, point và node.
- **FR-002**: Hệ thống MUST dùng cùng mapping chuẩn khi hiển thị đối tượng trên Canvas, cây đối tượng và Property Panel.
- **FR-003**: Hệ thống MUST hiển thị trong bộ chọn biểu tượng cả hình, tên hiển thị và loại đối tượng chuẩn tương ứng.
- **FR-004**: Hệ thống MUST cập nhật xem trước tức thời trên ba khu vực sau khi người dùng chọn biểu tượng và MUST chỉ ghi dữ liệu chính thức sau thao tác Lưu.
- **FR-005**: Khi lưu thay đổi, hệ thống MUST chuẩn hóa `icon`, `type` và `objectType` theo cùng một mapping và không ghi alias cũ vào dữ liệu hoạt động.
- **FR-006**: Hệ thống MUST hợp nhất các logic/định nghĩa trùng dùng để chuẩn hóa, chọn và hiển thị icon–object type; mỗi quy tắc chuẩn phải có một nơi sở hữu rõ ràng.
- **FR-007**: Hệ thống MUST giữ tương thích với các caller hiện có trong quá trình chuyển đổi, nhưng không tạo thêm bản sao mapping hoặc duy trì alias cũ trong bản ghi đã chuẩn hóa.
- **FR-008**: Trước khi chuẩn hóa, hệ thống MUST tạo snapshot có phiên bản trong `BAK` chỉ cho các bản ghi bị ảnh hưởng và MUST hỗ trợ khôi phục snapshot hợp lệ.
- **FR-009**: Hệ thống MUST dùng biểu tượng mặc định, giữ nhãn/loại và hiển thị cảnh báo nhẹ cho đối tượng chưa ánh xạ; thao tác chỉnh sửa và lưu vẫn phải khả dụng.
- **FR-010**: Hệ thống MUST hiển thị trạng thái “Khác nhau” cho tập chọn có nhiều icon/type và MUST cho phép áp dụng một biểu tượng mới cho toàn bộ tập chọn.
- **FR-011**: Hệ thống MUST ưu tiên biểu tượng theo hình học cho line/polygon; đối với point và thiết bị, hệ thống MUST dùng mapping icon–type.
- **FR-012**: Hệ thống MUST giữ màu và kích thước là thuộc tính riêng của đối tượng/khu vực, không để mapping icon ghi đè tùy chỉnh style.
- **FR-013**: Người dùng MUST có thể đổi tên riêng của đối tượng, nhưng không được sửa trực tiếp tên/loại chuẩn do mapping quản lý.

### Non-Functional Requirements

- **NFR-001**: Sau thao tác chọn biểu tượng, người dùng MUST thấy thay đổi ở cả ba khu vực trong tối đa 1 giây mà không cần tải lại màn hình.
- **NFR-002**: Với mọi loại trong ma trận hỗ trợ, ba khu vực MUST cho cùng một kết quả ngữ nghĩa khi đối chiếu `iconKey` và loại chuẩn.
- **NFR-003**: Việc dọn code MUST không làm mất đối tượng, tọa độ, hình học, màu hoặc kích thước không liên quan đến mapping.
- **NFR-004**: Snapshot trong `BAK` MUST chứa đủ dữ liệu để khôi phục từng bản ghi bị ảnh hưởng và có định danh phiên bản/nguồn tạo.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% loại đối tượng trong ma trận hỗ trợ hiển thị cùng biểu tượng ngữ nghĩa, tên và loại chuẩn khi đối chiếu Canvas, cây đối tượng và Property Panel.
- **SC-002**: Người dùng nhìn thấy xem trước thay đổi ở cả ba khu vực trong tối đa 1 giây sau khi chọn biểu tượng, không cần tải lại màn hình.
- **SC-003**: 100% bản ghi bị ảnh hưởng bởi migration có snapshot trong `BAK` trước khi ghi dữ liệu chuẩn; ít nhất một bản ghi trong mỗi lần migration có thể khôi phục thành công trong kiểm thử.
- **SC-004**: 100% đối tượng chưa ánh xạ vẫn nhìn thấy, giữ được nhãn/loại và có thể chuyển sang mapping hợp lệ mà không cần chỉnh sửa thủ công dữ liệu thô.
- **SC-005**: 100% đối tượng trong một tập chọn nhận đúng icon/type mới sau một thao tác áp dụng và Lưu; màu/kích thước riêng không bị thay đổi ngoài chủ đích.
- **SC-006**: Ma trận kiểm tra code không còn nhiều nguồn định nghĩa cho cùng một quy tắc mapping chuẩn.

## Key Entities

- **Icon mapping**: Quy tắc chuẩn liên kết `iconKey`, hình biểu tượng, tên hiển thị và loại đối tượng.
- **Đối tượng thiết kế**: Bản ghi có hình học, nhãn riêng, icon/type/objectType và style hiển thị.
- **Tập lựa chọn**: Một hoặc nhiều đối tượng đang được người dùng chỉnh sửa trong DESIGN.
- **Snapshot migration**: Bản sao có phiên bản của các bản ghi bị ảnh hưởng, lưu trong `BAK` trước khi chuẩn hóa.
- **Mục chưa ánh xạ**: Đối tượng không tìm được mapping chuẩn, được hiển thị bằng fallback và cảnh báo.

## Acceptance Criteria

- [ ] **AC-001**: Ma trận mapping của toàn bộ loại hiện có có đúng một kết quả chuẩn cho `iconKey`, tên hiển thị và loại đối tượng.
- [ ] **AC-002**: Cùng một đối tượng hiển thị cùng biểu tượng ngữ nghĩa ở Canvas, cây đối tượng và Property Panel.
- [ ] **AC-003**: Bộ chọn biểu tượng hiển thị hình, tên và loại chuẩn; chọn biểu tượng cập nhật xem trước trong tối đa 1 giây.
- [ ] **AC-004**: Sau Lưu, `icon`, `type` và `objectType` khớp mapping chuẩn; sau mở lại, kết quả không đổi.
- [ ] **AC-005**: Nhiều đối tượng khác nhau hiển thị “Khác nhau”; áp dụng biểu tượng mới cập nhật đúng toàn bộ tập chọn.
- [ ] **AC-006**: Line/polygon giữ biểu tượng theo hình học; point/thiết bị dùng icon–type mapping.
- [ ] **AC-007**: Dữ liệu cũ bị ảnh hưởng được snapshot vào `BAK` trước migration; bản ghi không bị ảnh hưởng không xuất hiện trong snapshot.
- [ ] **AC-008**: Một snapshot hợp lệ có thể khôi phục ít nhất một bản ghi về trạng thái trước migration.
- [ ] **AC-009**: Đối tượng chưa ánh xạ vẫn hiển thị, có icon mặc định, nhãn/loại và cảnh báo tooltip; có thể chuyển sang mapping hợp lệ.
- [ ] **AC-010**: Ma trận kiểm thử không phát hiện hai nguồn mapping chuẩn độc lập cho cùng một loại.

## Scenarios

### Scenario 1: Đổi biểu tượng thiết bị

**Given** người dùng chọn một đối tượng point trong Canvas và mở Property Panel  
**When** chọn `Camera LPR`  
**Then** Canvas, cây đối tượng và Property Panel lập tức hiển thị cùng biểu tượng LPR, tên LPR và loại chuẩn; sau Lưu dữ liệu được ghi theo mapping LPR.

### Scenario 2: Dữ liệu cũ không khớp

**Given** một bản ghi có icon cũ và `type` khác với icon  
**When** hệ thống chuẩn hóa dữ liệu  
**Then** snapshot của bản ghi được tạo trong `BAK` trước, sau đó dữ liệu hoạt động được ghi theo bộ trường chuẩn và không còn alias cũ.

### Scenario 3: Đối tượng chưa ánh xạ

**Given** một bản ghi có loại không nằm trong mapping  
**When** người dùng mở màn hình DESIGN  
**Then** đối tượng dùng icon mặc định, vẫn giữ nhãn/loại, có cảnh báo tooltip và có thể được đổi sang icon hợp lệ.

### Scenario 4: Nhiều lựa chọn

**Given** người dùng chọn nhiều đối tượng có icon khác nhau  
**When** người dùng chọn một icon mới và bấm Lưu  
**Then** Property Panel hiển thị trạng thái “Khác nhau” trước thao tác, toàn bộ tập chọn nhận icon/type mới sau thao tác và các style riêng không bị ghi đè ngoài phạm vi yêu cầu.

## Technical Notes

- Cần kiểm tra các đường dẫn hiện có liên quan đến manifest icon, chuẩn hóa icon key, hiển thị feature, bộ chọn icon, persistence và renderer ảnh trước khi lập task.
- Các file đang có thay đổi chưa commit thuộc về người dùng; khi triển khai phải giữ nguyên thay đổi ngoài phạm vi và tránh ghi đè spec `icon-library-2d-3d` hiện có.
- Ma trận kiểm thử nên bao phủ cả Canvas, cây đối tượng, Property Panel, dữ liệu hoạt động và snapshot `BAK`.

## Assumptions

- Người dùng có quyền xem và chỉnh sửa các đối tượng trong màn hình DESIGN.
- Thao tác Lưu hiện tại là điểm ghi dữ liệu chính thức và được tái sử dụng.
- `BAK` là vùng lưu trữ nội bộ của dự án, không phải nơi dùng cho dữ liệu hoạt động.
- Các loại đối tượng liệt kê trong FR-001 là tập hiện có; việc bổ sung loại mới là work item riêng.
- Không yêu cầu đồng bộ với màn hình 3D trong phiên bản này.

## Task Links

- @task-4czpc4 [design-icon-type-mapping-01] Chuẩn hóa mapping icon và object type — todo
- @task-cu9oau [design-icon-type-mapping-02] Đồng bộ hiển thị trên DESIGN — todo
- @task-zfg8zs [design-icon-type-mapping-03] Migration dữ liệu và fallback icon — todo

## Open Questions

Không còn câu hỏi mở; các quyết định D1–D15 đã được người dùng xác nhận.
