# Troubleshoot Log: Mất đường màu xanh Street View

## 1. Phân tích lỗi
- **Triệu chứng**: Khi kích hoạt Street View, các đường màu xanh (coverage) không hiển thị trên bản đồ chính.
- **Nguyên nhân giả định**: Trong bước "Dọn dẹp code" (Step 317), Agent đã xóa bỏ `TileLayer` và `Marker` khỏi `StreetViewControl.tsx` vì cho rằng chúng thuộc về hệ thống popup cũ.
- **Thực tế**: `TileLayer` với `lyrs=svv` là thành phần trực tiếp hiển thị các đường màu xanh của Google Maps trên lớp bản đồ Leaflet.

## 2. Hội ý Hội đồng 4 Agent (Virtual Council)

### 🕵️ Logic Agent
> "Tôi đã sai lầm khi đánh giá `TileLayer` là 'unused'. Dù chúng ta chuyển Street View sang cửa sổ mới, bản đồ phía dưới vẫn cần lớp phủ này để người dùng biết chỗ nào có Street View mà click."

### 🏗️ Architect Agent
> "Cấu trúc hiện tại của `StreetViewControl` là đúng cho logic mở cửa sổ, nhưng thiếu phần 'View' trên bản đồ mẹ. Cần khôi phục `TileLayer` và `Marker` (chỉ vị trí đang xem) để duy trì trải nghiệm người dùng."

### 🚀 Performance Agent
> "Việc thêm lại `TileLayer` không ảnh hưởng nhiều đến hiệu năng vì nó chỉ hiển thị khi `isActive = true`."

### 🛡️ Security Agent
> "Không có rủi ro bảo mật nào khi khôi phục lớp hiển thị này."

## 3. Phương án xử lý
- Khôi phục `TileLayer` (source `lyrs=svv`) vào `StreetViewControl.tsx`.
- Khôi phục `Marker` (Pegman) để người dùng thấy vị trí mình đang xem trên bản đồ chính.
- Import lại các component cần thiết từ `react-leaflet`.
