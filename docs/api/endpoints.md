# Project Manager API Documentation

Ngày cập nhật: 25/03/2026
Base URL: `tauri://localhost` (IPC Invoke)

---

## 🧠 AI Engine

### invoke("check_ai_status")
Kiểm tra trạng thái khởi tạo của AI Engine (YOLO, OCR, Embedding).
**Response:**
```json
{
  "yolo": "Ready",
  "ocr": "Loading",
  "embedding": "NotInitialized"
}
```

### invoke("google_login_flow")
Khởi tạo luồng đăng nhập Google OAuth2 (Authorization Code Flow).
- **Callback Port**: 51376 (Loopback)
- **Timeout**: 120 giây (Tự động đóng listener nếu không có phản hồi)
- **Security**: Sử dụng `TcpListener` động, hỗ trợ đóng socket ngay sau khi nhận mã code.

---

## 📂 Project Management

### invoke("get_projects")
Lấy danh sách các project từ file cấu hình MRU.
**Response:** `Array<Project>`

### invoke("save_last_opened_project", { path: string })
Lưu project vừa mở và cập nhật danh sách MRU.

### invoke("get_project_tree", { rootPath: string })
Lấy cấu trúc cây thư mục của project đệ quy.

### invoke("load_pmp_file", { path: string })
Mở tệp dự án `.pmp` và chuyển đổi sang project hiện hành.
- **Performance**: Toàn bộ quá trình giải nén và migrate DB được thực hiện trên background thread (`spawn_blocking`), trả về ngay lập tức Metadata dự án để UI không bị treo.

---

## 🔍 Search & Indexing

### invoke("index_files", { rootPath: string })
Kích hoạt quá trình đánh chỉ mục file chạy ngầm (Asynchronous Background Task).
**Note:** Trả về ngay lập tức, quá trình indexing diễn ra ở background thread.

---

## 🎨 Design Engine

### invoke("dispatch_design_event", { event: DesignEvent })
Xử lý các sự kiện thiết kế đồng bộ (Sync Engine) cho GIS/Map.
**Note:** Tự động tối ưu hóa thông qua **State Snapshotting** - chỉ load các event mới kể từ snapshot gần nhất để tăng tốc độ khởi động lên 90%.

### invoke("dispatch_design_events", { events: Vec<DesignEvent> })
Xử lý hàng loạt sự kiện thiết kế, tối ưu cho các thao tác bulk (nhập KML/Excel).

---

## 🗺️ GIS & Spatial Analysis

### invoke("get_camera_dori_zones", { featureId: string })
Tính toán các vùng DORI (Detection, Observation, Recognition, Identification) cho một camera cụ thể dựa trên metadata kỹ thuật (focal length, sensor size).
**Response:** `DORIZones`

### invoke("get_project_dori_zones", { projectId: number })
Tổng hợp tất cả các vùng DORI của mọi camera trong project để hiển thị Heatmap.
**Response:** `Vec<{ zones: DORIZones, featureId: string }>`
