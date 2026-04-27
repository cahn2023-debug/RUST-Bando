# **PROJECT MANAGER V5.2 – KIẾN TRÚC DOANH NGHIỆP MODULAR (V2)**

Tài liệu này là bản đặc tả kỹ thuật chuyên sâu (Deep Dive) về cấu trúc mã nguồn, mối quan hệ cơ sở dữ liệu, kiến trúc metadata và luồng thực thi đồ thị (Graph Code) của hệ thống.

## **1\. Cấu Trúc Cây Thư Mục Lõi (Directory Structure)**

---

Hệ thống áp dụng nghiêm ngặt nguyên tắc Separation of Concerns, chia tách UI và Backend Logic theo các Bounded Contexts.

### **1.1 Backend (Rust / Tauri \- src-tauri/src/)**

Đóng vai trò là "Não bộ" xử lý Event Sourcing và Data Persistence.

src-tauri/src/  
├── core/                   \# Các Engine dùng chung (Platform Level)  
│   ├── actor/              \# Quản lý luồng bằng Tokio mpsc (Command, Event, Projection)  
│   ├── event/              \# Event Envelope, Hash Chain, Validation  
│   ├── projection/         \# Engine ánh xạ Event thành Read Models (SQLite)  
│   ├── sync/               \# Đồng bộ Vector Clock đa thiết bị  
│   └── plugin/             \# Môi trường cách ly (WASM Sandbox/Wasmtime) cho bên thứ 3  
│  
├── domain/                 \# Lõi nghiệp vụ (Bounded Contexts)  
│   ├── design/             \# Nghiệp vụ Bản đồ (Model, Event, Projection, DORI)  
│   ├── contract/           \# Tài chính (Hợp đồng, BOQ, Payment flow)  
│   ├── resource/           \# Cấp phát (Nhân sự, vật tư)  
│   └── implement/          \# Thực thi (Gantt, Task engine) \-\> Trung tâm hệ thống  
│  
├── spatial/                \# Thuật toán không gian, R-Tree indexing, ToGeoJSON  
└── metadata/               \# Schema Registry (JSON Schema Draft 2020-12)

### **1.2 Frontend (React / Vite \- src/)**

Đóng vai trò là "Giao diện tương tác" (Read Model Consumer) và Command Issuer.

src/  
├── modules/                \# Giao diện theo Domain  
│   ├── design/             \# Bản đồ, Layer, Palette  
│   ├── contract/           \# Bảng tính vật tư, phân tích  
│   ├── resource/           \# Quản lý team, thiết bị  
│   └── implement/          \# Kanban, biểu đồ Gantt, bảng tiến độ  
│  
├── shared/                 \# Thành phần dùng chung  
│   ├── components/         \# Atom/Molecule UI (Lucide, Radix)  
│   ├── hooks/              \# Custom hooks (e.g., useProjectData)  
│   └── store/              \# Zustand slices (e.g., useDesignSync)  
└── AppBootstrap.tsx        \# Vỏ bọc hệ thống: Auth, cấu hình DB trước khi mount UI

## **2\. Mối Quan Hệ Cơ Sở Dữ Liệu (Database Relationships)**

---

Dữ liệu trong container .pmp được chia làm hai phần: **Write Model** (Lưu lịch sử Event) và **Read Model** (Bảng quan hệ SQLite để truy vấn nhanh).

| Bảng (Table) | Khóa Ngoại (Foreign Keys) / Liên Kết | Vai trò Core   |
| :---- | :---- | :---- |
| **event\_store** | Self-referencing (prev\_hash \-\> hash) | **Source of Truth duy nhất.** Mọi bảng khác được build từ đây. |
| **projects** | Không có (Gốc) | Lưu UUID, tên, đường dẫn gốc. |
| **tasks** (Implement) | \-\> projects.id \-\> tasks.id (parent\_id) | **Hub Liên Kết.** Nhận reference từ Feature và Contract. |
| **work\_items** (Resource) | \-\> features.id \-\> materials.id \-\> tasks.id | Liên kết khối lượng bản vẽ (Design) với Đơn giá (Contract). |
| **entity\_index** | Polymorphic (entity\_type, entity\_id) | Bảng FTS5 ảo. Cho phép tìm kiếm full-text đa module cực nhanh. |

## **3\. Kiến Trúc Metadata (Metadata System)**

---

Thay vì tạo hàng trăm cột trong Database, hệ thống áp dụng cơ chế **Hybrid JSON Metadata**. Toàn bộ JSON payload được kiểm soát chặt chẽ bởi Schema Registry trước khi nạp vào Event Store.

* **system.\***: Do Core App quản lý (VD: system.last\_index\_time, system.epsg\_code \= 3857).  
* **analysis.\***: Kết quả từ AI Engine (VD: analysis.ocr\_text, analysis.entities).  
* **custom.\***: Dữ liệu người dùng tùy biến.  
* **plugin\_${name}.\***: Khu vực cách ly cho Plugin bên thứ 3\.

**Cơ chế Inheritance (Kế thừa):** Các bảng cấp dưới (VD: Contract BOQ Table) sẽ tự động tham chiếu và kế thừa metadata từ bảng projects nếu không có dữ liệu ghi đè, giải quyết triệt để tình trạng "mất trí nhớ" (Orphaned metadata) khi xuất báo cáo tổng hợp.

## **4\. Đồ Thị Luồng Gọi Hàm (Code Call Graph & Data Flow)**

---

Hệ thống ứng dụng mô hình luồng dữ liệu **"Single-Edit, Multi-Update"** với khả năng chịu tải cao, đi qua 4 giai đoạn chính để tránh hiện tượng khóa cơ sở dữ liệu (Database is locked):

1. **Giai đoạn 1: Optimistic UI (React)**  
   * User chỉnh sửa thông số trên giao diện.  
   * Zustand Store (VD: useDesignSync) cập nhật RAM state tức thì, mang lại độ phản hồi UI \< 1ms.  
2. **Giai đoạn 2: IPC Dispatch & Khởi tạo Event (Rust)**  
   * Frontend gọi lệnh safeInvoke('dispatch\_design\_events', payload).  
   * Tauri Backend nhận lệnh, bọc dữ liệu thành AppEvent và đẩy vào kênh bất đồng bộ Tokio mpsc::Sender.  
3. **Giai đoạn 3: Persistence Worker (Background)**  
   * EventStoreActor chạy ngầm nhận event từ hàng đợi, tính toán Hash liên kết, và mở transaction BEGIN IMMEDIATE để ghi vào file events.log (Sử dụng chế độ WAL).  
   * Bổ sung nhật ký vào audit\_logs.  
4. **Giai đoạn 4: Projection Rebuild**  
   * Event được truyền tiếp sang ProjectionActor.  
   * Engine đọc event và dịch ngược thành dữ liệu có cấu trúc vào các bảng Read Model (VD: design.db, bảng features). Dữ liệu này ngay lập tức khả dụng cho các module Analytics (DuckDB) hoặc lần nạp dự án tiếp theo.

*\-- Hết tài liệu V2 \--*