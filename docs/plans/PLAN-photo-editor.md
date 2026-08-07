# Kế hoạch Hoàn thiện Tính năng Chỉnh sửa Ảnh (Photo Editor - MS Paint)

## 📌 Tổng quan
Xây dựng và hoàn thiện module **ImageEditorModal** (Trình chỉnh sửa ảnh kiểu MS Paint) đồng bộ với giao diện Dark CAD Theme của phần mềm. Tách module thành component tái sử dụng độc lập để có thể mở từ:
1. **PropertyPanel** (Quản lý và vẽ ghi chú lên ảnh công trình/khảo sát đã lưu).
2. **StreetViewControl** (Chụp trực tiếp từ StreetView và mở ngay modal để vẽ chú thích cột/tủ/camera trước khi lưu vào dự án).

---

## 📐 Kiến trúc & Thiết kế Giao diện (UI/UX)
- **Modal Container**: Overlay `fixed inset-0 z-[7000] bg-black/90 backdrop-blur-sm`.
- **Theme**: Dark CAD Theme (`#1f1f1f` container, `#111` canvas background, `#333` border, Lucide icons, màu tím accent `#6366F1`).
- **Header**: Icon Pencil + Tiêu đề `EDIT PHOTO` + Nút đóng `X`.
- **Toolbar**: 
  - Công cụ: Crop, Pencil (Bút vẽ tự do), Eraser (Tẩy), Line (Đường thẳng), Arrow (Mũi tên), Circle (Hình tròn), Square (Hình chữ nhật), Text (Chữ ghi chú), Stamp (Dán tem hạ tầng).
  - Thao tác: Rotate (Xoay 90°), Undo (Hoàn tác), Apply Crop (Cắt ảnh).
  - Kiểu nét: Nét liền, Nét đứt, Chấm gạch, Nét chấm, Zigzag.
  - Màu sắc: Color Picker + Bảng màu nhanh Quick Swatches (Orange #FF6B00, Yellow #FACC15, Red #EF4444, Green #10B981, Blue #3B82F6, White #FFFFFF).
  - Kích thước nét: Slider 1px - 18px.
  - Nhập chữ: Ô nhập text + Size chữ (Font size) + Nút `OK TEXT`.
  - Tem thiết bị: `Cột 6m tay vươn 4m`, `Cột 6m tay vươn 6m`, `Cột 6m tay vươn 8m`, `Tủ 300x520`, `Camera mô phỏng`.
- **Footer**: Nút `CANCEL` và nút `SAVE PHOTO`.

---

## 🎯 Các thành phần thay đổi chính

### 1. [NEW] [ImageEditorModal.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/ui/ImageEditorModal.tsx)
- Tách toàn bộ logic vẽ HTML5 Canvas 2D, crop, rotate, undo stack, text placement, stamp placement ra một component độc lập.
- Thêm công cụ Freehand Pencil (`pencil`) và Eraser (`eraser`).
- Thêm bảng màu Quick Swatches.
- Hỗ trợ phím tắt: `L` (Line), `T` (Text), `C` (Circle), `R` (Square), `B` (Pencil), `E` (Eraser), `Ctrl+Z` (Undo), `Esc` (Cancel).

### 2. [MODIFY] [PropertyPanel.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/components/core/PropertyPanel.tsx)
- Thay thế đoạn code `ImageEditorModal` inline cũ bằng component `ImageEditorModal` dùng chung vừa tách.
- Đảm bảo khi lưu ảnh (`SAVE PHOTO`), tự động gọi `replaceMediaAsset` / `importMediaAsset` để cập nhật database SQLite.

### 3. [MODIFY] [StreetViewControl.tsx](file:///d:/Code%20Antinigaty/RUST/src/modules/design/features/map/MapLayerComponents/StreetViewControl.tsx)
- Tích hợp nút **Edit Photo** (Chỉnh sửa ảnh) trên thanh điều khiển StreetView.
- Chụp frame StreetView hiện tại thành Data URL và kích hoạt `ImageEditorModal`.
- Khi bấm `SAVE PHOTO`, tự động đẩy ảnh đã vẽ ghi chú vào danh sách media asset của đối tượng đang chọn (hoặc lưu vào media store của dự án).

---

## 🧪 Kế hoạch Kiểm thử & Xác minh (Verification Plan)
1. **Kiểm thử công cụ vẽ**: Test từng công cụ (Pencil, Eraser, Line, Arrow, Circle, Square, Text, Stamp, Crop, Rotate, Undo).
2. **Kiểm thử trên PropertyPanel**: Mở Edit Photo từ ảnh khảo sát -> Vẽ ghi chú -> Bấm SAVE PHOTO -> Xác minh ảnh đã cập nhật thành công và lưu SQLite.
3. **Kiểm thử trên StreetView**: Mở StreetView -> Bấm 'Chỉnh sửa ảnh' -> Mở Modal -> Vẽ ghi chú thông số cột 6m -> Bấm SAVE PHOTO -> Xác minh ảnh hiển thị trong phần Site Photos.
