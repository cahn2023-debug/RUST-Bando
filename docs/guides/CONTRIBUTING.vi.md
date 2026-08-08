# Hướng Dẫn Đóng Góp (Contributing)

Cảm ơn bạn đã quan tâm đến dự án Antigravity IDE! Chúng tôi luôn chào đón mọi sự đóng góp từ cộng đồng.

## 🤝 Quy Tắc Ứng Xử
Khi tham gia dự án, vui lòng giữ thái độ tôn trọng, lịch sự và chuyên nghiệp.

## 🚀 Cách Thức Đóng Góp

### 1. Báo Lỗi (Bug Report)
-   Kiểm tra [Hướng Dẫn Khắc Phục Lỗi](./TROUBLESHOOTING.vi.md) xem lỗi đã biết chưa.
-   Tạo Issue mới với tiêu đề rõ ràng.
-   Mô tả các bước để tái hiện lỗi (Reproduce steps).

### 2. Đề Xuất Tính Năng
-   Tạo Issue gắn tag `enhancement`.
-   Giải thích *tại sao* tính năng này lại hữu ích cho cộng đồng.

### 3. Gửi Code (Pull Request)
-   **Fork** dự án và tạo branch từ nhánh `develop`.
-   **Tên Branch**: `feat/ten-tinh-nang` hoặc `fix/ten-loi`.
-   **Commit Message**: Tuân thủ chuẩn [Conventional Commits](https://www.conventionalcommits.org/).
    -   `feat: thêm workflow mới`
    -   `fix: sửa lỗi cài đặt npm`
    -   `docs: cập nhật tài liệu`
-   **Kiểm thử**: Đảm bảo chạy `npm test` thành công.
-   **Lint Code**: Chạy `npm run lint` để code sạch đẹp.

## 🛠️ Cài Đặt Môi Trường Dev

1.  Clone fork của bạn:
    ```bash
    git clone https://github.com/your-username/google-antigravity.git
    cd google-antigravity
    ```
2.  Cài đặt thư viện:
    ```bash
    npm install
    ```
3.  Link để test lệnh CLI:
    ```bash
    npm link
    ```

## 📜 Bản Quyền
Mọi đóng góp của bạn sẽ tuân theo giấy phép MIT License của dự án.

## Quality gate before push

```bash
npm run check:frontend
npm run check:backend
```

Use Conventional Commits. Keep shared utilities in `src/shared`, app-shell stores in
`src/core`, typed native calls in `src/contracts/tauri-api`, and domain helpers in their
own module. Runtime text must be UTF-8 and user-facing labels should use i18n keys.
