# MSVC Build Environment & CRT Linking

Tài liệu này ghi lại các cấu hình bắt buộc để build thành công project Rust (Tauri) trên môi trường Windows MSVC, đặc biệt là khi sử dụng các thư viện như `ort` (ONNX Runtime) yêu cầu Dynamic CRT.

## 1. Vấn đề: CRT Mismatch (LNK2038)

Mặc định, một số crate (như `esaxx-rs`) có thể cố gắng link tĩnh với C Runtime (`LIBCMT`), trong khi các crate khác (như `ort`) yêu cầu link động (`MSVCRT`). Điều này dẫn đến lỗi Linker `LNK2038: mismatch detected for 'RuntimeLibrary': value 'MT_StaticRelease' doesn't match value 'MD_DynamicRelease'`.

### Giải pháp áp dụng
Chúng ta ép buộc toàn bộ hệ thống sử dụng **Dynamic CRT (MD)** thông qua `.cargo/config.toml`:

- **Rust Flags**: Sử dụng `-C target-feature=-crt-static` và `/NODEFAULTLIB` để bỏ qua các thư viện link tĩnh (`LIBCMT`, `LIBCMTD`, `LIBCPMT`, `LIBCPMTD`).
- **Environment Variables**:
    - `CC_ENABLE_STATIC_CRT = "0"`
    - `CXX_ENABLE_STATIC_CRT = "0"`
    - `CFLAGS = "/MD"`
    - `CXXFLAGS = "/MD"`
    - `MSVC_RUNTIME_LIBRARY = "MultiThreadedDLL"`

## 2. Build Dependencies

Một số crate yêu cầu các công cụ bên ngoài không nằm trong PATH mặc định:

### Protobuf Compiler (`protoc`)
Crate `lance-encoding` yêu cầu `protoc`. 
- **Cấu hình**: `PROTOC = "d:\\Code Antinigaty\\Phan mem quan ly file V4\\RUST\\src-tauri\\tools\\protoc\\bin\\protoc.exe"`

### CMake
Crate `aws-lc-sys` yêu cầu `cmake`.
- **Cấu hình**: `CMAKE = "C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe"`

## 3. Lỗi Build `aws-lc-sys` (__builtin_bswap)

Trên MSVC, `aws-lc-sys` có thể gặp lỗi symbol không xác định cho các hàm built-in của GCC/Clang (`__builtin_bswap`).
- **Khắc phục**: Set `AWS_LC_SYS_NO_ASM = "1"` để buộc thư viện sử dụng code C thuần thay vì assembly hoặc built-ins lỗi thời.

## 4. Tóm tắt cấu hình `.cargo/config.toml`

```toml
[target.x86_64-pc-windows-msvc]
rustflags = [
    "-C", "target-feature=-crt-static",
    "-C", "link-arg=/NODEFAULTLIB:LIBCMT",
    "-C", "link-arg=/NODEFAULTLIB:LIBCMTD",
    "-C", "link-arg=/NODEFAULTLIB:LIBCPMT",
    "-C", "link-arg=/NODEFAULTLIB:LIBCPMTD",
]

[env]
PROTOC = "d:\\Code Antinigaty\\Phan mem quan ly file V4\\RUST\\src-tauri\\tools\\protoc\\bin\\protoc.exe"
CMAKE = "C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe"
CC_ENABLE_STATIC_CRT = "0"
CXX_ENABLE_STATIC_CRT = "0"
CFLAGS = "/MD"
CXXFLAGS = "/MD"
MSVC_RUNTIME_LIBRARY = "MultiThreadedDLL"
AWS_LC_SYS_NO_ASM = "1"
```
