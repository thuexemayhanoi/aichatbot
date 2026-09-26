# UI/UX — viewport matrix & review checklist

## Design tokens (v43.1 — calm premium palette)

Bảng màu cũ dùng đỏ #c8102e làm màu chính — quá chói/gắt. Từ v43.1 màu chính là **indigo trầm** (`--color-primary: #4f46e5`, dark mode `#7c7cf4`), đỏ CHỈ dành cho lỗi thật (`--color-error: #d2193c`). Toàn bộ UI dùng semantic tokens (`assets/css/style.css`): `--color-bg/surface/surface-elevated/primary/primary-hover/primary-soft/text/text-muted/border/success/warning/error` + scale `--radius-*`, `--space-*`, `--duration-*`, `--shadow-*`.

Ghi chú UX mobile: input 16px+ (không zoom iOS), touch target ≥44px, quick chips `flex-wrap` (không còn bị cắt ngang), composer dính dưới + `100dvh` + safe-area, typing indicator 3 chấm (tôn `prefers-reduced-motion`), autoscroll chỉ khi đang ở gần đáy, Enter gửi / Shift+Enter xuống dòng (textarea auto-grow), gửi bị khóa khi đang xử lý (tránh gửi trùng), Local AI hai bước: giải thích rõ (chạy tại chỗ, không API key, model nặng vài trăm MB, cần WebGPU) → người dùng bấm "Tải model và bật AI" → mới tải.

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
