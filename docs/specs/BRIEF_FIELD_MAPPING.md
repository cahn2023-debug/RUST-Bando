# 💡 BRIEF: Tính năng Field Mapping cho Import GIS Data

**Ngày tạo:** 2026-03-16
**Trạng thái:** Brainstorming

---

## 1. VẤN ĐỀ CẦN GIẢI QUYẾT
Hiện tại, khi import file (Excel, KML, KMZ), phần mềm tự động lấy các trường dữ liệu mặc định hoặc gán toàn bộ vào metadata. Người dùng không có quyền quyết định cột nào sẽ được dùng làm Tên, cột nào là Tọa độ (với Excel), và cột nào là Số thứ tự (STT) hiển thị trên bản đồ.

## 2. GIẢI PHÁP ĐỀ XUẤT
Thêm một bước **Mapping** trung gian sau khi phân tích file và trước khi tiến hành import chính thức. Bước này hiển thị các cột dữ liệu được tìm thấy và cho phép người dùng ánh xạ (map) chúng vào các trường cốt lõi của hệ thống.

## 3. ĐỐI TƯỢNG SỬ DỤNG
- Người dùng làm việc với dữ liệu khảo sát (Excel).
- Người dùng import dữ liệu từ Google Earth (KML/KMZ).

## 4. QUY TRÌNH IMPORT MỚI
1. **Chọn file**: User chọn file (.xlsx, .kml, .kmz).
2. **Phân tích (Analyze)**: Backend đọc headers và metadata.
3. **Mapping UI (Mới)**:
    - Hiển thị danh sách các cột đã phát hiện.
    - Dropdown chọn cột cho: `Tên (Name)`, `Kinh độ (Longitude)`, `Vĩ độ (Latitude)`, `STT (Order Number)`.
    - Tự động gợi ý dựa trên tên cột (ví dụ: "Tên" -> Name).
4. **Xác nhận**: User nhấn "Bắt đầu Import".
5. **Xử lý dữ liệu**:
    - Các cột đã map sẽ được đưa vào các trường tương ứng của `Feature`.
    - Các cột còn lại tự động đưa vào mục `Metadata`.

## 5. TÍNH NĂNG CHI TIẾT

### 🚀 MVP (Cần có ngay):
- [ ] Giao diện Mapping trực quan trong `ImportDialog`.
- [ ] Logic tự động nhận diện (Smart Suggester) cho các tên cột phổ biến.
- [ ] Xử lý mapping dữ liệu trong vòng lặp tạo Feature ở Frontend.
- [ ] Hỗ trợ mapping cho cả Excel (bắt buộc Lat/Lon) và KML/KMZ (chủ yếu Name/STT).

### 🎁 Phase 2 (Làm sau):
- [ ] Lưu cấu hình mapping (của từng file hoặc theo mẫu template).
- [ ] Preview dữ liệu sau khi map (xem trước vài dòng).

## 6. ƯỚC TÍNH SƠ BỘ
- **Độ phức tạp**: Trung bình (Thay đổi UI logic và loop xử lý dữ liệu).
- **Rủi ro**: Dữ liệu tọa độ trong Excel không hợp lệ (cần validation).

## 7. BƯỚC TIẾP THEO
→ Cập nhật `implementation_plan.md` và tiến hành code UI Mapping.
