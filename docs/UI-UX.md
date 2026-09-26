# UI/UX — viewport matrix & review checklist

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
