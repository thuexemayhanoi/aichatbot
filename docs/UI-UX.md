# UI/UX — viewport matrix & review checklist

## Design tokens (v43.1 — calm premium palette)

Bảng màu cũ dùng đỏ #c8102e làm màu chính — quá chói/gắt. Từ v43.1 màu chính là **indigo trầm** (`--color-primary: #4f46e5`, dark mode `#7c7cf4`), đỏ CHỈ dành cho lỗi thật (`--color-error: #d2193c`). Toàn bộ UI dùng semantic tokens (`assets/css/style.css`): `--color-bg/surface/surface-elevated/primary/primary-hover/primary-soft/text/text-muted/border/success/warning/error` + scale `--radius-*`, `--space-*`, `--duration-*`, `--shadow-*`.

Ghi chú UX mobile: input 16px+ (không zoom iOS), touch target ≥44px, quick chips **một hàng ngang cuộn được** (v45: `flex-wrap: nowrap` + `overflow-x: auto`, chip `flex: 0 0 auto` — không cắt nửa chip, tối đa 4 chip chính), composer dính dưới + `100dvh` + safe-area, typing indicator 3 chấm (tôn `prefers-reduced-motion`), autoscroll chỉ khi đang ở gần đáy, Enter gửi / Shift+Enter xuống dòng (textarea auto-grow), gửi bị khóa khi đang xử lý (tránh gửi trùng), Local AI hai bước: giải thích rõ (chạy tại chỗ, không API key, model nặng vài trăm MB, cần WebGPU) → người dùng bấm "Tải model và bật Agent" → mới tải.

## Customer-facing labels (v45)

- Header: **"Hỗ trợ Agent"** (không còn tên sản phẩm MotoAI ở UI; MotoAI vẫn là tên nội bộ của dự án/mã nguồn).
- Subtitle: "Thuê xe máy Nguyễn Tú — 112 Nguyễn Văn Cừ, Long Biên, Hà Nội" (wrap sạch trên màn nhỏ, không cắt).
- Nhãn khách hàng cho AI tại chỗ là **"Agent"**: "Bật Agent", "Đang chuẩn bị Agent...", "Agent sẵn sàng" (tự ẩn sau ~2.5s), "Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường."
- Model id / WebLLM / MLC / VRAM KHÔNG bao giờ hiển thị ở UI thường — chỉ trong internal state, `?debug=1`, console và docs.
- Quick chips mặc định: 💰 Giá thuê / 🛵 Xe ga / 🏍️ Xe số / 📅 Theo tháng; sau mỗi câu trả lời chips contextual xuất hiện từ logic deterministic (`src/app/suggestions.js`, intent + slots của lượt vừa xong — LLM không bao giờ sinh suggestion).

The deterministic chatbot must be excellent *without* AI; the AI layer must never
break the basic chat. No screenshots in CI — this is a manual/per-release matrix
recorded in the run report.

## Viewport matrix

| Device | Viewport | Checks |
|---|---|---|
| Desktop | 1920×1080 | full-page layout, launcher position, long answers |
| Laptop | 1366×768 | layout fits without scroll for header+composer |
| iPhone portrait | 390×844 + safe areas | safe-area insets, mobile keyboard pushes composer, touch targets ≥44px |
| iPhone landscape | 844×390 | no clipping at very short screens |
| Android portrait | 412×915 | as iPhone portrait |
| Android landscape | 915×412 | as iPhone landscape |

## Per-viewport checklist

- launcher visible; open/close; Escape closes (desktop); focus moves into widget on open, restored on close
- composer usable with mobile keyboard; scroll-to-bottom on new message
- dark mode / light mode / auto; font sizes; contrast (target WCAG AA)
- loading state; model download progress (when Local AI enabled); fallback state; error state — never blank screen
- long answers wrap; orientation change keeps state; refresh keeps settings (localStorage)

## Embed-specific checks

- iframe sizing; CSS isolation both directions; launcher z-index above host content
- repeated open/close; script included twice → single widget
- host-page navigation does not orphan the widget (SPA cases tracked in Matrix BOT row)

## Direct-specific checks

- standalone layout at both viewports; `?lang`, `?theme`, `?source` params; refresh; local storage; accessibility (keyboard-only run-through)

Record results of the latest review in `reports/` (see the run report of each scheduled run).

## v44 — Context reset + debug trace

- Nút **🧹** ở header (direct + embed): xoá hội thoại và toàn bộ context đã nhớ (slots, agenda, history) — mọi dữ liệu đều localStorage local, không có gì phía server để xoá. Touch target ≥ 44px, `:focus-visible`, dùng token màu hiện có.
- **Debug mode**: thêm `?debug=1` (direct) để hiển thị nhãn nguồn nội bộ (`[debug] nguồn: pricing-data` / `recommendation` / `hybrid-search`...) sau mỗi câu trả lời. Người dùng bình thường không bao giờ thấy nhãn này hay phần trăm giả.

## v56 — Blog App Foundation UX decisions (2026-09-27)

- MENU: drawer giữ ngôn ngữ app; nhóm Cẩm nang chứa đủ 6 danh mục (nhãn ngắn: Ứng Dụng, Hướng Dẫn, Thuê Xe, Xe Điện, An Toàn, Địa Phương) + Tìm Bài; nhóm Dịch vụ chứa Giá Thuê/Địa Chỉ/Liên Hệ/Gọi/WhatsApp/Bản Đồ (v57: Zalo bị loại khỏi giao diện khách); nhóm Pháp lý chứa Bảo Mật/Điều Khoản. Nhãn UI ngắn 1–2 từ; từ khóa SEO nằm trong nội dung, không nằm trong navigation.
- MENU ↔ FOOTER: một nguồn sự thật `config/navigation.json`; cùng nhãn + cùng URL ở cả hai bề mặt (test `blog-app-foundation.test.js`).
- FOOTER: chỉ ở các màn hình content (blog home, hub, subtopic, bài viết, privacy, terms). Màn hình chat Agent giữ full-screen: dock + drawer, KHÔNG nhét footer vào viewport chat (decision per §75 của đề án). Dock 4 item giữ nguyên (Dịch vụ/Liên hệ/Giá thuê/Bản đồ) — audit: vẫn là bộ tốt nhất, không tăng.
- BÀI VIẾT: màn hình chi tiết app — chips danh mục/subtopic, H1, dek, meta, TOC (mobile: accordion "Mục lục"; ≥1024px: sticky rail 230px, content 720px, container ≤1180px), related, CTA "⚡ Hỏi Agent", footer.
- SUBTOPIC HUBS: chỉ sinh khi có bài PUBLISHED — không doorway.

## v58 — Chat home + content site (2026-09-28)

- `/` là MÀN HÌNH CHAT: header app (identity trái, Auto + Menu PHẢI), messages, quick actions, composer, dock dịch vụ. KHÔNG footer website, KHÔNG blog feed dưới chat.
- Mọi trang content dùng content-site shell: `.site-header` sticky (identity trái; `.site-nav` hiện ≥900px; `.site-actions` margin-left:auto → search/theme/Menu PHẢI), `.site-main` một hệ cột duy nhất (16px side padding + safe-area), `<footer class="blog-footer">` full-width sinh từ navigation config. Không dock chat trên trang content.
- Trang bài: breadcrumb, chips, H1, dek, byline + reading time, hộp "Tóm tắt nhanh", TOC (mobile accordion / desktop sticky 230px + content 720px), bảng trong `.table-wrap`, related, một CTA "Hỏi Agent" (`/?ask=`).
- Ràng buộc tương phản/khả dụng giữ nguyên: focus-visible, min 44px cho control cảm ứng, một H1, aria-current, aria-expanded/controls cho drawer và nhóm menu.

## v72 — Content site editorial system (2026-10-23)

- **Một nguồn:** token màu/chữ/khoảng cách/motion ở khối TOKENS của `assets/css/src/blog.css`; đặc điểm dùng chung (nhãn, link gạch chân, nút pill, số tabular) ở khối TRAITS; danh tính site, cờ tính năng, CTA, slot ở `config/blog-ui.json`. Runbook: `docs/BLOG-SHARED-COMPONENTS.md`.
- **Art direction:** giấy ấm (ngày) / graphite (đêm), một màu tín hiệu (hổ phách xi-nhan) chỉ dùng để dẫn đường; vạch "làn đường" nét đứt mở mỗi chương; số thứ tự hai chữ số (01, 02…) đánh dấu nhóm chủ đề, danh mục, mục bài như một tờ lộ trình. Logo SVG: con đường phối cảnh. Không emoji ở chrome (drawer giữ nguyên vì dùng chung với màn hình chat).
- **Chữ:** Be Vietnam Pro (thiết kế cho dấu tiếng Việt), tự host, subset Latin + Việt ~14 KB/weight, `font-display: swap` + fallback khớp metric (không nhảy layout). Thân bài 17–18px, line-height 1.78.
- **Motion language:** ARRIVE (phần tử nổi lên 18px khi vào khung nhìn, gắn với tốc độ cuộn), LANE (vạch chương vẽ trái→phải), RESPOND (hover/nhấn), cộng thanh tiến độ đọc trên header. Chữ đọc và H1 (LCP) không bao giờ chuyển động. Tắt khi `prefers-reduced-motion`, khi trình duyệt chưa có scroll timeline, hoặc `features.motion = false`. Bỏ hiệu ứng nhấp nháy nút Menu (trang trí thuần).
- **Bố cục:** trang chủ blog = hero chữ lớn + bảng lộ trình 3 nhóm chủ đề (số bài thật) + dải dữ kiện đã xác minh (số bài, chuyên mục, giờ mở cửa, quận) → tìm kiếm → 3 "chặng" (đầu chặng dính khi cuộn trên desktop, card vuốt ngang trên điện thoại) → Bài mới (bài mới nhất làm poster) → mục lục 6 chuyên mục → contact band. Trang bài: lưới 2 cột từ ≥1100px (mục lục dính bên trái, đánh dấu mục đang đọc), mô tả hiện MỘT lần dưới byline (trước đây lặp hai lần), bảng kiểu spec-sheet. Bảng giá: bảng trên màn rộng, thẻ thông số từng xe trên điện thoại.
- **Sửa lỗi gốc:** `body { overflow-x: hidden }` làm body thành scroll container nên header/mục lục "sticky" chưa từng dính; nay dùng `overflow-x: clip`.
