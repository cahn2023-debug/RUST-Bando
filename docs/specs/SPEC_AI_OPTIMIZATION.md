# SPEC_AI_OPTIMIZATION.md - Hướng Dẫn Tối Ưu Hóa AI Của Phần Mềm (V5.5)

> **Mục tiêu**: Nâng cấp toàn diện hệ thống AI Assistant để chạy mượt mà trên phần cứng hạn chế (RAM 2GB), tăng tốc độ suy luận và tiết kiệm tài nguyên hệ thống.

---

## 1. Ngôn ngữ & Công nghệ triển khai (Tech Stack)

### Core Backend (Rust + ONNX Runtime)
- **Framework**: Tauri v2 (Rust Backend).
- **AI Inference Engine**: `ort` (ONNX Runtime) v2.0-rc.12.
- **Acceleration**: 
  - **Windows/Low-end**: DirectML (Tận dụng GPU Onboard Intel/AMD).
  - **NVIDIA**: CUDA/TensorRT Feature.
  - **CPU**: OpenVINO (Intel) & Rayon (Parallelism).
- **Quantization**: Chuyển đổi sang định dạng **INT4 (Q4_K_M)** cho LLM và **INT8** cho YOLO/OCR.

---

## 2. Các chức năng cần triển khai (Feature Breakdown)

### A. Lượng tử hóa Mô hình (Quantization)
- **Mô tả**: Giảm kích thước file model và VRAM yêu cầu tới 70-75%.
- **Chi tiết triển khai**:
  - LLM (Phi-3 Mini): Chuyển từ FP16 (2GB+ RAM) sang **INT4** (~1.2GB RAM).
  - YOLOv8: Sử dụng phiên bản `yolov8n-quantized.onnx`.
  - OCR: Chuyển đổi các session Recognition sang mô hình nén.
- **Edge Cases**: Cần kiểm tra độ suy giảm chất lượng (Perplexity) sau khi lượng tử hóa. Đảm bảo parse JSON vẫn chính xác.

### B. KV Caching & GQA (Phi-3 Optimization)
- **Mô tả**: Tối ưu hóa bộ nhớ đệm Key-Value để xử lý văn bản dài mà không bị OOM (Out-of-memory).
- **Luồng xử lý**:
  - Khởi tạo KV Cache Tensor trống ở bước lặp đầu tiên.
  - Sau mỗi token sinh ra, lưu trạng thái Attention vào KV Cache.
  - Bước lặp tiếp theo chỉ truyền token cuối cùng + KV Cache vào model thay vì toàn bộ chuỗi (O(N) vs O(N^2)).
- **Dữ liệu**: Quản lý KV Cache thông qua `ort` Value (Named Inputs/Outputs).

### C. Quản lý Tensor & Device Migration
- **Mô tả**: Đảm bảo Zero-copy và đồng bộ thiết bị tính toán.
- **Logic**: 
  - Ưu tiên DirectML Execution Provider trên Windows.
  - Tự động fallback sang CPU nếu khởi tạo GPU thất bại.
  - Chuyển `ndarray` sang Tensor `ort` nhanh chóng bằng cách chia sẻ bộ nhớ.

---

## 3. Các giải pháp tối ưu (Optimization & Scalability)

### Hiệu năng (Performance)
1. **Pre-processing Parallelization**: Sử dụng `rayon` để xử lý ảnh đầu vào (YOLO/OCR) song song trên nhiều core.
2. **Tokenizer Caching**: Load `tokenizer.json` một lần duy nhất vào `OnceLock`.
3. **KV Cache Truncation**: Giới hạn context window ở 512-1024 tokens để tránh "trôi" RAM trên máy 2GB.

### Kiến trúc (Architecture)
- **Pattern**: **Strategy Pattern** cho Execution Providers. Hệ thống sẽ tự động check cấu hình phần cứng khi khởi động.
- **Clean Code**: Tách biệt logic `Pre-process` -> `Inference` -> `Post-process` thành các module độc lập.

### Bảo mật & Rủi ro (Security & Risks)
- **RAM Monitoring**: Tự động kích hoạt `AIManager::shutdown()` nếu phát hiện hệ thống thiếu hụt tài nguyên nghiêm trọng.
- **Model Integrity**: Kiểm tra SHA256 của file model sau khi nạp để tránh các cuộc tấn công qua file model độc hại.

---

### 🛠️ QUY TRÌNH THỰC THI (Next Steps)
1. Cập nhật `Cargo.toml` với các tính năng tăng tốc phần cứng.
2. Nâng cấp file `phi3.rs` để hỗ trợ KV Caching và Generator Loop.
3. Test benchmark ở chế độ `--release` để xác nhận tốc độ.

**Sếp thấy bản thiết kế hệ thống này đã ổn chưa? Có muốn điều chỉnh gì trước khi chúng ta gọi lệnh `/code` để hiện thực hoá không?**
