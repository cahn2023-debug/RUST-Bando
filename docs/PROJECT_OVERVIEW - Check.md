Dựa trên tài liệu `PROJECT_OVERVIEW.md` và kiến trúc hiện tại của **RUST-BANDO**, dưới đây là bản đánh giá chi tiết, checklist rà soát code V1 `.pmp`, lộ trình scale và chiến lược kiểm thử chuyên sâu.

---
## 📊 1. Đánh giá chi tiết dự án

### ✅ Điểm mạnh (Strengths)
| Hạng mục | Đánh giá |
|----------|----------|
| **Kiến trúc phân tầng rõ ràng** | Tách biệt Frontend (React/Vite) ↔ Backend (Rust/Tauri) ↔ Renderer (WASM/WGPU) ↔ Domain/Storage. Giảm coupling, dễ bảo trì. |
| **Event Sourcing V2 + SQLite `.pmp`** | Thiết kế monolithic `.pmp` giúp đóng gói toàn bộ trạng thái dự án vào 1 file, phù hợp cho trao đổi offline. WAL + `busy_timeout` 30s + `spawn_blocking` giải quyết tốt deadlock UI thread. |
| **Hiệu năng Rendering** | WGPU + WASM bridge xử lý hàng chục ngàn vector ở 60fps. Đã áp dụng `Pooled Hydration`, `Zoom-level Culling`, `Optimistic Updates` → tối ưu UX cho dự án lớn. |
| **AI & P2P tích hợp sẵn** | Pipeline ONNX (`ort`) với lazy loading + quantized model (Qwen 2.5-0.5B) giảm memory footprint. `libp2p` + RocksDB cho phép sync phi tập trung, phù hợp môi trường offline/edge. |

### ⚠️ Rủi ro & Điểm yếu tiềm ẩn
| Hạng mục | Rủi ro | Gợi ý giảm thiểu |
|----------|--------|------------------|
| **SQLite concurrency** | `.pmp` là monolithic file, khi sync P2P nhiều node hoặc thao tác đồng thời sẽ dễ gặp lock/fragmentation. | Cân nhắc CRDT cho conflict resolution, hoặc chia `.pmp` thành chunks theo không gian/thời gian. |
| **WASM Memory Limit** | Browser/OS giới hạn bộ nhớ cho WASM (~2-4GB). Load nhiều model AI + GIS data cùng lúc dễ OOM. | Áp dụng `wasm-bindgen` memory pooling, explicit `drop()` cho WASM heap, monitor via `tracing`. |
| **Cross-platform Build** | Windows CRT conflict (`LNK2038`), `libclang`/`nasm` phụ thuộc vẫn gây gián đoạn CI. | Đóng gói toolchain qua `rustup` + `cargo-binstall`, dùng `cross` hoặc Docker matrix cho CI. |
| **Độ phức tạp hệ thống** | 5 subsystem (UI, DB, GIS, AI, P2P) chạy cùng process → khó isolate bug, profiling phức tạp. | Tách P2P/AI thành `tauri plugin` hoặc background service, dùng `tokio` task isolation rõ ràng. |

---
## 🔍 2. Kiểm tra sót code V1 `.pmp`

Vì bạn đã xóa cấu trúc V1, hãy rà soát hệ thống bằng **Checklist tự động + thủ công** sau:

### 🛠️ Lệnh rà soát nhanh (Terminal)
```bash
# 1. Tìm từ khóa liên quan V1/Migration cũ
grep -rn "V1ToV2Migrator\|v1_schema\|legacy_pmp\|old_event_store\|migration_v1" . --include="*.rs" --include="*.ts" --include="*.json"

# 2. Kiểm tra Cargo features / conditional compilation
grep -rn "cfg_attr.*v1_compat\|feature.*legacy\|#\[cfg(v1)" . --include="*.rs"

# 3. Tìm serde backward-compat cũ
grep -rn "serde(flatten)" . --include="*.rs" | grep -v "V2\|current"

# 4. Rà soát thư mục BAK/ và test cũ
find BAK/ tests/ -type f -name "*.rs" -o -name "*.ts" | xargs grep -l "v1\|V1ToV2"
```

### 📋 Checklist thủ công
| Vị trí | Cần kiểm tra |
|--------|--------------|
| `src-tauri/src/core/storage/` | Có còn struct `EventV1`, `ProjectMetaV1` hoặc hàm `migrate_v1_to_v2()` không? |
| `Cargo.toml` / `crates/*/Cargo.toml` | Feature `v1_compat`, `legacy_migration`, dependency `rusqlite` version cũ? |
| `design_renderer/` | Bridge JS ↔ WASM còn giữ `window.__pmp_v1__` hoặc fallback renderer cũ? |
| `BAK/` | Thư mục backup có chứa `*.rs.bak`, `*.sql.v1`, `migrations/001_legacy.sql`? |
| CI/CD (`*.yml`, `Makefile`) | Step build/test có chạy `cargo test --features v1_migration`? |
| Schema SQLite | Mở file `.pmp` mới bằng DB Browser, kiểm tra table `app_events`, `metadata` đã bỏ column V1 (VD: `legacy_id`, `old_format`) chưa? |

> 💡 **Lời khuyên:** Nếu tìm thấy, hãy đánh dấu `#[deprecated(since = "2026.05.06", note = "V1 structure removed")]` trước khi xóa để tránh break runtime ngầm. Chạy `cargo audit` + `cargo outdated` sau khi dọn.

---
## 🚀 3. Hướng Scale dự án

| Tầng | Giải pháp Scale | Công cụ/Cách tiếp cận |
|----------------------|------------------------|
| **Rendering (WASM/WGPU)** | - Instanced Drawing cho geometry lặp<br>- Spatial Indexing (R-Tree/QuadTree) cho GIS<br>- Tile-based streaming cho dataset >100k features | `wgpu` render bundles, `geo` crate + `rstar`, Web Workers cho parsing |
| **Storage (.pmp + SQLite)** | - Connection pooling (`sqlx`)<br>- WAL checkpoint tự động<br>- Chia file `.pmp` theo region/time nếu dự án >5GB | `sqlx::Pool`, `PRAGMA wal_checkpoint(PASSIVE)`, `RocksDB` layer cho cache |
| **AI Inference** | - Dynamic VRAM offload<br>- Batch inference queue<br>- Model versioning + fallback | `ort` execution providers (CUDA/DirectML), `tokio::sync::mpsc`, ONNX model registry |
| **P2P Sync** | - CRDT (Yjs/Automerge) cho conflict-free merge<br>- Delta sync thay vì full-state<br>- QUIC transport thay thế TCP | `libp2p` + `libp2p-quic`, `automerge-rs`, gossipsub optimization |
| **Architecture** | - Tách AI & P2P thành `tauri plugin` riêng<br>- Micro-frontend cho module Design/GIS<br>- WASM workers cho heavy computation | `tauri-plugin-*`, Vite module federation, `wasm-bindgen-rayon` |

---
## 🧪 4. Chiến lược kiểm tra Bug & QA

### 🔹 Phân tầng Testing
| Tầng | Công cụ | Mục tiêu |
|------|---------|----------|
| **Unit** | `cargo test`, `Vitest` | Domain logic, serde round-trip, GIS math, AI pipeline input/output |
| **Integration** | `tauri-driver`, `mockall`, `sqlite-test` | Tauri IPC ↔ Rust commands, Event Store commit/rollback, WASM bridge serialization |
| **E2E** | `Playwright`, `cypress` | Workflow: Create project → Add GIS features → Run AI → Sync P2P → Export `.pmp` |
| **Load/Stress** | `k6`, `cargo stress`, `tracy` | >10k features render, 50 concurrent DB writes, AI batch 100 images, P2P 5-node sync |
| **Memory/Leak** | `valgrind`, `heaptrack`, Chrome Memory Profiler | Track WASM heap, `ort` model leak, SQLite connection leak, React state bloat |

### 🔹 Kịch bản kiểm thử trọng tâm (dựa trên lịch sử lỗi)
1. **Database Locking:** 
   - Mô phỏng: Mở 2 instance Tauri cùng truy cập 1 `.pmp`, trigger sync + save đồng thời.
   - Expect: Không deadlock, `busy_timeout` hoạt động, WAL auto-checkpoint.
2. **AI Memory Overhead:**
   - Mô phỏng: Máy 2GB RAM, load Qwen 2.5-0.5B + chạy 10 inference liên tiếp.
   - Expect: Lazy loading kích hoạt, `Release RAM` button hoạt động, không OOM.
3. **Renderer Lag (>10k features):**
   - Mô phỏng: Import 50k vector, zoom in/out liên tục, pan nhanh.
   - Expect: FPS ổn định >45, `Zoom-level Culling` active, không main-thread freeze.
4. **Migration V1→V2 Residue:**
   - Mô phỏng: Import file `.pmp` V1 cũ (nếu còn), kiểm tra `V1ToV2Migrator` trả về `Err` gracefully thay vì panic.
5. **Windows Build:**
   - Mô phỏng: Clean build trên MSVC x64, không có `libclang`/`nasm` global.
   - Expect: `AWS_LC_SYS_NO_ASM=1` + `CARGO_PROFILE_RELEASE_LTO=true` compile thành công, no `LNK2038`.

### 🔹 CI/CD & Monitoring
- **Pipeline:** `cargo test` → `cargo clippy` → `wasm-pack test` → `playwright e2e` → `cargo build --release` (Windows/macOS/Linux matrix)
- **Telemetry:** `tracing` + `opentelemetry` để log event store latency, WASM render time, AI inference duration
- **Fuzzing:** `cargo fuzz` cho parser `.pmp`, serde deserializer, GIS coordinate validator

---
## ✅ Kết luận & Bước tiếp theo
1. **Chạy checklist V1** ngay để đảm bảo không còn reference ngầm gây runtime crash hoặc schema drift.
2. **Ưu tiên scale Rendering & Storage** trước vì đây là bottleneck thực tế nhất với dự án GIS lớn.
3. **Thiết lập CI matrix** + automated load test cho 3 historical bugs (DB lock, AI memory, renderer lag).
4. Nếu cần, tôi có thể hỗ trợ:
   - Viết script Python/Rust tự động quét V1 residue
   - Cấu hình `github-actions.yml` cho cross-platform build + test
   - Thiết kế benchmark harness cho WASM renderer & SQLite event store

Bạn muốn đi sâu vào phần nào trước? (Rà soát V1 / Benchmark / CI Pipeline / P2P Sync Optimization)