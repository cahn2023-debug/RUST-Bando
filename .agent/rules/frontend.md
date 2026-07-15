---
trigger: glob
glob: "**/*.{js,jsx,ts,tsx,css,scss,html,vue,svelte,dart,swift,kt,xml}"
---

# FRONTEND.MD - Client-Side Mastery

> **Mục tiêu**: Quản lý thống nhất Giao diện Web & Mobile. Một nguồn chân lý cho trải nghiệm người dùng.

---

## 🎨 1. PREMIUM UX/UI & AESTHETICS

1. **Rich Aesthetics**: 
   - Sử dụng màu sắc sống động (Vibrant colors), Sleeek dark modes.
   - Áp dụng **Glassmorphism**: Backdrop blur, subtle borders, translucent backgrounds.
   - **Modern Typography**: Ưu tiên Google Fonts (Inter, Roboto, Outfit). KHÔNG dùng font mặc định.
2. **Dynamic Spacing**: Hệ thống 4px/8px. Tỷ lệ vàng cho padding/margin.
3. **Interactive Excellence**: 
   - Hover effects, Micro-animations (subtle scale, opacity transforms).
   - Phản hồi thị giác ngay lập tức cho mọi tương tác.

---

## 📱 2. MOBILE & RESPONSIVE CONVENTION

1. **Mobile-First Strategy**: Viết style cho mobile/tablet trước, sau đó dùng media query cho Desktop.
2. **Touch Optimization**: Button tối thiểu 44x44px. Tôn trọng Safe Areas (Notch, Home Bar).
3. **Adaptive Layouts**: Bento grid, fluid layouts.

---

## ⚡ 3. PERFORMANCE & VITALS

1. **Standard**: LCP < 2.5s, CLS < 0.1, FID < 100ms.
2. **Optimistic Updates**: Cập nhật trạng thái UI ngay lập tức bằng data giả (Zustand/TanStack Query) trong khi chờ API.
3. **Asset Discipline**: Ưu tiên WebP, SVG. Lazy-load video và ảnh lớn.

---

## 🛡️ 4. ARCHITECTURE & STATE

1. **Atomic Design**: Component nguyên tử, tính tái sử dụng cao.
2. **State Separation**: Tách biệt Server State (cần cache) và Client State (tạm thời).
3. **Accessibility**: Tuân thủ WCAG (Aria labels, Keyboard navigation).
