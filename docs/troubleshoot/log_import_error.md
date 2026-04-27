# Troubleshoot Log: ERR_CONNECTION_REFUSED on Port 1420

## 🔍 Phân tích lỗi (Phòng hội chẩn /TV)
- **Hiện tượng**: Trình duyệt báo `ERR_CONNECTION_REFUSED` khi truy cập `localhost:1420`.
- **Trạng thái**: Vite báo ready nhưng không thể kết nối.

## 👥 Ý kiến Hội đồng (Consensus)
- **Security Sentinel**: CSP không phải nguyên nhân. Nghi ngờ browser ép HTTPS.
- **Performance Prophet**: Sẽ kiểm tra xem tiến trình có bị treo ở `BeforeDevCommand` không.
- **Logic Lord**: Cần kiểm tra mapping port giữa Tauri và Vite.
- **System Architect (Chốt)**: Vấn đề nằm ở `localhost` resolution trên Windows (IPv4 vs IPv6). Vite có thể đang bind vào IPv6 `[::1]` trong khi client/webview cố truy cập IPv4 `127.0.0.1`.

## 🛠️ Phương án xử lý (Consensus)
1. Ép Vite listen trên `0.0.0.0` (mọi interface) để đảm bảo dù WebView dùng IPv4 hay IPv6 đều trúng.
2. Kiểm tra lại `tauri.conf.json` xem `devUrl` có khớp chính xác không.
3. Bổ sung script `test` vào `package.json` để không làm gãy regression tests.

## 🧪 Test Case
- Truy cập `127.0.0.1:1420` thay vì `localhost:1420`.
- Chạy `curl http://127.0.0.1:1420` từ terminal để verify server.
