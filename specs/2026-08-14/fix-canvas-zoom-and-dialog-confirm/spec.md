# Specification: Fix Canvas Viewport Zoom Interaction & Tauri Dialog Confirm Handling

## Overview

Sửa lỗi không thực hiện được thao tác cuộn/zoom/pan trên vùng canvas hiển thị do thuộc tính `pointer-events-none` trên các container bao bọc. Đồng thời bắt lỗi an toàn cho `dialog.confirm` trong môi trường Tauri v2 tránh gây ra lỗi `[UNHANDLED REJECTION] dialog.confirm not allowed. Command not found`.

## Locked Decisions

- **D1**: Cấu hình `pointer-events-auto` cho `CADCanvas` và `MapLayer` container để các sự kiện chuột (wheel zoom, drag pan, click select) truyền đến được bề mặt MapLibre Canvas.
- **D2**: Bắt lỗi `catch` bất đồng bộ đối với `globalThis.confirm` khi chạy trên Tauri v2 để ngăn lỗi ngầm `UNHANDLED REJECTION dialog.confirm not allowed` khi kéo thả hoặc xác nhận thao tác.

## System Decision Impact

- **Impact**: none
- **Decision**: N/A

## Requirements

### Functional Requirements

- **FR-1**: Cho phép cuộn chuột (scroll wheel) để Zoom In / Zoom Out trên vùng canvas trung tâm.
- **FR-2**: Cho phép kéo giữ chuột trái (drag pan) để di chuyển góc nhìn canvas.
- **FR-3**: Hàm `confirmUserAction` bắt lỗi mượt mà khi Tauri v2 không cấp quyền `dialog.confirm`, trả về `false` an toàn thay vì bắn Unhandled Promise Rejection.

### Non-Functional Requirements

- **NFR-1**: Không còn lỗi console `[UNHANDLED REJECTION]` liên quan đến dialog confirm.
- **NFR-2**: Canvas tương tác phản hồi với độ trễ thấp (<16ms).

## Acceptance Criteria

- [ ] **AC-1**: Khi cuộn chuột trên canvas vùng trung tâm, tỷ lệ Zoom thay đổi trực tiếp và mượt mà.
- [ ] **AC-2**: Kéo di chuyển chuột trên canvas panning góc nhìn bình thường.
- [ ] **AC-3**: Các thao tác kéo thả node/feature không còn bắn lỗi `dialog.confirm not allowed`.

## Scenarios

### Scenario 1: Zoom canvas bằng con cuộn chuột
**Given** Người dùng di chuột vào vùng canvas trung tâm màn hình THIẾT KẾ
**When** Người dùng thực hiện cuộn bánh xe chuột (scroll wheel)
**Then** Mức Zoom của canvas phóng to / thu nhỏ tương ứng theo vị trí con trỏ chuột.

### Scenario 2: Di chuyển vị trí điểm nút trên sơ đồ
**Given** Người dùng kéo thả điểm nút
**When** Thao tác kết thúc và gọi `confirmUserAction`
**Then** Không phát sinh lỗi `[UNHANDLED REJECTION] dialog.confirm not allowed. Command not found` trên Browser Console.

## Technical Notes

- Đã cập nhật `pointer-events-auto` tại `CADCanvas.tsx` và `MapLayer.tsx`.
- Cập nhật `confirmUserAction` trong `userConfirmation.ts` với `result instanceof Promise ? await result.catch(() => false)`.
