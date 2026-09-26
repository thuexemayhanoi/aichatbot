# WordPress Plugin — MotoAI Agent

Plugin WordPress **MotoAI Agent** (v1.0.0) là lớp loader mỏng cho widget MotoAI. Plugin KHÔNG bundle engine chat: chỉ in một thẻ `<script async>` tải `embed.js` từ URL canonical.

```
integrations/wordpress/motoai-agent/
├── motoai-agent.php            # Loader + shortcode + visibility rules
├── readme.txt                  # Chuẩn WordPress.org
├── uninstall.php               # Xoá option khi delete plugin
├── assets/admin.css, admin.js  # UI trang settings
└── includes/class-motoai-settings.php  # Settings API
```

## Cài đặt

1. Tải `dist/motoai-agent.zip` (GitHub Actions artifact hoặc Releases của repo, hoặc tự build: `node tools/build-wordpress-plugin.mjs`).
2. WordPress Admin → Plugins → Add Plugin → Upload Plugin → chọn ZIP → Install → Activate.
3. Settings → MotoAI Agent → bật Agent.

## Settings (Settings → MotoAI Agent)

| Tuỳ chọn | Giá trị | Ghi chú |
|---|---|---|
| Bật Agent | on/off | Master switch. |
| Ngôn ngữ | vi / en | `data-lang`. |
| Giao diện | auto / light / dark | `data-theme`. |
| Vị trí | bottom-right / bottom-left | `data-position`. |
| Tiêu đề widget | text (≤40) | `data-title`. |
| Nhãn nguồn | slug (≤64) | `data-source`, mặc định `wordpress`. KHÔNG chứa thông tin cá nhân. |
| Tự động mở | on/off | `data-open`. |
| Độ trễ tự mở | 0–10000 ms | `data-open-delay`. |
| Hiện trên mobile / desktop | on/off | `wp_is_mobile()`. |
| Include / Exclude pages | page IDs ("3, 12") | Rỗng = mọi trang. Include ưu tiên: nếu đặt, widget chỉ hiện trên các trang đó. |

Mọi input được sanitize khi lưu (`sanitize_text_field`, `sanitize_key`, `absint`, whitelist), mọi output được escape (`esc_attr`, `esc_html`, `esc_url`). Trang settings yêu cầu capability `manage_options` + nonce của Settings API. Không eval, không ghi file, không remote code.

## Shortcode

```
[motoai_agent lang="vi" theme="auto" source="wordpress" open="false"]
```

- Thuộc tính: `lang` (vi/en), `theme` (auto/light/dark), `source` (slug), `open` (true/false).
- Shortcode **không tạo engine thứ hai** — mount đúng embed canonical, nhiều lần không bao giờ inject 2 bản (guard static + guard idempotent của `embed.js`).
- Shortcode vẫn tôn trọng visibility rules (include/exclude pages, mobile/desktop). Nếu auto-loader đã chạy, cấu hình của loader trước đó thắng.

## Kiến trúc embed

```
WordPress site
  → plugin in <script src="https://thuexemayhanoi.github.io/aichatbot/embed.js" async data-*>
    → embed.js mount launcher + iframe
      → iframe = index.html?embed=1 (CÙNG core với direct link)
```

- Một engine duy nhất: rules → hybrid retrieval → recommendation/calculator → local agent (tùy chọn) → fact guard → answer, tất cả chạy trong iframe trên trình duyệt người dùng.
- Static CDN delivery (GitHub Pages) là giao tiếp duy nhất với bên ngoài. Không API key, không backend, không inference API.

## Cập nhật

Engine chat sống ở GitHub Pages. Khi Agent được cập nhật trên Pages, **không cần cài lại plugin** — WordPress site tự nhận phiên bản mới ở lần tải sau. Chỉ cần cập nhật plugin khi chính lớp loader/settings thay đổi (bump version trong `readme.txt` + header).

## Quyền riêng tư

- Plugin chỉ lưu option cấu hình của chính nó. Không cookie, không analytics, không gửi dữ liệu người dùng về server WordPress.
- Hội thoại chat xử lý 100% trong trình duyệt người dùng (local-first). Không có văn bản hội thoại nào rời thiết bị.
- `data-source` là nhãn kênh (wordpress/pwa/android/ios/zalo), không chứa dữ liệu cá nhân.

## Gỡ cài đặt

Delete plugin trong WP Admin → `uninstall.php` xoá duy nhất option `motoai_agent_settings`. Không để lại dữ liệu nào khác.

## Xử lý sự cố

- Widget không hiện: kiểm tra "Bật Agent", include/exclude pages, và mobile/desktop toggle.
- Widget hiện 2 lần: không thể xảy ra qua plugin (guard + idempotency); kiểm tra xem theme có tự nhúng embed.js thủ công không — nếu có, tắt một trong hai.
- Cache plugin (WP Rocket, LiteSpeed…): loader là thẻ script async trong footer, cache-safe. Nếu dùng "minify JS remote", thêm `thuexemayhanoi.github.io` vào danh sách loại trừ.
- Đổi cấu hình không có hiệu lực: settings được cache theo request — xoá cache trang nếu dùng full-page cache.
