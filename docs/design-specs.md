# Design Specifications - Project Manager (AutoCAD Style)

Tài liệu này định nghĩa hệ thống thiết kế (Design System) cho ứng dụng Project Manager, mô phỏng phong cách chuyên nghiệp của AutoCAD.

## 🎨 Palette Màu Sắc
| Tên | Hex | Sử dụng |
|------|-----|---------|
| Background Main | #16171B | Nền chính của toàn app (gần đen) |
| UI Surface | #1E2026 | Nền Ribbon, Sidebar, Cards |
| Border | #2A2B30 | Đường viền các panel, tab |
| Active Accent | #22C55E | Trạng thái Hoàn thành, Nút chính (Xanh Terminal) |
| Warning Accent | #F59E0B | Cảnh báo, Trạng thái đang chờ (Vàng Amber) |
| Text Primary | #F4F4F5 | Văn bản chính, tiêu đề |
| Text Secondary | #71717A | Văn bản mô tả, label (Xám) |
| Canvas BG | #111111 | Vùng làm việc trung tâm |

## 📝 Typography
| Element | Font | Size | Weight | Ghi chú |
|---------|------|------|--------|---------|
| Title Bar | Space Grotesk | 14px | 700 | Uppercase |
| Ribbon Tool | Roboto Mono | 10px | 400 | Monospace cho tính kỹ thuật |
| Sidebar Title | Space Grotesk | 12px | 700 | |
| Content Item | Inter | 11px | 400 | |
| Metric Value | Roboto Mono | 24px | 700 | Số liệu dashboard |

## 📐 Layout System
- **Header (Title Bar)**: 40px, fixed top.
- **Ribbon**: 120px, chứa các Tabs (HOME, DESIGN, IMPLEMENT, OPERATE).
- **Sidebar**: 240px, fixed left, dùng cho Explorer (Drawing, Tasks, Assets).
- **Canvas Area**: Vùng rộng nhất, nền tối (#111111).
- **Status Bar**: 24px, fixed bottom.

## 🔲 Visual Attributes
- **Corner Radius**: 0px (Góc cạnh sắc nét theo AutoCAD cổ điển) hoặc 4px (Modern UI).
- **Borders**: 1px đặc ($border).
- **Shadows**: Không sử dụng shadow (Flat Technical Aesthetic).

## ✨ Animations (Dự kiến)
- **Tab Transition**: Fade mượt mà khi chuyển module.
- **Hover State**: Thay đổi độ sáng của Background Surface.
