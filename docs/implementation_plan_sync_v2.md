# /plan - Fix Firestore Sync (Subcollection Architecture)

## 1. Goal
Lỗi "Dữ liệu không đồng bộ" do payload vượt quá giới hạn 1MB của Firestore document. Chuyển sang kiến trúc Subcollection để lưu từng feature riêng biệt, tăng tính ổn định và khả năng mở rộng.

## 2. Proposed Changes

### [Component] Desktop (React/Tauri)

#### [MODIFY] [firestoreSync.ts](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/src/IMPLEMENT/lib/firestoreSync.ts)
- Thay đổi `pushStateToFirestore` để chỉ push metadata (regions, layers) vào document chính.
- Tạo hàm `pushFeaturesToFirestore` sử dụng `WriteBatch` để push từng feature vào subcollection `features`.
- Thêm kiểm tra kích thước payload trước khi push.

#### [MODIFY] [useDesignSync.ts](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/src/IMPLEMENT/stores/useDesignSync.ts)
- Cập nhật hàm `forceSyncToCloud` để gọi các hàm sync mới.
- Cải thiện error handling để không bị treo trạng thái "Syncing...".

### [Component] Android (Kotlin)

#### [MODIFY] [DesignSyncRepository.kt](file:///d:/Code%20Antinigaty/Phan%20mem%20quan%20ly%20file%20V4/RUST/android-design/app/src/main/kotlin/com/thanh/design/core/DesignSyncRepository.kt)
- Sửa `listenToProjectDesign` để listen đồng thời document chính (metadata) và subcollection `features`.
- Gộp dữ liệu từ 2 nguồn này thành một `MapState` hoàn chỉnh cho ViewModel.

## 3. Verification Plan

### Automated/Manual Tests
1. **Desktop Sync**: Click "Cloud Synced" button, verify console shows batch success messages.
2. **Firestore Console**: Verify documents are created in `design_projects/{id}/features/` subcollection.
3. **Android View**: Verify "Cloud Synced (X)" shows correct count and markers appear on map.

### Edge Cases
- **Vượt quá 500 features**: Batch tự động commit và tạo batch mới. (Firestore limit 500 ops/batch).
- **Mất mạng**: Firestore persistence tự động lưu queue và đẩy khi có mạng.
