# Troubleshoot & Verify Log - KMZ Export & Technical Specs Extension

## 1. Phân tích đầu vào
- **Yêu cầu 1**: Bổ sung "Technical Specs" vào sheet Metadata khi export Excel.
- **Yêu cầu 2**: Xuất file định dạng `.kmz` thay vì `.kml` (thực tế là đổi extension cho gói ZIP hiện tại).

## 2. Hội đồng Agent (Virtual Meeting)

### 🧩 Logic Agent
- **Giả thuyết**: `technical_specs` có thể là một object được lưu trong `f.metadata`. Khi import từ Excel/CAD, các cột không mapping sẽ được đưa vào `metadata.properties` hoặc `metadata.technical_specs`.
- **Phương án**: Sửa `prepareExcelData` trong `exportService.ts` để loop qua mọi key trong `metadata.technical_specs` (nếu có) hoặc `metadata.properties` và trích xuất thành các cột mới với tiền tố `Tech_`.

### 🏗️ Architect Agent
- **KMZ Structure**: Một file `.kmz` thực sự là một file ZIP có extension `.kmz`. Để Google Earth nhận diện tốt nhất, file KML chính bên trong nên tên là `doc.kml`.
- **Gói Báo Cáo**: Gói export hiện tại chứa cả Excel. Việc đổi extension sang `.kmz` là khả thi vì nó là định dạng ZIP.
- **Phương án**: Đổi extension sang `.kmz`. Đổi tên `map_data.kml` thành `doc.kml`. Cập nhật `save` dialog filters.

### 🚀 Performance Agent
- **JSZip**: Việc nén tệp KMZ không tốn thêm tài nguyên so với ZIP.
- **Excel trích xuất**: Cần tối ưu việc loop qua metadata để tránh crash khi có hàng ngàn feature với hàng chục specs bổ sung.

### 🛡️ Security Agent
- **Sanitization**: Đảm bảo các tên cột (key) từ `technical_specs` được sanitize để không làm hỏng file Excel (không chứa ký tự đặc biệt cấm trong Header của Excel).

## 3. Consensus (Phương án tối ưu)
1. **Dữ liệu**: Trích xuất toàn bộ sub-object `metadata.technical_specs` và `metadata.properties` (nếu có) vào Excel. Dùng tiền tố `SPEC_` để phân biệt.
2. **Định dạng**: 
   - Đổi extension mặc định từ `.zip` thành `.kmz`.
   - Giữ nguyên thành phần bên trong (Excel + KML + Images) để đảm bảo đầy đủ báo cáo.
   - Thêm filter `.kmz` vào Save Dialog.

## 4. Kế hoạch thực thi (Implementation Plan)
- [ ] Task 1: Cập nhật `types.ts` để include `technical_specs` chính thức (tùy chọn).
- [ ] Task 2: Cập nhật hàm `prepareExcelData` trong `exportService.ts` để trích xuất Technical Specs.
- [ ] Task 3: Cập nhật `exportProjectData` để đổi extension sang `.kmz` và cập nhật filters.
- [ ] Task 4: Kiểm tra và verify kết quả.
