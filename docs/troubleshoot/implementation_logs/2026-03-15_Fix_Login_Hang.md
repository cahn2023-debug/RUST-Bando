# Implementation Log - [2026-03-15] - Fix Login Initialization Hang

## 🛠️ Thay đổi đã thực hiện:

### 1. Auth Store (`useAuthStore.ts`)
- **Kế thừa**: Giữ nguyên toàn bộ logic Firebase Auth hiện có.
- **Cải tiến**:
    - Rút ngắn `Safety Timeout` từ 10s xuống **4s**.
    - Thêm `console.debug` tại các điểm mấu chốt: bắt đầu listener, nhận event `onAuthStateChanged`.
    - Đảm bảo `initialized: true` và `loading: false` luôn được set khi timeout để không treo UI.

### 2. Main App (`App.tsx`)
- **Sửa lỗi**: Sửa lỗi chính tả "Core Sytem" thành "Core System".
- **Tính năng Recovery**: Cập nhật nút `SKIP INITIALIZATION (RECOVERY)` với style mờ (opacity 50%) và rõ hơn khi hover, giúp người dùng tự thoát nếu hệ thống khởi tạo bị nghẽn (zombie process/network issue).

## 🧪 Kết quả kiểm tra:
- **Regression Tests**: Đã chạy qua `test_manager.py` và pass `SimpleTest`.
- **Logic Verification**: Luồng Auth hiện tại sẽ tự giải phóng sau tối đa 4 giây, đảm bảo người dùng không bị kẹt vô tận.

## 📝 Next Steps:
- Giám sát console log để xác định xem `onAuthStateChanged` có thực sự bị kẹt không.
- Nếu vẫn gặp lỗi port 1420, cần hướng dẫn người dùng dọn dẹp tiến trình hệ thống.
