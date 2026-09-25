# MotoAI — Local-first Vietnamese motorbike rental chatbot

MotoAI là chatbot thuê xe máy cho **Thuê Xe Máy Hà Nội Nguyễn Tú**, chạy hoàn toàn tĩnh trên GitHub Pages: không backend, không API key, không phí inference.

- **Direct link:** <https://thuexemayhanoi.github.io/aichatbot/>
- **Embed widget:** xem `docs/EMBED.md` — một thẻ `<script>` duy nhất.

## Kiến trúc (xem `docs/ARCHITECTURE.md`)

```
data/business/          # SỰ THẬT KINH DOANH (business.json, pricing.json, faq.json)
src/nlu/                 # Phân tích ngôn ngữ: intents, entities, synonyms
src/rules/               # Rule engine tất định (giá, cọc, giao xe, giờ, liên hệ...)
src/search/              # BM25 + corpus từ dữ liệu repo (retrieval, vi + en)
src/ai/                  # Local AI: capability detection, WebLLM loader, grounding
src/app/                 # Wiring dùng chung cho direct mode + embed iframe
src/core, src/context, src/storage, src/utils
assets/                  # UI trực tiếp (HTML/CSS/JS module, không framework)
embed.js                 # Embed widget (iframe isolation, không phụ thuộc)
tests/                   # 292 test (node --test): unit, integration, golden conversations
docs/                    # LOCAL-AI.md, EMBED.md, ARCHITECTURE.md, COMPATIBILITY.md
```

## Thứ tự ưu tiên trả lời (không đổi)

1. **Rule engine tất định** — giá, cọc, giờ mở cửa, địa chỉ... luôn thắng.
2. **Business-data retrieval** (BM25 trên dữ liệu repo).
3. **Local LLM** (WebLLM, opt-in, chỉ chạy khi 1+2 khước từ, bị fact-guard).
4. **Fallback trung thực** ("mình chưa có thông tin chắc chắn").

LLM **không bao giờ** được phép bịa giá, chính sách, địa chỉ, số điện thoại. Output có chứa số không có trong context đã verify sẽ bị loại bỏ. Xem `docs/LOCAL-AI.md`.

## Chạy test

```bash
npm test        # node --test — 292 tests
```

Golden conversation regression nằm ở `tests/integration/golden.test.js`, kỳ vọng đọc trực tiếp từ `data/business/*.json` (không hard-code).

## Cấu hình

Direct link hỗ trợ query params: `?lang=vi|en&theme=auto|light|dark&source=<label>&embed=1`.

Embed: `data-lang`, `data-theme`, `data-position`, `data-title`, `data-source`, `data-open` — xem `docs/EMBED.md`.

## Quyền riêng tư

Mặc định mọi câu trả lời chạy trên thiết bị người dùng. Không gửi hội thoại đi đâu, không API key, không secret. Local AI (WebLLM) tải model về máy người dùng và cache (Cache API), chỉ bật khi người dùng chủ động chọn. Xem `docs/LOCAL-AI.md`.

## Trình duyệt

Chatbot cơ bản chạy trên mọi trình duyệt hiện đại (kể cả không có WebGPU). Local AI cần WebGPU — xem `docs/COMPATIBILITY.md`.
