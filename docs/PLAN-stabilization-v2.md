# PLAN: Stabilization & Technical Debt Resolution (V2)

## Context
Dự án đã đạt đến giai đoạn phức tạp cao với kiến trúc Event Sourcing/CQRS. Quy trình ổn định hóa đang được thực hiện theo 7 giai đoạn để đảm bảo ứng dụng chạy mượt mà trên máy cấu hình thấp (2GB RAM) và hỗ trợ cộng tác offline.

## Current Progress: Phase 5 [COMPLETED]

| Phase | Description | Priority | Status |
|-------|-------------|----------|--------|
| Phase 1 | Infrastructure Cleanup & .gitignore | P0 | ✅ DONE |
| Phase 2 | IPC Stability & State Management | P0 | ✅ DONE |
| Phase 3 | Event Sourcing & CQRS Core | P1 | ✅ DONE |
| Phase 4 | Storage Integrity & Migration Safety | P1 | 🟡 90% (Pending: Snapshot Validation) |
| Phase 5 | AI Engine Optimization (Qwen 2.5) | P2 | ✅ DONE |
| Phase 6 | P2P GIS Synchronization (Libp2p) | P2 | 📋 PLANNED |
| Phase 7 | Realtime Rendering & Map Optimization | P3 | 📋 PLANNED |

---

## Detailed Tasks

### Phase 4: Storage Integrity (Priority: P1)
- [x] Wrap migrations in transactions.
- [x] Add SHA256 checksum validation for event log.
- [ ] Implement snapshot recovery guards & validation.

### Phase 5: AI Engine Optimization (Priority: P2)
- [x] Integrate Qwen 2.5 (0.5B/1.5B) INT4 Model.
- [x] Implement Lazy Loading & Auto-Unload (Idle timeout).
- [x] Create AI Performance Benchmark tool.

### Phase 6: P2P GIS Synchronization (Priority: P2)
*Mục tiêu: Đồng bộ hóa Event Log thời gian thực giữa các máy trạm trong cùng mạng LAN mà không cần Server trung tâm.*

#### 📡 Technical Design:
- **Network Stack**: 
  - **Discovery**: `libp2p-mdns` để tự động nhận diện các node Antigravity trong mạng LAN.
  - **Transport**: `libp2p-tcp` + `libp2p-quic` cho việc truyền tải dữ liệu dung lượng lớn (GIs shards).
- **Protocol: GIS-Sync-v1**:
  - **Gossipsub**: Trao đổi "State Head" (tổng kết hash của event log cuối cùng).
  - **Request-Response**: Khi phát hiện lệch Hash, node sẽ yêu cầu fetch các chunk dữ liệu còn thiếu từ peer.
- **Handling Conflict**: 
  - Sử dụng **Vector Clocks** gắn với mỗi Event ID.
  - Trường hợp cùng edit 1 đối tượng: Áp dụng quy tắc "Last Write Wins" dựa trên timestamp đồng bộ từ NTP hoặc local clock (với sai số cho phép).

### Phase 7: WGPU Renderer & Map Optimization (Priority: P3)
*Mục tiêu: Đạt hiệu năng hiển thị hàng triệu đối tượng với tốc độ 60fps trên RAM 2GB.*

#### 🚀 Optimization Roadmap:
- **Spatial Indexing (Rust-side)**:
  - Tích hợp crate `rstar` để duy trì một **R-Tree** động cho mọi `EntityType`.
  - Giảm độ phức tạp từ O(N) xuống O(log N) khi truy vấn các đối tượng trong khung nhìn nhìn (Viewport).
- **Memory & Buffer Management**:
  - **Incremental Updates**: Thay vì tạo mới Vertex/Index Buffer mỗi khi nạp dữ liệu (Current implementation), sử dụng `queue.write_buffer` để cập nhật các delta vùng nhớ bị thay đổi.
  - **Instanced Rendering**: Cho các đối tượng lặp lại nhiều như Camera icons, Sensors.
- **LOD (Level Of Detail)**:
  - Khi zoom xa: Gộp các nhóm đối tượng (clustering) hoặc sử dụng simplified polyline (Ramer-Douglas-Peucker).
  - Khi zoom gần: Hiển thị đầy đủ metadata và high-res geometry.

### Phase 8: Security Audit & Distribution (Priority: P4)
- **Sanitization**: Kiểm tra toàn bộ luồng IPC từ Frontend gọi xuống Tauri (Vá lỗ hổng Command Injection).
- **Signed Events**: Hash (SHA256) của Phase 4 sẽ được ký số bằng private key của trạm để đảm bảo tính xác thực trong mạng P2P.
- **Distribution**: Cấu hình GitHub Actions để tự động build bản cài đặt MSI (Windows) với chữ ký số.

---

## Verification Plan (Final)
- [ ] **P2P Test**: Chạy 3 instance ứng dụng trên 3 máy ảo khác nhau, sync 100k GIS events trong < 5s.
- [ ] **Bench Test**: Sử dụng `ai_benchmark` kết hợp với `map_profiler` để theo dõi RAM áp lực cao.
- [ ] **Security**: Quét dự án với `cargo-audit` và `vulnerability-scanner`.

---
*Created by Antigravity Orchestrator - v4.0.2 FINAL SPEC*
