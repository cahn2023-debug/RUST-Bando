# TƯ VẤN: Giải pháp Đồng bộ Metadata Hợp đồng & Dự án

Chào bạn, đây là bản phân tích chuyên sâu về lý do tại sao dữ liệu của bạn lại không "chạy" sang thẻ **Bảng dữ liệu hợp đồng** và phương án khắc phục triệt để.

## 1. Phân tích Nguyên nhân (Root Cause Analysis)

Hiện tại, hệ thống của chúng ta đang tồn tại 2 "nguồn sự thật" (Sources of Truth):
1.  **Thẻ "Hợp đồng" (File Detail)**: Đang đọc và ghi trực tiếp vào metadata của **từng file riêng lẻ** (ví dụ file `HĐ 2512...pdf`).
2.  **Thẻ "Bảng dữ liệu hợp đồng" (Global BOM)**: Đây là một bản ghi "giả" (Pseudo-file) đại diện cho toàn bộ dự án.

**Vấn đề nằm ở chỗ**: Khi bạn điền dữ liệu ở thẻ Hợp đồng và lưu, dữ liệu đó được lưu vào bảng `projects`. Tuy nhiên, thẻ "Bảng dữ liệu hợp đồng" (loại Premium) lại đang cố gắng hiển thị Metadata của chính nó (vốn đang bị để trống trong code backend khi lưu bảng BOM tổng).

Nói cách khác: **Bảng dữ liệu tổng hợp đang bị "mất trí nhớ" về thông tin chung của dự án do nó tự coi mình là một file độc lập.**

## 2. Giải pháp Kiến trúc đề xuất

Để giải quyết vấn đề này, chúng ta cần áp dụng mô hình **Inheritance Metadata (Kế thừa dữ liệu)**:

### Bước 1: Backend (Rust - `save_project_bom_table`)
Thay vì lưu `contract_number = "GLOBAL_SYSTEM_BOM"` và các trường khác bằng rỗng, chúng ta sẽ yêu cầu backend đọc lên Metadata mới nhất từ bảng `projects` trước khi lưu file `global_bom`.

### Bước 2: Frontend (React - `ProjectDetail.tsx`)
Đảm bảo rằng khi render `ContractAnalysisView` ở mode `premium` (Bảng dữ liệu tổng), chúng ta luôn truyền `localMetadata` của dự án vào, thay vì lấy metadata từ chính bảng BOM đó.

### Bước 3: Cơ chế "Single-Edit, Multi-Update"
Khi người dùng sửa thông tin ở Header của bảng tổng hợp, hệ thống sẽ tự động cập nhật ngược lại vào bảng `projects`.

## 3. Lộ trình triển khai (Feature Breakdown)

1.  **[Backend]**: Sửa hàm `save_project_bom_table` để nhận thêm tham số metadata hoặc tự động lấy từ DB.
2.  **[Frontend]**: Tối ưu lại `ContractAnalysisView` để tách biệt rõ ràng giữa `Metadata` (thông tin dự án) và `BOM Table` (nội dung vật tư).
3.  **[Optimization]**: Thêm cơ chế tự động điền (Auto-fill) các trường còn thiếu từ các file đã phân tích gần nhất vào Bảng tổng.

---
**Sếp thấy bản thiết kế hệ thống này đã ổn chưa? Nếu sếp đồng ý, mình sẽ tiến hành "thông mạch" dữ liệu này ngay lập tức!**
