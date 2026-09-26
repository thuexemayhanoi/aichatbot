# Distribution — Một Agent, nhiều kênh

MotoAI là một sản phẩm phân phối được qua 6 kênh, dùng **MỘT engine canonical duy nhất** (`src/`, `data/business/`, `assets/`, `embed.js`):

```
                    ┌────────────────────────────────┐
   GitHub Pages ───▶│  Core Agent (canonical)        │
   (static, no API) │  rules → hybrid retrieval →    │
                    │  recommend/calc → local agent  │
                    │  → fact guard → answer         │
                    └───────────┬────────────────────┘
              ┌─────────┬───────┼────────┬──────────┬─────────┐
          direct      embed   wordpress   PWA     android     ios
          (web)      (iframe)  (plugin) (install) (capacitor)(capacitor)
```

## Kênh

| Kênh | Cơ chế | Source label |
|---|---|---|
| Direct web | https://thuexemayhanoi.github.io/aichatbot/ | (none) |
| Embed widget | `<script src=".../embed.js" data-motoai ...>` — xem docs/EMBED.md | `data-source` |
| WordPress plugin | `integrations/wordpress/` — loader mỏng; ZIP: `dist/motoai-agent.zip` — xem docs/WORDPRESS.md | `wordpress` |
| PWA | manifest + service worker — xem docs/PWA.md | `pwa` |
| Android wrapper | `integrations/mobile/` (Capacitor) — xem docs/MOBILE.md | `android` |
| iOS wrapper | `integrations/mobile/` (Capacitor) — xem docs/MOBILE.md | `ios` |

Source label chỉ để phân biệt kênh phân phối. **Không chứa thông tin cá nhân.**

## Không API guarantee

Tất cả kênh giữ nguyên ràng buộc local-first: KHÔNG `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `MISTRAL_API_KEY`, không endpoint inference từ xa, không backend. CDN tĩnh (GitHub Pages, esm.run, Hugging Face model shards) chỉ phục vụ asset; mọi xử lý hội thoại chạy trên thiết bị người dùng. Ràng buộc được kiểm định bằng tests (privacy.test.js, wordpress-plugin.test.js, wordpress-zip.test.js, pwa.test.js, mobile-config.test.js) + secret scan trong CI.

## Versioning

| Thành phần | Version | Nơi |
|---|---|---|
| Core Agent | v45 (package.json 45.0.0) | cả direct, embed, wp-loader, pwa, mobile |
| WordPress plugin | 1.0.0 (độc lập core) | header + readme.txt |
| PWA cache | `motoai-shell-v45` / `motoai-data-v45` | service-worker.js |
| Mobile wrapper | 1.0.0 | integrations/mobile/package.json |

Plugin KHÔNG được ghép chặt core: cập nhật Agent trên Pages không cần cài lại plugin. Bump PWA cache version khi đổi shell; bump plugin version khi đổi loader/settings.

## Build artifacts

- `dist/motoai-agent.zip`: build tất định bằng `node tools/build-wordpress-plugin.mjs` (pure Node, không deps, stored-CRC zip). CI (`.github/workflows/distribution.yml`) build + upload artifact + đính vào GitHub Release khi có tag `v*`. Cấu trúc ZIP được test trong `tests/unit/wordpress-zip.test.js`.
- PWA PNG icons: `tools/gen-icons.py` (stdlib) — CI commit vào `assets/icons/`.
- `reports/distribution/latest.json`: báo cáo build tự động theo run.

## Chất lượng trước khi push

1. `npm test` — toàn bộ suite (cũ + mới), không yếu assertion cũ.
2. Distribution tests (plugin/ZIP/PWA/mobile).
3. Secret + API-key + inference-endpoint scan (CI + tests).
4. Bundle guard (CI, ngưỡng 190KB).
5. Direct + embed regression (golden, embed.test.js).
6. Sau push: smoke test live URL, embed.js, manifest, service-worker.js.
