# 📘 Hướng Dẫn Sử Dụng Hệ Thống Workflow (Quy Trình)

> **Antigravity IDE** cung cấp **21 quy trình (Workflow)** chuyên biệt, được tự động kích hoạt dựa trên **Lĩnh vực (Industry)** bạn chọn khi cài đặt.

---

## 1. Nhóm Cốt Lõi (Core - Ai cũng có)
*Dành cho mọi dự án, từ cơ bản đến nâng cao.*

### `/brainstorm` - Khởi tạo ý tưởng
- **Khi nào dùng**: Khi bạn có ý tưởng mơ hồ, cần AI gợi ý cách triển khai.
- **Cách dùng**: `/brainstorm [ý tưởng]`
- **Ví dụ**: `/brainstorm ứng dụng đặt món ăn healthy`

### `/plan` - Lập kế hoạch
- **Khi nào dùng**: Trước khi code tính năng mới. AI sẽ chia nhỏ task và ước lượng thời gian.
- **Cách dùng**: `/plan [tên tính năng]`

### `/status` - Dashboard trạng thái
- **Khi nào dùng**: Xem "sức khỏe" dự án, tiến độ các task.
- **Cách dùng**: `/status`

### `/debug` - Sửa lỗi thông minh
- **Khi nào dùng**: Khi gặp lỗi khó hiểu hoặc muốn tối ưu code.
- **Cách dùng**: `/debug [mô tả lỗi hoặc dán log lỗi]`

---

## 2. Nhóm Xây dựng (Builder - Cho Dev)
*Tự động kích hoạt cho nhóm ngành: General, Logistics, Other.*

### `/create` - Tạo tính năng mới
- **Khi nào dùng**: Build một module hoàn chỉnh (Frontend + Backend + DB).
- **Cách dùng**: `/create [tên module]`
- **Ví dụ**: `/create user-authentication`

### `/enhance` - Nâng cấp, sửa đổi
- **Khi nào dùng**: Thêm nút bấm, đổi màu sắc, sửa logic nhỏ.
- **Cách dùng**: `/enhance [yêu cầu thay đổi]`

### `/orchestrate` - Điều phối Đa Agent (Cao cấp)
- **Khi nào dùng**: Làm tính năng cực lớn cần 3-4 chuyên gia (Frontend, Backend, Security) làm cùng lúc.
- **Cách dùng**: `/orchestrate [yêu cầu phức tạp]`

---

## 3. Nhóm Chất lượng & Bảo mật (Enterprise)
*Tự động kích hoạt cho nhóm ngành: Finance, Healthcare.*

### `/audit` - Tổng kiểm tra
- **Khi nào dùng**: Trước khi bàn giao. Check toàn diện Security, SEO, Performance.
- **Cách dùng**: `/audit`

### `/security` - Bảo mật chuyên sâu
- **Khi nào dùng**: Hardening hệ thống, quét lỗ hổng, check API Key lộ.
- **Cách dùng**: `/security scan`

### `/test` - Kiểm thử tự động
- **Khi nào dùng**: Viết Unit Test, E2E Test cho dự án.
- **Cách dùng**: `/test [tên file/module]`

---

## 4. Nhóm Tăng trưởng & Thẩm mỹ (Growth & Design)
*Tự động kích hoạt cho nhóm ngành: F&B, Personal, Education.*

### `/ui-ux-pro-max` - Thiết kế đỉnh cao
- **Khi nào dùng**: Cần giao diện đẹp, hiệu ứng lung linh (Linear/Magic UI).
- **Cách dùng**: `/ui-ux-pro-max [mô tả màn hình]`

### `/seo` - Tối ưu tìm kiếm
- **Khi nào dùng**: Để trang web lên Top Google. Tạo Sitemap, Schema JSON-LD.
- **Cách dùng**: `/seo audit`

---

## 5. Nhóm Vận hành & Con người (Ops & Team)
*Dành cho Tech Lead hoặc DevOps.*

### `/onboard` - Hướng dẫn người mới
- **Khi nào dùng**: Khi team có thành viên mới. AI sẽ chỉ họ cách setup, giải thích code.
- **Cách dùng**: `/onboard`

### `/document` - Viết tài liệu
- **Khi nào dùng**: Tự động update README, API Docs từ code.
- **Cách dùng**: `/document all`

### `/monitor` - Giám sát
- **Khi nào dùng**: Setup logging, theo dõi lỗi trên Production.
- **Cách dùng**: `/monitor setup`

### `/deploy` - Phát hành
- **Khi nào dùng**: Deploy lên Vercel, VPS, Docker.
- **Cách dùng**: `/deploy`

---

## 💡 Mẹo sử dụng
- Bạn có thể **kết hợp** các lệnh. Ví dụ: Dùng `/plan` trước, sau đó dùng `/orchestrate` để thực thi plan đó.
- Nếu không nhớ lệnh? Chỉ cần gõ `/help` hoặc hỏi AI bằng tiếng Việt, nó sẽ tìm workflow phù hợp cho bạn.

## 6. Project quality gate

Run the same checks locally and in CI:

```bash
npm run check:frontend
npm run check:backend
```

Frontend order: encoding/locale and Tauri boundary checks, typecheck, lint, coverage tests, then production build.
Backend order: format check, workspace check, workspace tests, then clippy with warnings denied.
Do not rename Tauri commands or change persisted project data without a migration test.
