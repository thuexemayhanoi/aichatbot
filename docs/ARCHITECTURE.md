# Kiến trúc MotoAI

## Nguyên tắc

- Một core duy nhất cho **hai chế độ phân phối**: direct link và embed iframe. Không bao giờ có hai engine chatbot.
- Ưu tiên trả lời mọi turn theo thứ tự cố định, không phụ thuộc AI:

```
0. Context Memory  (src/context/slots — vehicle/duration/date-range/height/
   experience/destination/budget/transmission/language; turn mới luôn thắng)
1. NLU plan        (src/nlu/analyze-turn.js → src/core/planner.js planTurn)
2. Deterministic business rules (src/rules, ưu tiên theo registry)
   + recommendation (src/recommend) + calculator (src/calc) khi route cho phép
3. Hybrid retrieval (src/search — BM25 luôn; semantic Transformers.js lazy,
   merge bằng reranker tất định, fail → BM25-only)
4. Local LLM       (src/ai — chỉ fallback hoặc PHRASING kết quả có structured,
   bị planner chặn với mọi business fact, fact-guard v2)
5. Honest fallback (src/rules/fallback-rule.js)
```

Rules vẫn là authority tuyệt đối cho giá/cọc/giờ/địa chỉ/liên hệ: LLM không bao giờ được chạm vào các turn này (planner đặt `useLocalLlm: false`).

## Modules

| Nhóm | Vai trò |
|---|---|
| `data/business/` | Sự thật kinh doanh duy nhất: giá, cọc, giờ, địa chỉ, liên hệ. AI không bao giờ ghi đè. |
| `src/nlu/` | Analyzer, intents, entities (duration/dates/rider/vehicles/location/contact-channel), synonyms, normalizer, `language.js` (detect vi/en), `analyze-turn.js` (kế hoạch: intent + entities + missingEntities + confidence). |
| `src/rules/` | 11 rule theo thứ tự ưu tiên + fallback (xem `src/rules/registry.js`). |
| `src/core/` | Engine pipeline (analyze → slots → plan-trace → agenda → rules → retriever → fallback), `planner.js` (planTurn: route rule/calculator/retriever/recommendation/LLM + missingEntities), responder, events. `engine.resetContext()` xoá slots+agenda+history. |
| `src/context/` | Session, history, slots, agenda (multi-turn, clarify-then-answer). |
| `src/search/` | `bm25.js`, `corpus.js`, `retriever.js` (BM25), `semantic-retriever.js` (Transformers.js lazy, Xenova/multilingual-e5-small, prefix query:/passage:, cache browser), `reranker.js` (merge all định, weight 0.6 lexical / 0.4 semantic, tie-break theo id), `hybrid-retriever.js` (engine contract, source `hybrid-search`). |
| `src/ai/` | `capability.js`, `model-selection.js`, `local-llm.js` (answer + phrase mode), `grounding.js` (prompt, validate, guardFacts, disclosure), `fact-guard.js` (guard v2: số, điện thoại, giờ mở cửa phải khớp verified bundle). |
| `src/recommend/` | Engine gợi ý xe tất định: điểm từ category/description/rates/popularity đã verify; height → missingInfo (không bịa seat height). |
| `src/calc/` | Smart calculator: ngày/tuần/tháng/date-range → estimate + breakdown gói rẻ nhất + so sánh nhiều xe. |
| `src/app/` | `moto-app.js` (wiring production: engine + search + local LLM), `query-config.js` (parse URL params, build iframe URL). |
| `assets/` | UI: `index.html`, `assets/css/style.css`, `assets/js/main.js` (chat loop, Local AI panel), `assets/js/ai-settings.js` (storage key dùng chung). |
| `embed.js` | Embed widget độc lập (classic script + importable trong test). |
| `tests/` | 393 test: unit, integration (golden, multi-turn A–G, embed), regression. |

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
- Semantic layer fail/không tải được → hybrid retriever về BM25-only, nguồn trả lời vẫn trace được.
- Context stale không bao giờ đè input mới: "Không, Air Blade cơ" thay vehicle đã nhớ (multi-turn test F).
- Model embedding chỉ warm-up SAU lượt chat đầu; không tải model nào lúc load trang.

## v47 — Blog + Agent knowledge tier (2026-09-26)

Pipeline trả lời mới (thứ tự mở rộng, ưu tiên không đổi cho phần cũ):

```
Rules → Business data → Blog knowledge (tùy chọn, tier thấp nhất)
      → Recommendation/Calculator → Local Agent phrasing → Fact Guard → Answer/CTA
```

- `src/search/blog-knowledge.js` — BM25 retriever trên chunks của bài blog PUBLISHED; khước từ mọi intent dữ liệu kinh doanh (PROTECTED_INTENTS); chỉ được hỏi sau khi engine trả honest fallback.
- `src/app/moto-app.js` — `attachBlogIndex(chunks)` gắn tier lazy; tier nằm TRÊN honest fallback, DƯỚI LLM fallback.
- `tools/gen-blog-matrix.mjs` — ma trận nội dung 2.000 bài (40×50), tách biệt ma trận phát triển.
- `tools/build-blog.mjs` — dựng blog/ 6 hubs + bài, search-index.json, knowledge-index.json, sitemap.xml, robots.txt; resolve `{{ business.* }}` từ business.json.
- `tools/blog-factory.mjs` — state machine PLANNED→…→PUBLISHED, run lock, transaction marker, resume, report.
- `assets/js/blog.js` — tìm kiếm blog client-side, mục lục tải theo yêu cầu.
- Blog UI: `assets/css/blog.css`; homepage hero + menu drawer: `assets/css/style.css` (v47 section).
