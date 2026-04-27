# PGO Optimization Script for Rust (Windows)
# Quy trình: Build thu thập -> Chạy lấy dữ liệu -> Merge -> Build tối ưu

$PGO_DATA = "target/pgo-data"
if (!(Test-Path $PGO_DATA)) { New-Item -ItemType Directory $PGO_DATA }

echo "--- Bước 1: Build với Instrumentation ---"
$env:RUSTFLAGS = "-Cprofile-generate=$PGO_DATA"
cargo build --release

echo "--- Bước 2: Chạy ứng dụng để thu thập dữ liệu ---"
echo "Vui lòng chạy ứng dụng và thực hiện các tác vụ nặng (Search, Index, AI)..."
echo "Nhấn bất kỳ phím nào sau khi đã đóng ứng dụng để tiếp tục..."
Read-Host

echo "--- Bước 3: Merge dữ liệu Profile ---"
# Yêu cầu cài đặt llvm-profdata (có sẵn trong rust-tools hoặc LLVM)
& llvm-profdata merge -o "$PGO_DATA/merged.profdata" (Get-ChildItem "$PGO_DATA/*.profraw").FullName

echo "--- Bước 4: Build bản tối ưu hóa cuối cùng ---"
$env:RUSTFLAGS = "-Cprofile-use=$PGO_DATA/merged.profdata"
cargo build --release

echo "Hoàn tất! Bản build tối ưu nằm tại target/release/"
