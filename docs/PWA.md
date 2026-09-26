# PWA — MotoAI Add to Home Screen

Direct app https://thuexemayhanoi.github.io/aichatbot/ là một PWA hợp lệ, cài được (installable).

## Tệp

| Tệp | Vai trò |
|---|---|
| `manifest.webmanifest` | name, short_name, start_url, scope, display, icons. |
| `service-worker.js` | Offline shell + chiến lược cache (scope `/aichatbot/`). |
| `assets/icons/icon.svg` | Icon vector (được commit). |
| `assets/icons/icon-{192,512,maskable-512}.png` | Icon PNG sinh tất định bởi `tools/gen-icons.py` (CI commit). |
| `assets/js/pwa.js` | Đăng ký SW + nút "Cài Agent" + hướng dẫn iOS. |

Đường dẫn tuyệt đối (`/aichatbot/...`) trong manifest đảm bảo đúng scope khi app phục vụ dưới subpath của GitHub Pages.

## Service worker — chiến lược cache

Version theo core (`v45`): cache `motoai-shell-v45` + `motoai-data-v45`.

- `data/business/*.json`: network-first, fallback cache — sự thật kinh doanh luôn mới khi online, vẫn dùng được offline.
- Navigation: network-first, fallback shell `index.html`.
- Static same-origin (CSS/JS/icon): cache-first + revalidate ngầm — nhanh nhưng không bao giờ stale vĩnh viễn.
- Cross-origin: passthrough hoàn toàn. **WebLLM/transformers model shards KHÔNG BAO GIỜ được precache bởi SW** — model do browser Cache API quản lý, chỉ tải khi người dùng chủ động bật AI tại chỗ.
- Activate: xoá mọi cache `motoai-*` không thuộc version hiện tại (cleanup an toàn).

SW chỉ đăng ký ở direct/PWA mode. **Embed mode không bao giờ đăng ký** (iframe widget không được phép scope SW lên trang host).

## Offline

Sau lần truy cập đầu (và SW install xong):
- Shell/UI: đầy đủ.
- Rules + NLU + BM25: đầy đủ (JS đã cache).
- Business data: dùng bản cache mới nhất.
- Semantic layer: hoạt động nếu model embedding đã được tải (browser cache); nếu không, degrade về BM25 — chatbot vẫn trả lời đầy đủ.
- Local Agent (WebLLM): chỉ hoạt động offline nếu model đã tải trước đó và browser cache còn giữ. KHÔNG đảm bảo AI offline; trợ lý cơ bản không phụ thuộc WebLLM (rules/BM25/calculator/recommendation độc lập hoàn toàn với WebLLM).

## Install UX

- Chrome/Edge/Android: khi browser phát `beforeinstallprompt`, nút "Cài Agent" xuất hiện trong header (subtle, không nag). Sau khi người dùng tương tác, nút ẩn vĩnh viễn trong phiên; `appinstalled` cũng ẩn nút.
- iOS: không có event cài đặt — hiển thị gợi ý một lần duy nhất ("Share → Thêm vào Màn hình chính", localStorage flag).
- `start_url` gắn `source=pwa` để phân biệt kênh phân phối (spec source tracking).

## Biểu tượng PNG

File PNG không thể commit qua một số automation path (binary). CI (`.github/workflows/distribution.yml`) chạy `tools/gen-icons.py` (thuần stdlib, deterministic) và commit `assets/icons/*.png` ngay lần push đầu tiên. Icon SVG đã được commit sẵn và tham chiếu trong manifest; sau khi CI chạy, Chrome nhận đủ PNG 192/512/maskable để hiện install prompt. Có thể chạy local: `python3 tools/gen-icons.py`.

## Test

`tests/unit/pwa.test.js`: manifest hợp lệ, scope `/aichatbot/`, versioned caches, không precache model, SW không đăng ký trong embed mode, offline shell, install UX, direct mode không đổi.
