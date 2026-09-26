# Run report — v45: Focused UI/UX polish (quick chips + Agent label + header)

- Run: `2026-09-26-ui-polish` (BOT-0220)
- Start commit: `1c3a948f29ae81b7f2bb672e9d6a7382a23027dd` (v44 final)
- Scope: customer-facing UI only. No core architecture change; no new external dependency; no backend/API.

## Changes

1. Quick chips: compact 4-chip primary bar (💰 Giá thuê / 🛵 Xe ga / 🏍️ Xe số / 📅 Theo tháng), one horizontally scrollable row, `flex: 0 0 auto` chips (no partial clipping), 40px touch targets. Old crowded set (Bảng giá / Tính giá / Địa chỉ / Giờ mở cửa / Số điện thoại) no longer primary; those flows remain reachable via chat and via contextual chips after location/contact answers.
2. Dynamic suggestions: `src/app/suggestions.js` — `nextSuggestions({intentId, slots})` returns a deterministic follow-up chip row (price → durations + Đặt xe; vehicle/recommendation → Vision / Air Blade / Theo tuần / Theo tháng; location/contact/hours → Chỉ đường / Gọi điện / Zalo / Giờ mở cửa). LLM never generates suggestions. Every chip sends a plain user message through the normal engine (no prices hard-coded in UI).
3. "Agent" label: all customer-facing "AI tại chỗ" strings replaced (toggle, explain panel, confirm button, prepare/failure/unsupported statuses, disclosure) in `index.html`, `assets/js/main.js`, `src/ai/local-llm.js` friendly messages. Technical names (Local AI, WebLLM, MotoAI, model ids) remain in source, docs, debug, console only.
4. Ready status: long technical line ("AI tại chỗ đã sẵn sàng (Qwen…MLC). Chạy 100%…") removed. Now a short "Agent sẵn sàng" that auto-hides after ~2.5s (the Off control stays). Progress shows a generic "Đang tải... NN%" line; raw WebLLM text only in ?debug=1. `modelId` is no longer read into any UI string.
5. Header: title "Hỗ trợ Agent"; subtitle "Thuê xe máy Nguyễn Tú — 112 Nguyễn Văn Cừ, Long Biên, Hà Nội". Subtitle and status wrap cleanly on narrow screens (no ellipsis clipping); ≤359px uses a slightly smaller but complete subtitle. MotoAI remains the internal project name.
6. Address consistency: `business.address.full` = "112 Nguyễn Văn Cừ, Long Biên, Hà Nội" (street/district/city aligned). Header subtitle, location rule answer, embed mode and tests all read the same value; no stale variants ("Bồ Đề, Long Biên" full-address form) remain in customer files.
7. Embed: default launcher/dialog title "Hỗ trợ Agent" (custom `data-title` still honored).
8. Privacy unchanged: local-first, no API key; the explain panel keeps "Agent chạy trên thiết bị của bạn và không cần API key" as a small line only.

## Verification

- `node --test`: 393 → 406, all green (new `tests/unit/ui-brand.test.js` covers header, address, Agent label, no-model-id, auto-hide, 4-chip default, deterministic dynamic chips, engine-routed chip queries; `ui-tokens` chip-layout test updated to the new one-row-scroll spec; `local-ai` disclosure assertion updated to "Agent").
- Bundle guard: 189,634 bytes < 190,000 (v45 baseline documented in ci.yml).
- Mobile: one-row chips, wrapped subtitle/status, ≥40px chip targets, input/composer untouched; direct and embed share the same `index.html`/`main.js`.
