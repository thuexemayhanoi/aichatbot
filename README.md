# MotoAI — Local-first Vietnamese motorbike rental chatbot

MotoAI là chatbot thuê xe máy cho **Thuê Xe Máy Hà Nội Nguyễn Tú**, chạy hoàn toàn tĩnh trên GitHub Pages: không backend, không API key, không phí inference.

- **Direct link:** <https://thuexemayhanoi.github.io/aichatbot/>
- **Embed widget:** xem `docs/EMBED.md` — một thẻ `<script>` duy nhất.

## Kiến trúc (xem `docs/ARCHITECTURE.md`)

```
User
→ Context Memory        (src/context — vehicle, duration, date range, height,
                         experience, destination, budget, transmission,
                         language, prevIntent; localStorage local-only)
→ Intent/Entity         (src/nlu — analyzeTurn: intent + entities +
                         missingEntities + confidence, 100% deterministic)
→ Rules                 (src/rules — giá, cọc, giờ, địa chỉ, liên hệ luôn thắng)
→ Hybrid Retrieval      (src/search — BM25 luôn chạy; lớp semantic
                         Transformers.js LAZY, in-browser, degrade về BM25)
→ Recommendation /     (src/recommend + src/calc — engine gợi ý tất định
  Calculator             + calculator chi tiết gói rẻ nhất từ pricing.json)
→ Local LLM phrasing    (src/ai — CHỈ diễn đạt lại kết quả đã verify,
   (tùy chọn)            planner chặn LLM với mọi business fact)
→ Fact Guard            (src/ai/fact-guard.js — số/điện thoại/giờ phải
                         khớp dữ liệu verify, nếu không bỏ output)
→ Answer                (responder + honest fallback)
```

```
data/business/          # SỰ THẬT KINH DOANH (business.json, pricing.json, faq.json)
src/nlu/                 # Intents, entities (duration/dates/rider/vehicles/...), synonyms, language
src/core/                # engine pipeline + planner (planTurn) + responder + events
src/rules/               # Rule engine tất định + recommend-rule
src/search/              # bm25, corpus, retriever, hybrid-retriever, semantic-retriever, reranker
src/recommend/           # Engine gợi ý xe tất định (chỉ dùng dữ liệu verify)
src/calc/                # Smart rental calculator (breakdown, date range, so sánh)
src/ai/                  # Local AI: capability, model-selection, local-llm, grounding, fact-guard
src/context/             # Session, history, slots (context memory), agenda
src/app/                 # Wiring dùng chung cho direct mode + embed iframe
src/storage, src/utils
assets/                  # UI trực tiếp (HTML/CSS/JS module, không framework)
embed.js                 # Embed widget v1.1.0 (iframe isolation, data-open-delay)
manifest.webmanifest     # PWA manifest (scope /aichatbot/)
service-worker.js        # PWA offline shell (versioned caches, không precache model)
integrations/            # WordPress plugin (loader mỏng) + Capacitor mobile wrapper foundation
tests/                   # node --test: unit, integration, golden + multi-turn + distribution + blog
docs/                    # LOCAL-AI, EMBED, ARCHITECTURE, COMPATIBILITY, WORKFLOW, TESTING, UI-UX, WORDPRESS, PWA, MOBILE, DISTRIBUTION, SEO-OWNERSHIP, BLOG, BLOG-FACTORY, ARTICLE-RULES, KNOWLEDGE-RETRIEVAL
docs/matrix/             # Master Matrix (260 tasks, BOT-0001..BOT-0260) + test matrix
docs/state/active-work.json  # checkpoint/lock cho các scheduled run
reports/                 # evidence report theo từng run
tools/gen-matrix.mjs     # tái tạo Master Matrix (idempotent)
.github/workflows/ci.yml # CI: full tests + secret scan + bundle guard
```

LLM **tùy chọn hoàn toàn** — không có API key, không backend, không paid inference; mọi tính năng cơ bản (rules, NLU, BM25, recommendation, calculator, context) chạy không cần LLM. Lớp semantic cũng là local-first: model embedding tải từ CDN tĩnh, chạy WASM trong trình duyệt, chỉ warm-up SAU lượt chat đầu tiên, fail thì BM25 vẫn đầy đủ. Toàn bộ context memory nằm trong localStorage của người dùng (nút 🧹 để xoá).

## UI khách hàng (v45)

Header hiển thị **"Hỗ trợ Agent"** + subtitle địa chỉ verified ("Thuê xe máy Nguyễn Tú — 112 Nguyễn Văn Cừ, Long Biên, Hà Nội"); MotoAI chỉ còn là tên nội bộ của dự án. Quick chips: 12 primary tag cố định (v53) trên một hàng cuộn ngang — thanh tag KHÔNG bao giờ bị thay bằng chips contextual sau mỗi câu trả lời. Primary tag là action độc lập (`app.sendFresh`): chạy với slot vehicle/duration đã xoá sạch nên không bị dính ngữ cảnh câu trước; free-text chat vẫn dùng context memory đầy đủ. Liên hệ/Maps/WhatsApp luôn resolve từ `data/business/business.json` (`src/app/suggestions.js`) — LLM không sinh suggestion, UI không hard-code giá. Nhãn khách hàng cho Local AI là **"Agent"**: "Đang chuẩn bị Agent...", "Agent sẵn sàng" (tự ẩn), model id/WebLLM/VRAM không bao giờ hiện ở UI thường (chỉ ở `?debug=1`, console, docs).

## Thứ tự ưu tiên trả lời (không đổi)

1. **Rule engine tất định** — giá, cọc, giờ mở cửa, địa chỉ... luôn thắng.
2. **Business-data retrieval** (BM25 trên dữ liệu repo).
3. **Local LLM** (WebLLM, opt-in, chỉ chạy khi 1+2 khước từ, bị fact-guard).
4. **Fallback trung thực** ("mình chưa có thông tin chắc chắn").

LLM **không bao giờ** được phép bịa giá, chính sách, địa chỉ, số điện thoại. Output có chứa số không có trong context đã verify sẽ bị loại bỏ. Xem `docs/LOCAL-AI.md`.

## Chạy test

```bash
npm test        # node —test — toàn bộ suite (unit + integration + golden + blog + distribution)
```

Golden conversation regression nằm ở `tests/integration/golden.test.js`, kỳ vọng đọc trực tiếp từ `data/business/*.json` (không hard-code).

CI chạy toàn bộ suite trên mỗi push/PR tới `main`, kèm secret-scan, inference-endpoint scan và bundle regression guard. Quy trình scheduled run: xem `docs/WORKFLOW.md` (RESUME > FIX > VERIFY > IMPROVE > NEW FEATURE). Danh sách 260 task và trạng thái: `docs/matrix/chatbot-master-matrix.csv`.

## Phân phối (Distribution)

MotoAI có thể chạy dưới 6 hình thức, tất cả dùng **một engine canonical duy nhất** (không fork business logic):

1. **Direct web app** — <https://thuexemayhanoi.github.io/aichatbot/>
2. **Embed widget** — một thẻ `<script>` (docs/EMBED.md)
3. **WordPress plugin** — loader mỏng `integrations/wordpress/`, ZIP `dist/motoai-agent.zip` do CI sinh (docs/WORDPRESS.md)
4. **PWA / Add to Home Screen** — manifest + service worker, offline shell, icon PNG sinh deterministic bởi `tools/gen-icons.py` trong CI (docs/PWA.md)
5. **Android wrapper** — nền Capacitor (docs/MOBILE.md)
6. **iOS wrapper** — nền Capacitor (docs/MOBILE.md)

Không kênh nào cần API key, backend hay inference từ xa. Chi tiết chiến lược versioning/build: docs/DISTRIBUTION.md.

## Cấu hình

Direct link hỗ trợ query params: `?lang=vi|en&theme=auto|light|dark&source=<label>&embed=1`.

Embed: `data-lang`, `data-theme`, `data-position`, `data-title`, `data-source`, `data-open` — xem `docs/EMBED.md`.

## Local AI — model được chọn động (v43.1)

Model id KHÔNG bị hard-code. Khi người dùng xác nhận bật AI tại chỗ, MotoAI tải module WebLLM, đọc `prebuiltAppConfig.model_list` của chính module đó và chọn model nhỏ phù hợp nhất (ưu tiên Qwen 0.5B multilingual, low-resource, ≤1.5B tham số, đủ VRAM). Không có model phù hợp → AI tại chỗ tắt nhẹ nhàng, trợ lý cơ bản vẫn hoạt động. Lỗi kỹ thuật chỉ vào console/debug; người dùng chỉ thấy câu tiếng Việt thân thiện.

## Quyền riêng tư

MotoAI yêu cầu: KHÔNG backend, KHÔNG API key, KHÔNG paid inference API. Mặc định mọi câu trả lời chạy trên thiết bị người dùng; không hội thoại nào được gửi tới API bên thứ ba. CDN (esm.run, Hugging Face model shards) chỉ dùng để tải asset tĩnh — inference luôn chạy trong browser người dùng. Local AI (WebLLM) tải model về máy người dùng và cache (Cache API), chỉ bật khi người dùng chủ động chọn. Xem `docs/LOCAL-AI.md`.

## Trình duyệt

Chatbot cơ bản chạy trên mọi trình duyệt hiện đại (kể cả không có WebGPU). Local AI cần WebGPU — xem `docs/COMPATIBILITY.md`.

---

# v47 — ULTRA BLOG + NATIONAL APP SEO FOUNDATION (2026-09-26)

Từ v47, repo này không chỉ là chatbot: nó là **(1) sản phẩm web chat-first, (2) landing page SEO quốc gia cho intent app/ứng dụng thuê xe máy & xe điện, (3) nền tảng blog 2.000 bài, (4) nguồn tri thức tùy chọn cho Agent, (5) sản phẩm embed/mobile-ready.** Agent cũ KHÔNG bị thay thế — toàn bộ kiến trúc trả lời cũ giữ nguyên, blog là tier MỚI thấp nhất.

## AI PHẢI ĐỌC TRƯỚC KHI LÀM VIỆC

1. File này (README) — toàn bộ.
2. `docs/SEO-OWNERSHIP.md` — quyền từ khóa quốc gia + an toàn cross-repo.
3. `docs/BLOG.md` + `docs/BLOG-FACTORY.md` + `docs/ARTICLE-RULES.md` + `docs/KNOWLEDGE-RETRIEVAL.md`.
4. `data/blog/content-matrix.csv` + `reports/blog-factory-run.md` + `docs/state/` (lock/transaction nếu có → `resume` ngay).

## Kiến trúc trả lời (mở rộng v47)

```
Google/User → Homepage/Blog → Search/Agent → Context Memory → Intent/Entity
→ Rules → Hybrid Retrieval (business) → Blog Knowledge (tùy chọn, tier thấp nhất)
→ Recommendation/Calculator → Local Agent phrasing (opt-in) → Fact Guard → Answer/CTA
```

Blog KHÔNG BAO GIỜ override giá/địa chỉ/điện thoại/giờ/cọc/chính sách đã xác minh trong `data/business/`. Blog retriever (`src/search/blog-knowledge.js`) khước từ mọi intent dữ liệu kinh doanh và chỉ chạy khi engine đã khước từ.

## Danh mục blog (6, mỗi bài đúng 1 danh mục)

| ID | Hub | Tên | Kế hoạch |
|----|-----|-----|----------|
| APP | `/blog/app/` | App & Ứng dụng | 350 |
| RENT | `/blog/thue-xe/` | Thuê xe máy | 400 |
| EV | `/blog/xe-dien/` | Xe điện / xe máy điện | 300 |
| GUIDE | `/blog/huong-dan/` | Hướng dẫn / thủ tục | 300 |
| SAFE | `/blog/an-toan/` | An toàn / pháp lý | 250 |
| LOCAL | `/blog/dia-phuong/` | Địa phương / du lịch | 400 |

## Ma trận 2.000 bài

`data/blog/content-matrix.csv` — 2.000 dòng, 40 lô × 50, sinh bởi `node tools/gen-blog-matrix.mjs` (idempotent). Trạng thái `PLANNED`. KHÔNG mass-write trong run thường; chỉ qua `tools/blog-factory.mjs` theo scheduled run procedure trong `docs/BLOG-FACTORY.md`. Hiện có 2 bài pilot PUBLISHED (fixture, `notes=pilot/fixture`).

## Công cụ

```bash
npm test                                   # toàn bộ test (unit + integration + blog)
node tools/gen-blog-matrix.mjs             # tái tạo ma trận (deterministic)
node tools/build-blog.mjs                  # dựng blog + indexes + sitemap
node tools/blog-factory.mjs validate       # QA ma trận
node tools/blog-factory.mjs publish BA-xxxx# publish 1 bài (transaction)
node tools/blog-factory.mjs resume         # phục hồi transaction đứt quãng
```

## Homepage (v47.1 — chatbot-first)

- Chatbot LÀ homepage: mở URL là vào ngay Agent (header "Hỗ trợ Agent", địa chỉ đã xác minh, ☰ menu, messages, quick bar, composer) — KHÔNG hero phía trên, KHÔNG cần cuộn.
- H1 của trang là "Hỗ trợ Agent"; intent app quốc gia giữ qua title/meta/schema và đoạn SEO hỗ trợ nhỏ đặt SAU chatbot (`.motoai-seo`, ẩn trong embed mode).
- Menu ☰ drawer: Agent, Blog/Cẩm nang, App & Ứng dụng, Thuê xe máy, Xe điện, Hướng dẫn/Thủ tục, An toàn/Pháp lý, Địa phương/Du lịch, Tìm bài, Giá thuê, Địa chỉ, Zalo, Gọi, Bản đồ, Xóa hội thoại. Link liên hệ resolve từ `business.json` lúc render.
- Quick bar 12 action giữ nguyên MỘT hàng cuộn ngang.
- SEO: title, meta, canonical, OG/Twitter, schema `WebApplication` + `Organization` + `FAQPage`; từ khóa sở hữu (app thuê xe máy, ứng dụng thuê xe máy, app thuê xe điện, ứng dụng thuê xe máy điện) nằm trong đoạn SEO sau chatbot; KHÔNG giới thiệu là app native trên store.
- Embed iframe: KHÔNG menu, KHÔNG đoạn SEO — widget tối giản như cũ.

## Hiệu năng

Homepage không tải: metadata 2.000 bài, full blog index, model embedding, model WebLLM khi mở trang. Knowledge index chỉ fetch sau lượt chat đầu tiên (direct mode). Blog search index chỉ fetch khi gõ truy vấn đầu tiên.

## Kiểm thử

`tests/unit/blog-foundation.test.js` + `tests/unit/blog-knowledge.test.js` phủ: 2.000 dòng/40×50/phân bố, id/slug/path duy nhất, hub tồn tại, sitemap không chứa bài chưa publish, search/knowledge index chỉ chứa bài PUBLISHED, legal gate cho SAFE, doorway guard cho LOCAL, ownership từ khóa, business facts override blog. CI thêm bundle guard (xem `.github/workflows/ci.yml`).

## Lệnh scheduled sản xuất nội dung (không tự chạy)

Khi được yêu cầu rõ ràng, run theo lô:

```
Đọc README → docs/BLOG-FACTORY.md (procedure) → lock → viết 50 bài 1 lô
→ QA từng bài → publish transaction từng bài → validate + npm test → unlock → report
```
