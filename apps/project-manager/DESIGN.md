# DESIGN

> **Tài liệu này là stub.** Nguồn sự thật duy nhất cho design system của dự án là:
>
> **[`design-system/MASTER.md`](design-system/MASTER.md)**

Mọi token màu, typography, spacing, thang z-index, chiều cao chrome và quy ước component
đều được định nghĩa tại đó, và phải khớp với hiện thực trong
`src/modules/design/index.css`.

## Vì sao có stub này

Trước 2026-07-25 dự án tồn tại 5 tài liệu design mô tả 4 palette khác nhau
(`DESIGN.md`, `docs/DESIGN.md`, `design-system/MASTER.md`,
`design-system/rust-cad/MASTER.md`, `design-system/bando-network-graph/MASTER.md`).
Điều này khiến người viết code — và cả AI agent — sinh ra UI lệch màu so với
theme thật đang chạy.

Các tài liệu sinh tự động bị loại đã được chuyển vào `BAK/design-system-deprecated/`
kèm ghi chú, không dùng để tham chiếu.

## Nếu bạn đang tìm

| Bạn cần | Đọc ở đâu |
|---|---|
| Token màu, dual theme light/dark | `design-system/MASTER.md` §1 |
| Typography | `design-system/MASTER.md` §2 |
| Spacing, chiều cao chrome | `design-system/MASTER.md` §3, §4 |
| Thang z-index | `design-system/MASTER.md` §5 |
| Quy ước component / primitive | `design-system/MASTER.md` §6 |
| i18n | `design-system/MASTER.md` §7 |
| Accessibility | `design-system/MASTER.md` §8 |
| Kiến trúc module DESIGN (event sourcing, hierarchy) | `docs/DESIGN_DOC.md` |
