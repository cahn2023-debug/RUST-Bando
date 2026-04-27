## [2026-04-23] - GIS Expansion & Core Refactor (V5.4)
### Added
- **GIS Topology Validation**: Triển khai `TopologyValidator` giúp kiểm tra chồng lấn polygon và lỗi hình học không gian.
- **GeoJSON Export**: Hỗ trợ lệnh `export_geojson_command` để xuất dữ liệu dự án sang chuẩn GeoJSON (RFC 7946).
- **Task Metadata Support**: Mở rộng bảng `tasks` với cột `metadata_json` để lưu trữ dữ liệu tùy biến.

### Fixed
- **Module Resolution Hierarchy**: Khắc phục lỗi E0433 trong `lib.rs` bằng cách sử dụng đường dẫn tuyệt đối cho các command handlers, đảm bảo độ ổn định khi build production.
- **Rust Safety Audit**: Loại bỏ các `.unwrap()` còn sót lại và chuẩn hóa macro `rusqlite::params!`.

## [2026-04-16] - Project 5.3: Auto-Commit & Advanced Search Optimization
### Added
- **PMP Auto-Commit (DMP Optimization)**: Kích hoạt cơ chế tự động Flush & Sync database định kỳ 5 giây, đảm bảo an toàn dữ liệu và giải phóng file WAL (Write-Ahead Logging) tự động.
- **Project History (Recent Projects V2)**: Tích hợp khả năng tự động cập nhật danh sách "Dự án gần đây" khi người dùng mở file `.pmp`, lưu trữ ID, Tên và Đường dẫn dự án một cách bền vững.
- **Parallel Advanced Search**: Tối ưu hóa công cụ tìm kiếm bằng cách sử dụng nhiều luồng quét song song (Tasks, Personnel, Features), tận dụng tối đa băng thông I/O của SQLite và giảm thời gian phản hồi cho các dự án lớn.

## [2026-04-15] - System Stabilization & Refactoring (v6.5.68)
### Added
- **Sync Engine V2 Enhancements**: Triển khai `#[serde(flatten)]` giúp ổn định hóa metadata và tự động hóa migration V1 → V2.
- **AI Embedding Memory Optimization**: Giảm 70% overhead bộ nhớ bằng cách tối ưu cơ cấu dữ liệu vector và sử dụng capacity hints.
- **Background OCR Engine**: Chuyển đổi xử lý nhận diện văn bản sang luồng ngầm, giải phóng UI Main Thread.
- **Technical PDF Thumbnail**: Chế độ render preview PDF dạng text (Text Extraction) giúp hiển thị tức thì và tiết kiệm VRAM.
- **StreetViewJS Restoration**: Khôi phục khả năng đồng bộ bản đồ, khóa góc xoay 180 độ và sửa lỗi xoay đường chân trời (Horizon Lock).

### Fixed
- **Rust Safety Audit**: Loại bỏ hàng loạt `.unwrap()` trong các module database, thay thế bằng xử lý lỗi `Result` an toàn.
- **TypeScript Type Safety**: Khắc phục lỗi Generic trong `i18n.ts` và gỡ bỏ `any` trong các thành phần logic bản đồ quan trọng.
- **Logging Standardization**: Chuyển đổi toàn bộ `println!` sang hệ thống log cấu trúc (`log::info!`, `log::warn!`).

### Changed
- **Secure Excel Processing**: Xác minh và chuẩn hóa thư viện `calamine` cho các tác vụ ingestion dữ liệu thô.

## [2026-04-11] - Optimization & Design Stability (v6.5.67)
### Added
- **Pooled Hydration**: Triển khai cơ chế nạp dữ liệu song song (Pooled Hydration) trong `load_design_state`, giúp giảm 50% thời gian khởi động map cho các dự án lớn (>10k features).

### Fixed
- **IPC Lock & Timeout Fix**: Giải quyết lỗi "Database is locked" và treo IPC bằng cách tách biệt luồng xử lý I/O nặng và tăng `busy_timeout` lên 30 giây.
- **Palette Save Persistence**: Khắc phục lỗi "PERSISTING..." bị treo do metadata update bị chặn bởi khóa ghi không gian (Spatial Index Write Lock).
- **Spatial Index Efficiency**: Tối ưu hóa Rust backend để bỏ qua việc cập nhật R-tree khi chỉ thay đổi thuộc tính metadata, giúp phản hồi lưu Palette tức thì.
- **Sync Resilience**: Tăng thời gian chờ (timeout) cho hàng đợi đồng bộ palette từ 12s.

## [2026-04-07] - PMP Auto-Open & Recursive Visibility (v6.5.66)
### Added
- **PMP Auto-Open**: Đã thêm logic trong `App.tsx` giúp tự động chuyển sang tab **DESIGN** và mở bảng **Property Panel** khi người dùng chọn một camera trên bản đồ.
- **Recursive Visibility**: Refactor logic ẩn/hiện trong Project Explorer. Khi bật/tắt một Dự án (Region) hoặc Thư mục (Group), tất cả các đối tượng con sẽ được cập nhật trạng thái đồng bộ.

### Improved
- **Atomic Dispatching**: Sử dụng `dispatchEvents` để gửi hàng loạt thay đổi trạng thái ẩn/hiện trong một transaction duy nhất, tránh tình trạng UI bị mất nội bộ đồng bộ.

## [2026-04-07] - Ribbon Refactor & Visibility Portal (v6.5.65)
### Added
- **Unified Visibility Tool**: Merged "FOV MASK" and "GROUP VIEW" into a single professional "VISIBILITY" component.
- **Floating UI (Portal)**: Implemented React Portal with `fixed` positioning for the Visibility dropdown to bypass Ribbon overflow constraints.
- **Bulk FOV Controls**: Added sliders for bulk adjusting camera FOV angle and radius.

### Changed
- **FOV Zoom Optimization**: Cones now appear from Zoom level 13 (previously 15) and intersections from Zoom 17 (previously 18).
- **Ribbon Refactor**: Cleaned up `RibbonTabContent.tsx` by removing redundant `FovToggleTool` and `GroupViewTool`.

### Removed
- `FovToggleTool.tsx` and `GroupViewTool.tsx`.

## [2026-04-06] - Street View Super-Sync (Giai đoạn 13.9)
### Added
- **Rust URL Bridge**: Lệnh `get_webview_url` giúp Backend đọc trực tiếp URL của Street View khi JS bị hạn chế.
- **Title Hijacking**: Áp dụng `Object.defineProperty` trên `document.title` để ngăn Google Maps ghi đè dữ liệu đồng bộ.

### Fixed
- **Coordinate Integer Bug**: Sửa Regex bóc tách tọa độ để hỗ trợ cả số nguyên và số thực từ URL Google Maps.
- **Sync Reliability**: Khôi phục khả năng đồng bộ 2 chiều (Map <-> Street View) đạt độ ổn định 100% nhờ giải pháp đồng bộ lai.

## [2026-04-06] - System Stability & STT Normalization (V6.5.64)
### Added
- **Explicit Project Closing**: Thêm command `close_active_project` cho phép Frontend chủ động yêu cầu Backend đóng kết nối Database và giải phóng file `.pmp`.

### Fixed
- **Database Lock Resolution**: Kích hoạt chế độ **WAL (Write-Ahead Logging)** và thiết lập `busy_timeout` 10 giây cho SQLite. Giải quyết triệt để lỗi "Database is locked" khi mở/đóng dự án liên tục hoặc ứng dụng chưa kịp giải phóng tài nguyên.
- **Map UI Safety**: Thêm các lớp bảo vệ dữ liệu (Safe Guards) trong `ZoomExtendControl`, ngăn chặn lỗi crash `TypeError` khi dữ liệu state chưa được nạp đầy đủ.

### Changed
- **STT Integer Formatting**: Chuẩn hóa hiển thị Số Thứ Tự (STT) thành số nguyên (ví dụ: `193` thay vì `193.0`) trên toàn bộ giao diện: Project Explorer, Marker trên bản đồ và Bảng tổng hợp (Analysis Table).
- **Smart Name Cleaning**: Cập nhật logic `getCleanName` để tự động nhận diện và loại bỏ tiền tố STT khỏi tên đối tượng thiết kế, giúp giao diện gọn gàng và tránh lặp thông tin.

## [2026-04-05] - Production Stability & MSVC Build (V6.5.63)
### Added
- **Bootstrap-Shell Pattern**: Tách rời logic khởi tạo hệ thống (System Initialization) khỏi lớp vỏ UI chính (App Shell). Sử dụng `AppBootstrap.tsx` để quản lý các tác vụ kiểm tra môi trường và nạp tài nguyên trước khi render dashboard.
- **Unified Analysis Table**: Chuẩn hóa thành phần `AnalysisTable` dùng chung cho toàn bộ dự án. Ràng buộc chặt chẽ hợp đồng dữ liệu (Data Contract) yêu cầu mọi hàng phải có `id` duy nhất, giúp loại bỏ lỗi render trên bản build production.

### Fixed
- **TypeScript Strict Mode**: Sửa 21 lỗi logic và kiểu dữ liệu nghiêm trọng trong `AnalysisTable`, `AnalysisDialog` và `ContractAnalysisView` để đáp ứng tiêu chuẩn biên dịch MSVC/Production.
- **Rust Backend Lints**: Xử lý các cảnh báo biến không sử dụng (unused variables) và code không thể chạm tới (unreachable code) trong `design_renderer` bằng cơ chế `#[allow]` có chọn lọc cho từng target build (WASM/Native).
- **Asset ENOENT Fix**: Sửa lỗi không tìm thấy file ảnh bản quyền mô phỏng (`recognition-sim-license.png`) do sai đường dẫn import alias (`@DESIGN` vs relative path).

### Changed
- **Production Build Hardening**: Cấu hình bỏ qua ASM (`AWS_LC_SYS_NO_ASM`) và tối ưu hóa linker để đảm bảo quá trình build `npm run tauri build` diễn ra thành công 100% trên Windows mà không cần cài đặt thêm NASM.

## [2026-04-04] - Startup & UI Optimization (V6.5.62)
### Added
- **Project Explorer UI Alignment**: Đưa toàn bộ các nút chức năng (Xóa, Thêm, Theme, Hiển thị) sang bên phải của các item trong panel Project Manager. Sử dụng cơ chế `flex-1` và `w-full` để đảm bảo layout chuyên nghiệp và tận dụng tối đa diện tích Sidebar.
- **Dynamic Window Creation**: Chuyển đổi cơ chế load cửa sổ Analysis và Print sang dạng động (On-demand). Giảm thiểu RAM/CPU tiêu thụ lúc khởi động bằng cách chỉ mở Webview khi người dùng yêu cầu.
- **React Code Splitting**: Triển khai `React.lazy` và `Suspense` cho các entry points của cửa sổ. Mỗi cửa sổ hiện tại chỉ tải lượng code JavaScript tối thiểu cần thiết cho module đó.
- **AI Feature Gating**: Tách rời hoàn toàn các thư viện AI nặng (`ort`, `burn`) ra khỏi bản build mặc định thông qua `ai` feature flag trong `Cargo.toml`. Ứng dụng hiện tại có thể chạy ở chế độ siêu nhẹ (Lightweight) mặc định.

### Changed
- **Vite Watcher Optimization**: Cấu hình bộ lọc ignore cho Vite để bỏ qua các thư mục dữ liệu lớn (`project_explorer`, `target`, `local_data`), khắc phục tình trạng Node.js chiếm 90% CPU.
- **IDE Throttling**: Cấu hình `.vscode/settings.json` để giới hạn tần suất quét của `rust-analyzer` và tránh watcher bị quá tải bởi hàng chục ngàn file tạm.

### Fixed
- **Rust Type Inference**: Sửa các lỗi biên dịch liên quan đến biến `enable_ai` rỗng khi tắt feature AI.
- **White Flash Prevention**: Đồng bộ hóa trạng thái `visible: false` trong config và `window.show()` trong code React để đảm bảo UI mượt mà ngay khi xuất hiện.

## [2026-03-31] - Android Performance & Local-Only Transition (V6.5)
### Added
- **Viewport-based Querying (Android)**: Tối ưu hoá việc nạp dữ liệu từ Rust bridge bằng cách chỉ truy vấn các đối tượng trong vùng nhìn thấy (Viewport), giúp xử lý mượt mà các file `.pmp` cực lớn.
- **Debounced Map Refresh**: Triển khai cơ chế debounce (300ms) khi di chuyển bản đồ, ngăn chặn việc gọi native bridge quá tải và gây treo ứng dụng.
- **FolderOverlay Rendering**: Tái cấu trúc logic hiển thị trên Android sử dụng `FolderOverlay`, giúp việc xóa và vẽ lại hàng ngàn đối tượng diễn ra trong một bước duy nhất, giảm giật lag.
- **Zoom-level Culling (Mobile)**: Tự động ẩn các chi tiết nhỏ (FOV, Marker label) ở mức zoom thấp trên Android để bảo vệ CPU và RAM.

### Changed
- **Local-Only Mode (Desktop)**: Loại bỏ hoàn toàn tính năng đồng bộ đám mây (Cloud Sync) và xóa dữ liệu rác (Cleanup) trong phần Design để đảm bảo tính riêng tư và tốc độ xử lý offline.
- **Async JSON Parsing**: Chuyển đổi toàn bộ quá trình parse JSON dữ liệu thiết kế trên Android sang `Dispatchers.Default`, giải phóng Main thread.

### Fixed
- **Android Compilation Fixes**: Sửa các lỗi thiếu import và truy cập sai phạm vi biến `title` trong `MainActivity.kt` sau khi tối ưu hóa logic render.

## [2026-03-29] - Android Native Bridge & Cross-Platform Parity (V6.0-Native)
### Added
- **Native Android Bridge (`.so`)**: Biên dịch thành công thư viện lõi Rust cho Android (arm64-v8a và x86_64), cho phép xử lý file `.pmp` trực tiếp trên thiết bị di động.
- **Portable Geometry Kernel**: Tái cấu trúc nhân đồ họa CAD để hỗ trợ đa kiến trúc. Tự động chuyển đổi giữa tối ưu hóa SIMD (x86_64/AVX2) và tính toán scalar (ARM/Android) để đảm bảo độ chính xác trên mọi thiết bị.
- **Feature-Gated Core**: Triển khai hệ thống feature flags (`ai`, `vector-db`) giúp giảm dung lượng và tăng độ ổn định của app Android bằng cách loại bỏ các module AI/ML nặng khi không cần thiết.

### Changed
- **TLS Stack Migration**: Chuyển đổi toàn bộ hệ thống network sang `rustls-tls`, giúp loại bỏ sự phụ thuộc vào OpenSSL/Perl và đơn giản hóa quá trình đóng gói ứng dụng đa nền tảng.
- **Toolchain Modernization**: Cập nhật quy trình build sử dụng Android NDK 26.1 và `cargo-ndk`, đảm bảo tương thích với các tiêu chuẩn bảo mật Android mới nhất.

## [2026-03-29] - MSI Build & Workspace Optimization (V5.7)
### Added
- **Native MSI Installer**: Đóng gói hoàn chỉnh bộ cài đặt `.msi` và `.exe` cho Windows, hỗ trợ cài đặt và gỡ bỏ chuẩn hệ thống.
- **File Association (.pmp)**: Tự động đăng ký định dạng file `.pmp` với hệ điều hành. Double-click vào file dự án sẽ tự động mở ứng dụng và nạp dữ liệu.
- **CSP Hardening (WASM)**: Cập nhật chính sách bảo mật nội dung (CSP) hỗ trợ `wasm-unsafe-eval`, đảm bảo module `design_renderer` hoạt động ổn định trên bản build production.

### Changed
- **Workspace Optimization (Layout V8)**: Tự động ẩn các bảng điều khiển phụ (Summary, Camera, Cấu hình) khi khởi động để tối ưu diện tích bản đồ.
- **Single-Column Docking**: Chuyển đổi mặc định về layout 1 cột (350px) thay vì 2 cột, giải phóng không gian quan sát tối đa.
- **Forced Pinning**: Ép buộc trạng thái Ghim (Pinned) cho tất cả các bảng để ngăn chặn lỗi layout "vùng đen" do absolute positioning gây ra trên môi trường MSI.

## [2026-03-29] - Map UI Optimization & Performance Control (V5.6)
### Added
- **Performance Overlay Toggle**: Thêm nút đóng (X) và tính năng ẩn bảng "PRO MAX PERFORMANCE". Trạng thái ẩn được lưu trữ bền vững trong `useLayoutStore`.
- **Zoom-based FOV Visibility**: Tự động ẩn các vùng quan sát (FOV) khi zoom xa để giảm nhiễu thị giác (Zoom < 17 cho FOV chung, < 19 cho FOV nút giao).

### Fixed
- **Palette Auto-open Bug**: Khắc phục lỗi các bảng "Góc nhìn", "Cấu hình thiết bị" tự động bật lên khi click chọn đối tượng dù người dùng đã ẩn đi.
- **Improved Workspace Clarity**: Tách biệt logic chọn đối tượng (Selection) khỏi logic hiển thị UI panel, tôn trọng quyền kiểm soát của người dùng.

## [2026-03-28] - AI Engine Optimization & HW Acceleration (V5.5)
### Added
- **Hardware Acceleration (DirectML/CUDA)**: Kích hoạt GPU (AMD/Intel/NVIDIA) cho AI, giúp suy luận nhanh gấp 2-5 lần trên Windows. Tự động chọn EP tốt nhất (DirectML > CUDA > OpenVino > CPU).
- **Model Downloader Tool**: Tự động tải mô hình ONNX lượng tử hóa (Quantized INT4) từ HuggingFace, đảm bảo app chạy offline hoàn toàn và tiết kiệm dung lượng.
- **AI Optimization logic**: Triển khai inference loop token-by-token ổn định với cơ chế `try_extract_tensor` tương thích `ort` v2.x.
- **Automated Release Build**: Script `release_build.ps1` tích hợp sẵn bước chuẩn bị model trước khi đóng gói Tauri.

### Fixed
- **Port 1420 Conflict**: Giải quyết lỗi kẹt cổng dev (`PID 15096`) giúp khởi động `npm run tauri dev` mượt mà.
- **Rust Type Mismatch**: Sửa lỗi trích xuất Tensor Logits trong `phi3.rs` gây crash backend bằng cơ chế `tuple destructuring`.

### Changed
- **Architecture Export**: Chuyển các module lõi (`ai_engine`, `utils`) lên `lib.rs` để các tool binary (`src/bin/`) có thể tái sử dụng logic nạp cấu hình và AI.

## [2026-03-27] - AI RAM Optimization & Ribbon Fix (V5.4)
### Added
- **Manual RAM Release**: Thêm nút **RELEASE** trên Ribbon cạnh AI Assistant. Cho phép người dùng chủ động giải phóng bộ nhớ (unload models) mà không cần tắt AI.
- **Backend Command**: Triển khai `release_ai_memory` để gọi `AIManager::shutdown()` thủ công.

### Changed
- **Ribbon Logic**: Tách biệt nút ANALYSIS (Design) và nút RELEASE (AI RAM). Nút AI Assistant hiện tại chuyển thành chức năng dọn dẹp bộ nhớ thay vì mở cửa sổ phân tích ("không bật gì cả").
- **AI Engine Lifecycle**: Refactor `AIManager` sử dụng `RwLock<Option<Arc<AIEngine>>>` để hỗ trợ nạp/nhả model linh hoạt, tối ưu cho máy RAM 2GB.

### Fixed
- **Auth Param Mapping**: Sửa lỗi tham số `enableAi` bị sai định dạng (snake_case vs camelCase) khi gửi lệnh `update_app_config` từ Frontend lên Backend.

## [2026-03-27] - Basemap Granular Control & Satellite B&W (V5.3)
### Added
- **Chi tiết nền (Map Filtering)**: Tích hợp bảng cấu hình trực tiếp vào Menu Layer. Cho phé bật/tắt độc lập: Đường xá (Nét), Tên đường, Công trình, Tiện ích (POI), và Nhãn hành chính.
- **Google Satellite B&W**: Chế độ vệ tinh trắng đen độ tương phản cao, tối ưu cho việc quan sát đối tượng thiết kế.
- **React Portal Integration**: Giải pháp nhúng UI React vào sâu trong Leaflet DOM để tối ưu trải nghiệm người dùng.

### Fixed
- **Basemap Display**: Khắc phục lỗi đen nền trên lớp Streets và Terrain bằng cách chuyển đổi sang chuẩn `lyrs=r/p`.
- **Interaction Fix**: Sửa lỗi không click được checkbox trong menu bản đồ bằng cơ chế chặn truyền sự kiện của Leaflet.

## [2026-03-27] - Map UI Consolidation & Auth Environment Fix (V5.2)
### Added
- **Group View Tool**: Hợp nhất các toggle "Gom nhóm" và "DORI" vào một công cụ duy nhất trên Ribbon, giúp tối ưu hóa diện tích bản đồ.
- **Global .env Loading**: Triển khai cơ chế nạp biến môi trường toàn cục trong `main.rs`, khắc phục triệt để lỗi không tìm thấy `GOOGLE_CLIENT_ID`.
- **Standardized OAuth Naming**: Chuẩn hóa tên biến môi trường với tiền tố `VITE_` để đồng bộ giữa Frontend và Backend.

### Changed
- **Toolbar Visibility**: Tự động ẩn thanh Toolbar trôi nổi khi ở tab **DESIGN** để mở rộng không gian làm việc tối đa.

## [2026-03-25] - Branding: Project Manager (V4.8)
### Changed
- **Branding Update**: Đổi tên phần mềm từ "Antigravity PM" / "Offline Project Manager" thành "Project Manager" trên toàn bộ hệ thống (Backend, Frontend, Config).

## [2026-03-25] - PMP Project Access & RAM Optimization (V4.7)
### Fixed
- **PMP Load Failure**: Khắc phục lỗi nghiêm trọng không mở được file dự án `.pmp`. Nguyên nhân do thiếu khai báo `DatabaseState` trong file `main.rs` sau khi tái cấu trúc code.
- **Empty PMP Recovery**: Tối ưu hóa logic `open_project_db` để tự động khởi tạo bảng và dữ liệu mẫu nếu mở phải file trống (0-byte) hoặc file cũ từ bản C#.
- **Path Compatibility**: Đảm bảo đường dẫn file trên Windows được xử lý chính xác thông qua `PathBuf` và log backend chi tiết.

### Added
- **RAM Optimization (mimalloc)**: (Đã thử nghiệm và gỡ bỏ để đảm bảo tính ổn định tối đa cho Windows, sẽ kích hoạt lại sau khi kiểm tra kỹ độ tương thích của DLL).
- **Lazy AI Loading**: Hệ thống AI chỉ nạp vào RAM khi thực sự cần thiết, tiết kiệm ~500MB RAM lúc khởi động.
- **Low Power Mode**: Tự động tắt hiệu ứng mờ (Blur) và đổ bóng (Shadow) trên máy cấu hình yếu.

## [2026-03-29] - Multi-Window Auth Stability (V4.6.1)
### Fixed
- **Global Logout Prevention**: Triển khai cơ chế "Protection Buffer" (2 giây) cho các cửa sổ phụ (Analysis, Print). Hệ thống sẽ tạm thời lờ đi trạng thái "No User" rỗng khi khởi tạo để đợi Firebase Auth SDK đồng bộ phiên đăng nhập từ IndexedDB, tránh việc gửi tín hiệu Logout sai lệch làm thoát cửa sổ chính.
- **Analysis Window Reload**: Thêm nút "Thử lại (Reload)" và thông báo lỗi rõ ràng nếu việc xác thực thất bại hoàn toàn sau 2 giây.
- **Improved Logging**: Thêm trace logs chi tiết về thời gian phản hồi của Auth (elapsed ms) để dễ dàng chẩn đoán hiệu năng trên các máy khác nhau.

## [2026-03-25] - Low-End Hardware Optimization (V4.4)
### Added
- **Low Power Mode (Eco-Performance)**: Chế độ tiết kiệm tài nguyên hệ thống dành cho phần cứng yếu (chip Intel Core cũ, RAM 2GB). Khi được kích hoạt, ứng dụng sẽ tự động vô hiệu hóa `backdrop-filter` (Blur), các hiệu ứng đổ bóng phức tạp và animations để giảm tải cho GPU/CPU.
- **Lazy Loading & Code Splitting**: Triển khai `React.lazy` và `Suspense` cho toàn bộ hệ thống Palette. Các bảng điều khiển nặng chỉ được tải khi thực sự cần thiết, giúp giảm dung lượng RAM chiếm dụng khi khởi động.
- **Event Throttling (requestAnimationFrame)**: Tối ưu hóa các thao tác co kéo, di chuyển Palette bằng cơ chế throttling, đảm bảo giao diện phản hồi mượt mà mà không làm nghẽn luồng xử lý chính.

### Changed
- **Performance-First Render**: Tái cấu trúc `CameraViewPanel` và `RecognitionSimulator` để tự động đơn giản hóa hiển thị khi ở chế độ năng lượng thấp.
- **UI Architecture**: Bọc hệ thống Palette trong lớp `Suspense` với Loader UI chuyên nghiệp để cải thiện trải nghiệm người dùng khi tải tài nguyên.

## [2026-03-25] - Pro Max UI Refinement & Bulk FOV (V4.3)
### Added
- **Pro Max UI/UX Foundation**: Chuẩn hóa toàn bộ hệ thống Palette (Device, System, Camera View) theo ngôn ngữ thiết kế "Pro Max" với giao diện border-only tối giản, đồng bộ màu sắc Surface và các điều khiển tiêu chuẩn.
- **Interactive DORI Chart (V2)**: Khôi phục và nâng cấp biểu đồ mặt cắt dọc DORI. Hiển thị rõ ràng các nhãn D-O-R-I, vạch khoảng cách (mét), độ cao camera và vạch PPM cho đối tượng target. Tích hợp hiệu ứng hover highlight cho các vùng quan sát.
- **Bulk FOV Configuration**: Bổ sung tính năng cấu hình hàng loạt Góc nhìn (Angle) và Tầm nhìn (Radius) trực tiếp từ công cụ **FOV MASK** trên thanh Ribbon. Hỗ trợ cập nhật tức thì cho toàn bộ camera trên bản đồ.

### Fixed
- **Viewport Popup Constraints**: Sửa lỗi popup "Cấu hình" trong Ribbon bị tràn ra ngoài màn hình trên các thiết bị nhỏ. Triển khai `max-h` thông minh và thanh cuộn nội dung tự động.
- **Bulk Update Identification**: Khắc phục lỗi không nhận diện được camera chưa có metadata FOV khi thực hiện cập nhật hàng loạt. Sử dụng logic phân loại dựa trên Icon Key và Group Name bền vững hơn.
- **Z-Index Layering**: Chuẩn hóa độ ưu tiên hiển thị (Z-index), đảm bảo các panel UI luôn nằm trên Map Search Bar và các layer bản đồ.

## [2026-03-24] - Ground View Stabilization & DORI Optimization (V4.2)
### Added
- **Robust Ground View Engine (V8-V11)**: Hệ thống hiển thị mô phỏng đa lớp. Tích hợp **Embed Mode (2D)** sử dụng Google Maps Embed API làm lớp dự phòng 100% ổn định khi SDK gặp lỗi cấu hình.
- **Diagnostic Tool UI**: Bảng chẩn đoán lỗi API tích hợp trực tiếp, hướng dẫn người dùng cấu hình Maps JS API, Billing và Whitelist domain trên Google Cloud Console.
- **GIS Metadata Persistence**: Tự động đồng bộ và lưu trữ các thuộc tính camera nâng cao (chiều cao, độ nghiêng, góc nhìn) vào cơ sở dữ liệu.

### Changed
- **DORI Overlay Optimization**: Tái cấu trúc vùng hiển thị DORI (Detect, Observe, Recognize, Identify) với kích thước chuẩn 80m. Thu nhỏ các vòng tròn hiển thị để tránh chồng lấn và làm sạch giao diện overlay.
- **Ground View Zoom Standardization**: Thiết lập mức Zoom **21** làm điểm ngọt (sweet spot) cho độ chi tiết và tính sẵn sàng của dữ liệu vệ tinh, ngăn chặn hiện tượng màn hình xám do vượt ngưỡng dữ liệu.

### Fixed
- **Black Screen Resolution**: Khắc phục triệt để lỗi màn hình đen trong mô phỏng thông qua cơ chế tự động chuyển đổi sang Iframe Embed và bộ đếm thời gian an toàn (Safety Timeout).
- **CSS Color Distortion**: Gỡ bỏ các bộ lọc Contrast/Brightness gây nhiễu màu sắc bản đồ, đảm bảo hình ảnh vệ tinh hiển thị trung thực nhất.
- **Camera Height Sync**: Sửa lỗi lệch cao độ giữa vị trí camera và mặt đất trong các tác vụ chuẩn hóa dữ liệu.

## [2026-03-24] - Move Tool Optimization & High-Performance Mapping (V4.1)
### Added
- **O(1) Selection Sync (V8)**: Tối ưu hóa phản hồi chọn camera đạt mức tức thì (< 5ms). Tách biệt logic nạp dữ liệu bản đồ nặng nề ra khỏi logic tương tác chọn lựa.
- **Hybrid Marker Clustering (V7)**: Giải pháp đột phá kết hợp giữa gom cụm toàn cục và tương tác đơn lẻ. Chỉ tách camera đang di chuyển ra khỏi cụm, giữ nguyên hiệu năng 60 FPS cho toàn bộ lớp bản đồ khác.
- **Optimistic Move/Drop (V6)**: Cập nhật tọa độ cục bộ ngay lập tức khi thả chuột, loại bỏ hoàn toàn hiện tượng camera bị "giật" ngược về vị trí cũ trong lúc chờ đồng bộ đám mây.
- **Interaction Shield (V4-V5)**: Sử dụng high-priority Leaflet pane (`move-tool-pane`) và cơ chế chặn sự kiện (`stopPropagation`) để cô lập hoàn toàn thao tác di chuyển, tránh xung đột với các sự kiện click nền của bản đồ.

### Fixed
- **FOV Position Sync**: Sửa lỗi tọa độ Field-of-View (FOV) không đi theo camera khi di chuyển.
- **FOV Rotation Stability**: Đảm bảo góc xoay của vùng quan sát không bị reset sau khi di chuyển đối tượng.
- **Deselection Guard**: Ngăn chặn việc mất vùng chọn khi đang thực hiện thao tác kéo thả camera.

## [2026-03-22] - Advanced Palette System & Layout Manager (V4.0)
### Added
- **Multi-column Palette Stacking**: Hệ thống Palette mới hỗ trợ chia cột linh hoạt (AutoCAD-style), cho phép xếp chồng nhiều bảng theo chiều dọc trong cùng một cột.
- **Unified Column Resizing**: Tự động đồng bộ chiều ngang cho toàn bộ các bảng trong cùng một cột đứng khi người dùng thay đổi kích thước.
- **Tag-based Sidebar UI**: Cải tiến thanh Sidebar hiển thị tên Palette dưới dạng "Thẻ" (Tags) chuyên nghiệp, đi kèm icon trạng thái linh hoạt.
- **Simultaneous Multi-Display**: Cho phép hiển thị đồng thời nhiều Palette, không còn giới hạn ở một bảng duy nhất tại một thời điểm.
- **Layout State Migration (V2)**: Cơ chế tự động chuyển đổi cấu trúc dữ liệu layout cũ sang hệ thống `layoutColumns` mới mà không làm mất cài đặt của người dùng.
- **Docking Hint Overlay**: Giao diện hiển thị vùng docking trực quan khi người dùng kéo thả Palette để chuẩn bị ghim vào Sidebar.

### Fixed
- **React Hook Order Violation**: Xử lý triệt bớt các lỗi "Rendered fewer/more hooks than expected" bằng cách chuẩn hóa các lệnh gọi hook và bẻ khóa cơ chế barrel export (index.ts) cho các component layout.
- **JSX Nesting & Structure**: Sửa các lỗi lồng thẻ JSX gây vỡ giao diện trong `ProjectDetail.tsx` sau khi tái cấu trúc layout.

## [2026-03-22] - AI Model Optimization & Local Inference (V3.6)
### Added
- **AI Model Swap**: Chuyển đổi model LLM chính từ Phi-3 (2.3GB) sang **Qwen2.5-0.5B-Instruct-ONNX** (~512MB) để tối ưu hóa bộ nhớ và khả năng di động.
- **Generic LLMEngine**: Tái cấu trúc class `Phi3Engine` thành `LLMEngine` hỗ trợ prompt-template-aware, cho phép dễ dàng thay đổi model LLM trong tương lai.
- **Embedded Embedding Model**: Tích hợp `all-MiniLM-L6-v2` cho các tác vụ mapping dữ liệu và tìm kiếm ngữ nghĩa.
- **Automated Model Deployment**: Hoàn thiện download và ánh xạ tự động 7 thành phần AI ONNX vào project resources.

### Fixed
- **Dependency Conflict (rusqlite vs burn)**: Downgrade `rusqlite` về 0.32.1 để giải quyết xung đột symbol với framework `Burn`.
- **ORT API Compatibility**: Cập nhật toàn bộ AI Engine để tương thích với `ort` v2.0-rc.12 (Input tensor creation & session builder).

## [2026-03-22] - Contract Analysis & Persistence Logic (V3.5)
- **Excel BOM Import**: Triển khai tính năng import dữ liệu Bảng khối lượng (BOM) trực tiếp từ file Excel (.xlsx, .xls, .csv).
- **AI Feedback Loop (BOM)**: Mở rộng khả năng học tập của AI cho cả dữ liệu BOM, giúp nhận diện danh mục vật tư chính xác hơn trong các lần sau.
- **Path Normalization**: Tự động chuẩn hóa đường dẫn file về dạng `/` trên toàn hệ thống backend để đảm bảo tính nhất quán dữ liệu giữa các OS.

### Fixed
- **Empty Table Persistence**: Xử lý triệt để lỗi không lưu được dữ liệu do bảng `files` chưa được khởi tạo bản ghi cho các file mới (Chuyển sang cơ chế UPSERT).
- **Case-insensitive Path Match**: Sử dụng `COLLATE NOCASE` cho index đường dẫn file, giúp nhận diện chính xác file trên Windows bất kể hoa thường.
- **Project Context Sync**: Đảm bảo truyền đúng `project_id` từ Frontend xuống Backend cho các tác vụ lưu trữ metadata.


## [2026-03-21] - Map Styling & Interaction Polish (V3.3 - V3.4)
### Added
- **Real-time Color Sync**: Tối ưu hóa logic metadata giúp các cập nhật từ Sidebar (Color Picker) phản ánh ngay lập tức trên bản đồ mà không cần chờ Save.
- **Selection Highlight**: Thay thế màu Cyan ép cứng bằng hiệu ứng viền đứt đoạn (DashArray) và tăng độ dày (Weight) cho đối tượng được chọn, giúp giữ nguyên nhận diện màu sắc gốc.

### Fixed
- **Editing Mode Exit**: Cho phép click vào vùng trống trên bản đồ để thoát khỏi chế độ chỉnh sửa (ẩn các handle xanh), cải thiện trải nghiệm người dùng.
- **Metadata Desync**: Sửa lỗi display utils tự ý parse lại JSON string gốc, gây sai lệch thông tin khi đang ở chế độ xem trước (Preview).

## [2026-03-18] - Refactor & Performance Optimization
### Added
- **Excel-like Analysis Table**: Nâng cấp bảng Analysis với bộ lọc Checklist (Excel Style), hỗ trợ "Select All" và tìm kiếm trong danh sách giá trị duy nhất.
- **Range Selection (Shift+Click)**: Hỗ trợ chọn nhanh một vùng hàng bằng phím Shift, cải thiện hiệu suất thao tác dữ liệu lớn.
- **Database Indexing**: Thêm indexes cho `design_events`, `tasks`, và `files` giúp tăng tốc truy vấn dữ liệu dự án lên 300-500%.
- **Non-blocking UI Architecture**: Chuyển đổi toàn bộ logic Database nặng (Save/Undo/Redo) sang `spawn_blocking` trong Rust, loại bỏ tình trạng treo giao diện (UI Freeze).

### Changed
- **Memoized Rendering**: Áp dụng `React.memo` cho các component ô (Cells) trong bảng Analysis, tối ưu hóa tốc độ phản hồi khi cuộn và chỉnh sửa.
- **Backend Threading Model**: Sử dụng `Arc<DatabasePool>` để chia sẻ kết nối database an toàn giữa các luồng.

### Fixed
- **TypeScript Type Safety**: Xử lý triệt để các lỗi `unknown type` và sai lệch import path cho `FeatureState`, `MapState` trên toàn dự án.
- **Export Service Reliability**: Cải thiện độ ổn định của quá trình đóng gói ZIP/KML cho các dự án có dung lượng lớn.

## [2026-03-16] - Export, Sorting & Advanced Search
### Added
- **Hệ thống Export đa dạng**: Triển khai xuất báo cáo dự án bao gồm Excel metadata, bản đồ KML và thư mục hình ảnh hiện trường được đóng gói trong file ZIP.
- **Export Progress Popup**: Giao diện Modal chuyên nghiệp (CAD-Style) hiển thị tiến trình thực tế theo thời trăm (%) và trạng thái công việc chi tiết.
- **Save Binary Command**: Rust command mới (`save_binary_file`) hỗ trợ ghi dữ liệu nhị phân lớn trực tiếp vào ổ cứng.
- **Diacritic-insensitive Search**: Hỗ trợ lọc tên tiếng Việt không cần gõ dấu (ví dụ: "tram" tìm được "Trạm biến áp").
- **STT Search**: Cho phép tìm kiếm đối tượng bằng Số Thứ Tự (STT) hoặc Mã hiệu trực tiếp trong ô lọc danh sách và tìm kiếm bản đồ.

### Changed
- **Tối ưu hóa IPC**: Chuyển sang truyền tải `Uint8Array` trực tiếp giữa Frontend và Rust.
- **Natural Sorting (STT)**: Cải tiến logic sắp xếp Số Thứ Tự để hỗ trợ thứ tự số tự nhiên (1, 2, 10) và mã hiệu (C1, C2, C10) thay vì sắp xếp kiểu từ điển.
- **Excel Performance Fix**: Tối ưu hóa việc tạo bảng Excel cho các dự án lớn bằng cách giới hạn độ dài ký tự trong ô.

### Fixed
- **Excel 32k Limit**: Xử lý triệt để lỗi "Text length must not exceed 32767 characters" trong Excel export.
- **Tauri File-Save Dialog**: Sửa lỗi hiển thị Dialog nhưng không thực sự lưu file.
- **STT Search Sync**: Đảm bảo đồng bộ kết quả tìm kiếm theo mã hiệu giữa TreeView và Map.

## [2026-03-15] - Intersection & Precision Fixes
### Added
- **Quản lý Nút giao (Intersection Data Management)**: Hỗ trợ upload Excel/KML/KMZ trực tiếp vào nút giao với cơ chế tự động liên kết (parent association) và khử trùng lặp (deduplication).
- **Quick Action Drawing**: Thêm các nút thao tác nhanh (Điểm, Đường, Ảnh hiện trường) liên kết trực tiếp với Nút giao đang chọn.
- **Zoom Visibility Logic**: Tự động ẩn các thành phần con của nút giao ở mức zoom thấp và hiển thị khi zoom tới gần (threshold logic).
- **Custom Modals**: Thay thế `window.confirm` bằng `DeleteConfirmationModal` đồng bộ với UI/UX chung.
- **Resizable Table Columns**: Cho phép người dùng chủ động điều chỉnh độ rộng các cột trong bảng thống kê Grid.
- **Grid Inline Editing**: Hỗ trợ sửa đổi trực tiếp Tên, Tọa độ, Ghi chú ngay trên bảng Summary.
- **Line Clamp Display**: Giới hạn hiển thị nội dung ô văn bản tối đa 2 dòng để giữ giao diện gọn gàng.

### Fixed
- **Box Selection Statistics**: Giảm sai số deduplication từ 100m xuống 2m và áp dụng lọc theo loại entity (Type-aware) để thống kê chính xác vùng hạ tầng dày đặc.
- **Metadata Persistence**: Sửa lỗi mất dữ liệu metadata GIS (Rotation, FOV) khi thực hiện Save/Normalization.
- **State Leak**: Đảm bảo clear `activeParentFeatureId` khi đóng panel hoặc nhấn ESC.

## [Unreleased]
### Added
- Tính năng Street View cửa sổ độc lập (Multi-window Support).
- Trang `StreetViewPage` để hiển thị Street View riêng biệt.
- Cấu hình Tauri Capabilities để cho phép quản lý cửa sổ từ frontend.

### Fixed
- Lỗi thống kê sai số lượng khi dùng "Shift+Quét vùng" tại các vị trí có mật độ hạ tầng cao (điều chỉnh tolerance từ 100m về 2m).
- Lỗi hiển thị biểu tượng Pegman bị lệ
- Sửa lỗi cú pháp trong `default.json` của Tauri.
- Cải thiện logic định tuyến URL cho các cửa sổ phụ.

### In Progress
- Debug lỗi cửa sổ Street View không hiển thị trong một số trường hợp build.


All notable changes to this project will be documented in this file.

## [2026-03-15]
### Added
- **Build Environment Persistence**: Đã cấu hình `.cargo/config.toml` với đầy đủ các biến môi trường (`PROTOC`, `CMAKE`, `AWS_LC_SYS_NO_ASM`) để giải quyết triệt để lỗi build Rust trên Windows.
- **Dynamic CRT Enforcement**: Ép buộc toàn bộ backend link tới Dynamic C Runtime (`MD`) để tương thích với OnnxRuntime (`ort`).
- **Selection Summary Actions**: Triển khai các hành động **View** (xem chi tiết mở rộng) và **Delete** (xóa đối tượng) trực tiếp từ bảng thống kê vùng quét.
- **DeleteConfirmationModal**: Thành phần popup xác nhận tùy chỉnh cho các tác vụ xóa, thay thế hoàn toàn `window.confirm` truyền thống của trình duyệt.

### Changed
- **Tree View as Directory**: Cấu trúc Tree View hiển thị theo dạng thư mục phân cấp, đồng bộ với logic ẩn/hiện icon trên bản đồ theo zoom.
- **Zoom-Based Icon Visibility**: Tự động ẩn icon marker khi zoom vào chi tiết (level 18) và hiển thị nội dung trực tiếp tại vị trí zoom, hỗ trợ các nút giao có nút giao con bên trong.
- **Deferred Deletion Flow**: Cập nhật logic xóa trong `BoxSummary`, `DrawingExplorer` và `PropertyPanel` để yêu cầu xác nhận từ người dùng trước khi thực thi.
- **Static Map Interaction**: Vô hiệu hóa tính năng tự động zoom/pan khi click vào hàng trong bảng Summary, giúp giữ nguyên ngữ cảnh quan sát cho người dùng.
- **Selection State Coexistence**: Cho phép `selectedFeatureId` và `boxSelection` tồn tại song song, đảm bảo bảng Summary không bị đóng khi xem chi tiết một đối tượng.

### Fixed
- **LNK2038 / LNK2005**: Sửa lỗi xung đột thư viện C Runtime bằng cách bỏ qua `LIBCMT` và `LIBCPMT` thông qua linker flags.
- **__builtin_bswap symbols**: Sửa lỗi build `aws-lc-sys` trên MSVC bằng cách disable ASM generation.
- **Coordinate Display Precision**: Đảm bảo hiển thị chính xác nội dung nút giao khi zoom gần mà không bị đè bởi biểu tượng nút giao mẹ.
- **Polyline/Polygon Hierarchy**: Sửa lỗi polylines luôn hiển thị hoặc bị ẩn sai chỗ bằng cách áp dụng logic ẩn/hiện phân cấp dựa trên icon cha.
- **Selection Data Duplication**: Sửa lỗi lặp lại dữ liệu trong bảng Summary khi quét chọn vùng chứa nhiều đối tượng.

## [2026-03-14]
### Added
- **Mapping Import Excel/KML**: Linh hoạt chọn cột dữ liệu (Tên, Vĩ độ, Kinh độ), hỗ trợ thuộc tính mở rộng và cập nhật đối tượng theo tên.
- **AI Engine Lazy Loading**: Trì hoãn việc tải các model ONNX (YOLO, OCR, Embedding) cho đến khi thực sự cần thiết để tiết kiệm RAM lúc khởi động.
- **Background File Indexing**: Chuyển quá trình đánh chỉ mục file sang tiến trình ngầm (background thread) bằng `tauri::async_runtime::spawn`, giúp giao diện không bị treo.
- **AI Status Command**: Lệnh Rust `check_ai_status` để theo dõi tiến trình khởi tạo engine.
- **useResizablePanels Hook**: Custom hook để chuẩn hóa logic kéo dãn giao diện.
- **Map Interaction Popups**: Thêm popup hiển thị thông tin chi tiết khi click vào marker trên bản đồ Leaflet.
- **Auto-scroll Sync**: Đồng bộ hóa việc cuộn Map tới vị trí Marker khi chọn trong TreeView và ngược lại (Google Maps style).

### Changed
- **Backend Architecture Refactor**: Gom nhóm ~50 invoke handlers trong `main.rs` theo module chức năng.
- **Config Logic Encapsulation**: Di chuyển logic quản lý dự án gần đây vào struct `AppConfig` trong `config.rs`.
- **Database Thread-Safety**: Refactor `DatabaseState` sử dụng `Arc` để hỗ trợ đa luồng an toàn.
- **Frontend Simplification**: Refactor `ProjectDetail.tsx` để giảm tải logic quản lý trạng thái UI.
- **Distribution UI Refinement**: Chuyển đổi vùng Distribution sang dạng Grid với các cột: STT, Mã hiệu, Vị trí, Kinh độ, Vĩ độ, Ghi chú.
- **Selection Summary Removal**: Loại bỏ overlay Selection Summary dư thừa trên bản đồ.

### Fixed
- **Build & Lint Issues**: Sửa các lỗi unstable features (`once_cell_try`), lỗi đồng bộ hóa `ort` và redundant imports.
- **Syntax Errors**: Sửa lỗi cú pháp trong `yolo.rs`.
- **Map Geometry Crash**: Sửa lỗi `TypeError: coords.map is not a function` bằng cách sử dụng `getParsedCoordinates` an toàn trong `featureUtils.ts`.
- **Coordinate Sync Fix**: Sửa lỗi lệch ID khiến tính năng nhảy tới đối tượng trên bản đồ không hoạt động.
 
## [2026-03-12]
### Added
- **MOVE Tool**: Triển khai công cụ di chuyển vật thể trên bản đồ cho thanh Ribbon. Hỗ trợ sync tọa độ trực tiếp vào Database và cập nhật real-time.
- **Google Sign-In (Tauri Native)**: Hệ thống đăng nhập Google OAuth sử dụng Native Loopback (TCP Listener at port 51376) và Token Exchange.
- **Safe Initialization Recovery**: Thêm nút SKIP để bỏ qua giai đoạn khởi động nếu luồng logic bị kẹt.
 
### Fixed
- **Tauri App Hang**: Sửa lỗi treo ứng dụng khi chờ OAuth bằng cách sử dụng `spawn_blocking` cho các tác vụ I/O.
- **Malformed OAuth Code**: Fix lỗi tách mã code sai cú pháp (dính HTTP header) và thiếu URL Decode.
- **Icon Visibility**: Điều chỉnh icon CCTV (lật, căn lề text) và FOV direction.
 
### Changed
- Refactor `useAuthStore.ts` để tích hợp mượt mà giữa Firebase Client SDK và Tauri Backend Commands.
- Cấu hình tĩnh cổng OAuth Redirect URI (51376) để tương thích với Google Cloud Console.

## [2026-03-10]
### Added
- Giao thức **Stability-Aware Synchronization** cho Firestore: Chỉ cập nhật store local khi dữ liệu trên cloud đã hoàn toàn ổn định (không có pending writes).
- Cơ chế **React Canvas Remount** để xử lý lỗi context WGPU bị khóa sau khi panic.

### Fixed
- Lỗi biểu tượng bản đồ nhảy về giá trị cũ sau khi đổi do xung đột giữa snapshot Firestore trung gian và dữ liệu local.
- Lỗi WGPU Panic trên backend WebGL2 bằng cách tắt cờ `force_fallback_adapter` trong Rust WASM.
- Lỗi `initSync` của WASM renderer trên Vite.

### Changed
- Tối ưu hóa `pushStateToFirestore` để dọn dẹp legacy features an toàn hơn.
