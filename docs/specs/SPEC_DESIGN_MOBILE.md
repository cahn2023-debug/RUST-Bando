# SPEC_DESIGN_MOBILE - Đồng bộ hoá tính năng DESIGN từ Desktop sang Android

## 1. Ngôn ngữ & Công nghệ triển khai (Tech Stack)
- **Cốt lõi**: Kotlin + Jetpack Compose (Modern UI).
- **Bản đồ**: osmdroid (Open Source, linh hoạt cho custom overlays).
- **Core Logic**: Rust Bridge (LNI/JNI) - Sử dụng chung logic tính toán, R-Tree spatial index từ core của Desktop.
- **State Management**: Kotlin Flow & ViewModel (StateFlow for reactive UI).
- **Network/Sync**: Firestore (cho dữ liệu đám mây) & Local SQLite (qua Rust bridge).

## 2. Các chức năng cần triển khai (Feature Breakdown)

### A. Công cụ CAD nâng cao (Advanced CAD Tools)
- **Vertex Editing (Chỉnh sửa đỉnh)**: 
    - **Mô tả**: Cho phép người dùng chọn một đường (Polyline) hoặc vùng (Polygon) và di chuyển từng đỉnh một cách độc lập.
    - **Luồng xử lý**: Nhấn giữ đối tượng -> Hiện các handle (nút tròn) tại mỗi đỉnh -> Kéo handle để di chuyển đỉnh -> Tự động cập nhật toạ độ qua Rust Bridge.
    - **Trường hợp góc**: Xoá đỉnh khi kéo quá gần đỉnh khác, thêm đỉnh mới ở giữa 2 đỉnh cũ.
- **Snapping Logic (Bắt điểm)**:
    - **Mô tả**: Tự động hít (snap) con trỏ vào các điểm quan trọng khi đang vẽ.
    - **Logic**: Hít vào Endpoint (điểm đầu/cuối), Midpoint (điểm giữa), và Intersections (điểm giao).

### B. Hệ thống Palette Mobile (Mobile-Optimized Panels)
- **SpecPanel (Bảng thông số)**: 
    - **Mô tả**: Hiển thị chi tiết và cho phép chỉnh sửa thuộc tính của đối tượng đang chọn.
    - **Giải pháp UI**: Sử dụng `ModalBottomSheet` thay vì panel nổi (palette) như desktop để tối ưu diện tích màn hình điện thoại.
- **Layer Manager**: Bật/tắt hiển thị của các nhóm đối tượng (Cáp, Vật tư, Thiết bị).

### C. Camera & FOV (Field Of View)
- **Mô tả**: Trải nghiệm quan sát góc nhìn camera tại hiện trường.
- **Mô tả**: Hiển thị vùng quan sát (FOV polygon) với khả năng quay (rotate) trực quan trên bản đồ bằng cử chỉ xoay.
- **Preview**: Chế độ Picture-in-Picture hiển thị giả lập luồng video từ camera (nếu có dữ liệu ảnh/video mẫu).

### D. Trợ lý thiết kế AI (Design Assistant)
- **Mô tả**: Tích hợp chat bot AI ngay trong giao diện thiết kế.
- **Luồng xử lý**: User đặt câu hỏi "Thiết bị này có phù hợp không?" -> AI phân tích metadata và trả lời dựa trên context hiện tại của bản đồ.

## 3. Các giải pháp tối ưu (Optimization & Scalability)
- **Hiệu năng**: 
    - Sử dụng `FolderOverlay` trong osmdroid để quản lý hàng ngàn marker mà không bị lag.
    - Render dựa trên Viewport: Chỉ lấy dữ liệu từ Rust bridge cho vùng diện tích đang hiển thị trên màn hình.
- **Kiến trúc**: 
    - **MVVM**: Tách biệt hoàn toàn Map Logic (UI) và Data Processing (ViewModel/Rust).
- **Bảo mật**: 
    - Toàn bộ dữ liệu nhạy cảm được xử lý qua lớp Rust Bridge đã được mã hoá.

---
### 🛠️ QUY TRÌNH THỰC THI (Next Steps)
1. Sếp thấy bản thiết kế hệ thống này đã ổn chưa? Có muốn ưu tiên tính năng nào trước không?
2. Nếu ổn, chúng ta sẽ bắt đầu với **Phase 1: Vertex Editing** - đây là trái tim của việc chỉnh sửa bản đồ chuyên nghiệp.
