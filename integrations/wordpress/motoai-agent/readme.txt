=== MotoAI Agent ===
Contributors: thuexemayhanoi
Tags: chatbot, rental, motorbike, assistant, widget
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lớp loader mỏng cho widget trợ lý thuê xe máy MotoAI. KHÔNG bundle engine chat — chỉ in một thẻ script async tải embed.js từ URL canonical.

== Description ==

Plugin MotoAI Agent gắn widget trợ lý thuê xe máy (MotoAI) vào site WordPress:

* Loader mỏng: một thẻ `<script async>` tải embed.js từ GitHub Pages canonical — engine luôn mới nhất, không cần cài lại plugin.
* Widget chạy hoàn toàn trên trình duyệt người dùng (iframe cách ly): không API key, không backend, không inference từ xa, không gửi dữ liệu khách về server WordPress.
* Shortcode `[motoai_agent lang="vi" theme="auto" source="wordpress" open="false"]`.
* Visibility rules: bật/tắt, mobile/desktop, include/exclude page IDs.
* Settings API chuẩn, sanitize toàn bộ input, escape toàn bộ output, nonce + capability `manage_options`.

== Installation ==

1. Tải `dist/motoai-agent.zip` (GitHub artifact/Release của repo) và cài qua Plugins → Add New → Upload Plugin.
2. Kích hoạt plugin.
3. Settings → MotoAI Agent → bật Agent.

== Frequently Asked Questions ==

= Widget có gửi dữ liệu khách đi đâu không? =

Không. Engine chat chạy trong iframe trên trình duyệt người dùng. Plugin chỉ lưu option cấu hình của chính nó.

= Cần cập nhật plugin mỗi khi Agent cập nhật không? =

Không. Engine sống ở GitHub Pages; site tự nhận bản mới ở lần tải sau.

== Changelog ==

= 1.0.0 =
* Bản đầu: loader + shortcode + visibility rules + Settings API.
