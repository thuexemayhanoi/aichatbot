# Run report — v45 Distribution Upgrade (2026-09-26)

Run: `2026-09-26-distribution-upgrade` · Start SHA: `1c3a948f29ae81b7f2bb672e9d6a7382a23027dd`

## Kết quả chính

- WordPress plugin `motoai-agent` 1.0.0: Settings API đầy đủ (enable, lang, theme, position, title, source, auto-open + delay, mobile/desktop, include/exclude pages), shortcode `[motoai_agent]`, loader async once-guard, uninstall sạch. ZIP tất định (`dist/motoai-agent.zip`, 6 entries, root `motoai-agent/`, CRC từng entry, rebuild byte-identical) — build bằng `node tools/build-wordpress-plugin.mjs`; CI upload artifact + đính release khi có tag.
- PWA: `manifest.webmanifest` (scope `/aichatbot/`, `source=pwa`), `service-worker.js` (cache `motoai-shell-v45`/`motoai-data-v45`; data network-first; shell cache-first+revalidate; cross-origin passthrough; KHÔNG precache model; cleanup an toàn), nút "Cài Agent" gated `beforeinstallprompt`, iOS hint một lần. Icon PNG sinh tất định (`tools/gen-icons.py`) — CI commit.
- Mobile foundation: `integrations/mobile/` (Capacitor config + package + web-sync script, strategy A bundled khuyến nghị). Chưa build/publish store; yêu cầu thủ công cho Play/App Store đã ghi trong docs/MOBILE.md.
- embed.js v1.1.0: thêm `data-open-delay` (0–10000ms), tương thích ngược đầy đủ; guard duplicate iframe giữ nguyên.
- Direct app không đổi hành vi; SW chỉ đăng ký ngoài embed mode.

## Chất lượng

- Tests: 406 → 447 (pass 447/431 gồm 38 distribution tests; không weaken assertion cũ; gộp thành công với run song song v45 UI + v46 quick bar).
- Bundle guard: 195,121 < 196,000 bytes (baseline v46).

- Secret scan + inference-endpoint scan: sạch (gồm integrations/, service-worker.js, manifest, tools).
- Matrix: 257 → 276 rows (BOT-0258..BOT-0276), test-matrix TMX-0013..0016.
- PHP syntax check: `php` binary không có sẵn trong môi trường run này — static security tests thay thế (capability/nonce/sanitize/escape/no-eval), CI Ubuntu không cài PHP mặc định; khuyến nghị thêm bước `php -l` khi có runner PHP.

## Giới hạn đã ghi nhận

- Binary files (PNG, ZIP) không thể commit qua connector text-only (đã kiểm chứng empirical: UTF-8 corruption). → PNG do CI commit; ZIP là artifact/release, reproducible một lệnh local.
- Google Play / App Store: chỉ tài liệu, chưa build, chưa submit.

Chi tiết: docs/DISTRIBUTION.md, docs/WORDPRESS.md, docs/PWA.md, docs/MOBILE.md, reports/distribution/latest.json.
