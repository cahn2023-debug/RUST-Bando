# Development & Quality Guidelines

## Development Workflow
1. **Chạy giao diện Frontend Dev**:
   ```bash
   npm run dev
   ```
2. **Khởi chạy ứng dụng Desktop đầy đủ (Frontend + Rust Backend)**:
   ```bash
   npm run tauri dev
   ```

## Quality Gate (Bắt buộc trước khi bàn giao)
Chạy lệnh kiểm tra toàn diện trước khi commit/bàn giao:
```bash
# Kiểm tra Frontend
npm run check:frontend

# Kiểm tra Backend Rust
npm run check:backend

# Kiểm tra toàn bộ
npm run check
```

## Sol-Advisor & Code Rules
- Tuân thủ quy trình PDCA (Plan - Do - Check - Act).
- Không hardcode secrets, luôn dùng parameterization cho SQL.
- Kiểm tra lại encoding và boundaries trước khi mở PR.
