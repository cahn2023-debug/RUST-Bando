# 💡 BRIEF: Box Selection & Map Analysis

**Ngày tạo:** 2026-03-12
**Trạng thái:** Brainstorming

---

## 1. VẤN ĐỀ CẦN GIẢI QUYẾT
Người dùng cần một cách nhanh chóng để thống kê và trích xuất dữ liệu của một khu vực cụ thể trên bản đồ (ví dụ: một nút giao, một phường, hoặc một đoạn tuyến). Việc chọn từng đối tượng một rất tốn thời gian.

## 2. GIẢI PHÁP ĐỀ XUẤT
Sử dụng tổ hợp phím **Shift + Chuột trái (Quét vùng)** - một tính năng quen thuộc trong các phần mềm CAD/GIS - để:
1. Zoom nhanh vào vùng quan tâm.
2. Thống kê tự động tất cả đối tượng nằm trong vùng đó.
3. Hiển thị danh sách chi tiết và hỗ trợ Copy cho Excel.

## 3. ĐỐI TƯỢNG SỬ DỤNG
- Kỹ sư khảo sát hiện trường.
- Người lập báo cáo vật tư/thiết bị.
- Quản lý dự án cần thống kê nhanh số lượng Camera, Nút mạng, Chiều dài cáp.

## 4. TÍNH NĂNG

### 🚀 MVP (Bắt buộc có):
- [ ] Bắt sự kiện `boxzoomend` của Leaflet (Shift + Drag).
- [ ] Tính toán giao cắt: Kiểm tra đối tượng (Point, Line) có nằm trong Bounds đã quét không.
- [ ] Thống kê số lượng theo nhóm (Camera, Nút, Đường, ...).
- [ ] Hiển thị danh sách các đối tượng trong Panel Property Manager.
- [ ] Nút "Copy to Excel" (định dạng TSV/CSV gửi vào clipboard).

### 🎁 Phase 2 (Làm sau):
- [ ] Highlight các đối tượng được chọn trên bản đồ (Visual selection).
- [ ] Hỗ trợ đa chọn (Multi-select) thủ công bằng Ctrl + Click.
- [ ] Export trực tiếp ra file .xlsx.

## 5. ƯỚC TÍNH SƠ BỘ
- **Độ phức tạp:** Trung bình. 
- **Rủi ro:** Hiệu năng khi số lượng đối tượng quá lớn (>1000). Cần tối ưu vòng lặp kiểm tra spatial bounds.

## 6. BƯỚC TIẾP THEO
→ Chạy `/tuvan` để tạo `SPEC_BoxSelection.md` chi tiết kỹ thuật.
