# TƯ VẤN: KIẾN TRÚC ĐỒNG BỘ DỮ LIỆU CAD (FIREBASE)

## 1. Ngôn ngữ & Công nghệ (Tech Stack)
- **Backend Sync**: Firestore (NoSQL, Real-time).
- **Client**: Zustand (Desktop State), Kotlin Flow (Android State).
- **Lý do**: Firestore hỗ trợ offline sẵn và đồng bộ real-time rất tốt, nhưng có giới hạn **1 MiB per document**.

---

## 2. Vấn đề hiện tại (Root Cause)
Hiện tại, chúng ta đang lưu **toàn bộ MapState (hàng nghìn feature)** vào duy nhất một document: `design_projects/{projectId}`.
- **Rủi ro**: 1,000 markers với tọa độ và thuộc tính có thể vượt quá 1MB.
- **Triệu chứng**: Desktop bị treo ở trạng thái "Syncing..." vì payload quá lớn, Firestore SDK từ chối write hoặc write quá chậm. Android nhận về "Cloud Synced (0)" vì Firestore document chưa bao giờ được ghi thành công lên server.

---

## 3. Kiến trúc Đề xuất (Scalable Design)

### Chuyển đổi sang Subcollection
Thay vì lưu tất cả feature vào một map, chúng ta sẽ lưu mỗi feature là một document riêng biệt.

#### A. Cấu trúc Firestore mới:
- `projects/{projectId}` (Document)
  - `name`: "Dự án Thuận Thành V4"
  - `updatedAt`: timestamp
  - `layers`: { map... }
  - `features` (Subcollection)
    - `{featureId}` (Document)
      - `id`: string
      - `name`: string
      - `geom_type`: "Point"
      - `coordinates`: [...]
      - `metadata`: string

#### B. Ưu điểm:
- **Xóa bỏ giới hạn**: Bạn có thể lưu hàng triệu feature (mỗi cái 1MB max).
- **Tiết kiệm băng thông**: Client chỉ cần listen thay đổi trên những feature bị sửa, không phải tải lại toàn bộ map 1MB mỗi lần.
- **Tốc độ**: Firestore xử lý subcollection cực nhanh.

---

## 4. Kế hoạch Triển khai (Feature Breakdown)

### Bước 1: Desktop - Sync theo Feature
- Sửa `pushStateToFirestore` để write metadata vào project doc.
- Lặp qua `state.features` và write từng feature vào subcollection `features`.

### Bước 2: Android - Listen Subcollection
- Sửa `DesignSyncRepository.kt` để dùng `collectionGroup` hoặc `collection("features").addSnapshotListener`.

---

## 5. Giải pháp Tối ưu (Optimization)
- **Batching**: Sử dụng `WriteBatch` trong Firestore để đẩy 500 features cùng lúc (giảm số lượng request).
- **Delta Sync**: Đã có trên Desktop, chỉ đẩy những `dirty_ids`. Chúng ta sẽ tận dụng cái này để chỉ update feature nào vừa thay đổi.
- **Stability-Aware Listen (NEW)**: Sử dụng flag `hasPendingWrites` trong Firestore snapshot listener để phớt lờ các trạng thái trung gian (chưa ổn định) từ cloud khi đang đồng bộ metadata và features riêng biệt.


---

### Sếp thấy bản thiết kế hệ thống này đã ổn chưa? 
Nếu sếp đồng ý, em sẽ thực hiện bước **Phòng thủ (Phòng ngừa treo sync)** trước bằng cách log lỗi size và sau đó tiến hành nâng cấp lên kiến trúc Subcollection.
