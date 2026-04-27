## 🔍 Debug: LNK1201 Error Writing PDB

### 1. Symptom
Lỗi biên dịch `LINK : fatal error LNK1201: error writing to program database ... check for insufficient disk space` xảy ra khi chạy `npm run tauri dev`.

### 2. Information Gathered
- **Error**: `LNK1201` (Linker failure)
- **Disk Free (D:)**: **117 MB** (Cực kỳ thấp)
- **Target Dir Size**: **47.19 GB** (Rất lớn)
- **File affected**: `target\debug\deps\project_manager.pdb`

### 3. Hypotheses
1. 🎯 **Hết dung lượng ổ đĩa (Insufficient Disk Space)**: PDB file của Rust debug mode thường từ 100MB-500MB. Với 117MB trống, linker không thể ghi file mới.
2. ❓ **Zombie process**: Có tiến trình khác đang khóa file `.pdb` (Đã kiểm tra và không thấy).

### 4. Investigation

**Testing hypothesis 1 (Disk Space):**
- Đã chạy lệnh `wmic` để kiểm tra dung lượng ổ `D:`.
- Kết quả: ổ `D:` chỉ còn **117,198,848 bytes** (~117 MB).
- Đã kiểm tra thư mục `target/`: nặng tới **47.19 GB**.

### 5. Root Cause
🎯 **Ổ đĩa D: cạn kiệt dung lượng.** Thư mục `target/` tích lũy quá nhiều dữ liệu rác từ các lần build trước, trong khi ổ đĩa chỉ còn 117MB, không đủ để tạo file PDB mới cho bản build hiện tại.

### 6. Fix
Bạn cần dọn dẹp thư mục `target` để giải phóng dung lượng.
**Lưu ý**: Lệnh này sẽ xóa toàn bộ file build cũ, lần chạy sau sẽ mất thêm thời gian để compile lại từ đầu.

```powershell
# Chạy lệnh này trong folder RUST
cargo clean --manifest-path src-tauri/Cargo.toml
```

### 7. Prevention
🛡️ Thường xuyên chạy `cargo clean` hoặc sử dụng các công cụ như `cargo-sweep` để dọn dẹp `target/` định kỳ.
