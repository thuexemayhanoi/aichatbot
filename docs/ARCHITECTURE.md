# Kiến trúc MotoAI

## Nguyên tắc

- Một core duy nhất cho **hai chế độ phân phối**: direct link và embed iframe. Không bao giờ có hai engine chatbot.
- Ưu tiên trả lời mọi turn theo thứ tự cố định, không phụ thuộc AI:

```
1. Deterministic business rules (src/rules, ưu tiên theo registry)
2. Business-data retrieval   (src/search — BM25 trên dữ liệu repo)
3. Local LLM                 (src/ai — WebLLM, opt-in, fact-guarded)
4. Honest fallback           (src/rules/fallback-rule.js)
```

Bước 3 chỉ được chạy khi bước 1 và 2 đều khước từ, và output bị `guardFacts` loại bỏ nếu chứa số không có trong context đã verify.

## Modules

| Nhóm | Vai trò |
|---|---|
| `data/business/` | Sự thật kinh doanh duy nhất: giá, cọc, giờ, địa chỉ, liên hệ. AI không bao giờ ghi đè. |
| `src/nlu/` | Analyzer, intents, entities (duration/location/vehicles/contact-channel), synonyms, normalizer (bỏ dấu, map "đ"). |
| `src/rules/` | 11 rule theo thứ tự ưu tiên + fallback (xem `src/rules/registry.js`). |
| `src/core/` | Engine pipeline (analyze → slots → agenda → rules → retriever → fallback), responder (resolve template `{{ business.x }}`, sanitize action href), events. |
| `src/context/` | Session, history, slots, agenda (multi-turn, clarify-then-answer). |
| `src/search/` | `bm25.js` (BM25 Okapi thuần, không dependency), `corpus.js` (docs từ business/pricing/faq, keyword song ngữ vi–en), `retriever.js` (adapter cho engine + stopword filter). |
| `src/ai/` | `capability.js` (WebGPU/deviceMemory/storage detection), `local-llm.js` (WebLLM loader, timeout, progress, decline-safe), `grounding.js` (prompt, validate, fact guard, disclosure). |
| `src/app/` | `moto-app.js` (wiring production: engine + search + local LLM), `query-config.js` (parse URL params, build iframe URL). |
| `assets/` | UI: `index.html`, `assets/css/style.css`, `assets/js/main.js` (chat loop, Local AI panel), `assets/js/ai-settings.js` (storage key dùng chung). |
| `embed.js` | Embed widget độc lập (classic script + importable trong test). |
| `tests/` | 292 test: unit, integration (golden conversations, embed), regression. |

## Luồng render tin nhắn

- Rule/retriever trả `answer` (có thể chứa template `{{ business.x.y }}`) → responder resolve dựa trên object `business` và sanitize action href (`tel:`, `https:`, `mailto:`).
- UI render bằng `textContent` — không bao giờ tin answer là HTML (chống XSS).

## Storage

`src/storage/local-store.js`: localStorage namespaced `motoai:v{schema}:...`, TTL, tự degrade sang in-memory khi Safari private mode / storage bị chặn. Mỗi scope (direct / từng `data-source` embed) có namespace riêng — không xung đột.

## Ràng buộc quan trọng (anti-regression)

- "xe 50cc" không bao giờ bị hiểu thành "50 ngày" (tokenizer giữ nguyên token ghép chữ+số).
- Session không nhân đôi: `createEngine` dedupe theo store+scope.
- Điểm BM25 phải finite và > 0; dưới `minScore` (2.0) thì retriever khước từ.
- Query chỉ gồm stopword → retriever khước từ (rơi sang LLM/fallback, không trả câu lạc đề).
- LLM fail ở bất kỳ khâu nào (import, init, timeout, validate, fact guard) → engine vẫn trả lời bằng fallback. Không blank screen, không loading vô hạn.
