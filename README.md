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
docs/                    # LOCAL-AI, EMBED, ARCHITECTURE, COMPATIBILITY, WORKFLOW, TESTING, UI-UX, WORDPRESS, PWA, MOBILE, DISTRIBUTION, SEO-OWNERSHIP, BLOG, BLOG-FACTORY, CONTINUOUS-WRITER, ARTICLE-RULES, KNOWLEDGE-RETRIEVAL
docs/matrix/             # Master Matrix (260 tasks, BOT-0001..BOT-0260) + test matrix
docs/state/active-work.json  # checkpoint/lock cho các scheduled run
reports/                 # evidence report theo từng run
tools/gen-matrix.mjs     # tái tạo Master Matrix (idempotent)
.github/workflows/ci.yml # CI: full tests + secret scan + bundle guard
.github/workflows/blog-factory-publish.yml # micro batch publish: 2 bài/chunk (scoped QA + grouped transaction + 1 derived commit)
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

`data/blog/content-matrix.csv` — 2.000 dòng, 40 lô × 50, sinh bởi `node tools/gen-blog-matrix.mjs` (idempotent). Trạng thái `PLANNED`. KHÔNG mass-write trong run thường; chỉ qua `tools/blog-factory.mjs` theo scheduled run procedure trong `docs/BLOG-FACTORY.md` + hợp đồng continuous trong `docs/CONTINUOUS-WRITER.md`. Hiện có 2 bài pilot PUBLISHED (fixture, `notes=pilot/fixture`).

## Công cụ

```bash
npm test                                   # toàn bộ test (unit + integration + blog)
node tools/gen-blog-matrix.mjs             # tái tạo ma trận (deterministic)
node tools/build-blog.mjs                  # dựng blog + indexes + sitemap
node tools/blog-factory.mjs validate       # QA ma trận
node tools/blog-factory.mjs claim [BA-id]  # nhận ĐÚNG 1 dòng PLANNED -> WRITING (cần lock)
node tools/blog-factory.mjs finish BA-xxxx # WRITING -> QA
node tools/blog-factory.mjs prepare BA-xxxx # auto-claim PLANNED/WRITING -> QA (workflow dùng lệnh này)
node tools/blog-factory.mjs qa BA-xxxx     # scoped QA deterministic (PASS/FAIL)
node tools/blog-factory.mjs publish BA-xxxx# publish 1 bài (transaction)
node tools/blog-factory.mjs resume         # phục hồi transaction đứt quãng
```

Writer production (continuous, 2 bài/chunk): viết 2 bodies + 2 manifest draft entries → local scoped QA từng bài → push; `blog-factory-publish.yml` tự detect đúng các bài, auto-claim, scoped QA, grouped publish (1 build/chunk), verify và commit derived state. Chi tiết: `docs/CONTINUOUS-WRITER.md`. Article-only push không chạy full chatbot CI (`ci.yml`/`distribution.yml` bỏ qua qua `paths-ignore`); engine/tool/workflow changes vẫn chạy full suite.

## Homepage (v47.1 — chatbot-first)

- Chatbot LÀ homepage: mở URL là vào ngay Agent (header "Hỗ trợ Agent", địa chỉ đã xác minh, ☰ menu, messages, quick bar, composer) — KHÔNG hero phía trên, KHÔNG cần cuộn.
- H1 của trang là "Hỗ trợ Agent"; intent app quốc gia giữ qua title/meta/schema và đoạn SEO hỗ trợ nhỏ đặt SAU chatbot (`.motoai-seo`, ẩn trong embed mode).
- Menu ☰ drawer: Agent, Cẩm nang (6 danh mục + Tìm bài), Dịch vụ (Giá thuê, Địa chỉ, Liên hệ, Gọi, WhatsApp, Bản đồ), Pháp lý, Xóa chat. Link liên hệ resolve từ `business.json` lúc render. Zalo đã bị loại khỏi mọi giao diện khách (v57).
- Quick bar 12 action giữ nguyên MỘT hàng cuộn ngang.
- SEO: title, meta, canonical, OG/Twitter, schema `WebApplication` + `Organization` + `FAQPage`; từ khóa sở hữu (app thuê xe máy, ứng dụng thuê xe máy, app thuê xe điện, ứng dụng thuê xe máy điện) nằm trong đoạn SEO sau chatbot; KHÔNG giới thiệu là app native trên store.
- Embed iframe: KHÔNG menu, KHÔNG đoạn SEO — widget tối giản như cũ.

## Hiệu năng

Homepage không tải: metadata 2.000 bài, full blog index, model embedding, model WebLLM khi mở trang. Knowledge index chỉ fetch sau lượt chat đầu tiên (direct mode). Blog search index chỉ fetch khi gõ truy vấn đầu tiên.

## Kiểm thử

`tests/unit/blog-foundation.test.js` + `tests/unit/blog-knowledge.test.js` phủ: 2.000 dòng/40×50/phân bố, id/slug/path duy nhất, hub tồn tại, sitemap không chứa bài chưa publish, search/knowledge index chỉ chứa bài PUBLISHED, legal gate cho SAFE, doorway guard cho LOCAL, ownership từ khóa, business facts override blog. CI thêm bundle guard (xem `.github/workflows/ci.yml`).

## Lệnh scheduled sản xuất nội dung (không tự chạy)

Khi được yêu cầu rõ ràng, run theo LIGHTWEIGHT MICRO LOOP — 1 BÀI / CYCLE (v64):

```
Đọc README → docs/BLOG-FACTORY.md (procedure) → lock → claim đúng các bài theo hợp đồng chunk
→ viết đúng 1 bài (body + manifest draft) → finish → push
→ blog-factory-publish.yml: scoped QA → publish transaction → rebuild + verify
→ commit derived state → clean txn/lock → xanh
→ fetch fresh main → cycle kế tiếp (chỉ khi được yêu cầu tiếp)
```

# BLOG APP UX FOUNDATION (v54 — 2026-09-26)

MotoAI gồm **hai bề mặt của cùng một hệ sản phẩm**, dùng chung design language (theme tokens trong `assets/css/style.css`), verified business data (`data/business/business.json`), contact actions, navigation philosophy, accessibility, mobile safe-area và PWA/app-like UX:

1. **Agent Application** — `/` = chatbot full-screen. Mở URL là vào ngay Agent. KHÔNG bị biến thành landing page.
2. **Blog / Cẩm nang Application** — `/blog/` = content application. Blog là ecosystem phụ được mở từ Agent (menu ☰ → Cẩm nang; mỗi blog page có nút "← Agent" và CTA "⚡ Hỏi Agent").

## Nền tảng blog v54

- **Shell thống nhất**: mọi blog page (home + 6 hub + 2 bài pilot) dùng chung compact app header (← Agent, Cẩm nang, theme control), category bar 6 danh mục (một hàng cuộn ngang, `aria-current="page"` trên hub hiện tại), breadcrumb trên hub/bài.
- **Theme Light/Dark/Auto** (`assets/js/theme.js`): preference lưu `localStorage('motoai-theme')`, áp qua `<html data-motoai-theme="dark">` — cùng attribute mà Agent tokens đã theme. Inline head script áp theme trước first paint (no flash). Toggle `#blog-theme-toggle` cycle Auto → ☀️ → 🌙. Theme trên Agent root: DEFERRED (xem `docs/matrix/blog-app-ux-matrix.csv` BLOGUX-0021).
- **Business open/closed status** (`assets/js/business-status.js`): tính theo giờ trong timezone kinh doanh (`Asia/Ho_Chi_Minh`, từ `business.json`), không theo giờ thiết bị; xử lý midnight-wrap; thiếu dữ liệu → ẩn chip, không đoán.
- **Single app shell (v57)**: mọi màn hình content (blog home, danh mục, subtopic, bài viết, privacy, terms) render bằng `tools/app-shell.mjs` — cùng top chrome + dock + drawer với màn hình chat; chỉ vùng nội dung giữa thay đổi. Hành động "⚡ Hỏi Agent" đưa về màn hình chat (`/aichatbot/?ask=<chủ đề>`), dock/menu action dùng `/aichatbot/?action=price|contact|address`. Runtime màn hình content: `assets/js/app-shell.js` (theme + drawer + status + contact refs).
- **Search**: giữ nguyên `assets/js/blog.js` (lazy index + debounce + empty state) — audited, không đổi.

## NO MASS ARTICLE GENERATION

Blog App Foundation KHÔNG sinh bài. `data/blog/content-matrix.csv` giữ nguyên 2.000 dòng PLANNED; chỉ 2 bài pilot PUBLISHED. Ma trận UI/UX riêng: `docs/matrix/blog-app-ux-matrix.csv`.

## Roadmap theo phase

- v53 — Chat Shell / interaction consistency (DONE)
- v54 — Blog App Foundation (phase này)
- v55 — Blog UX + SEO Matrix execution
- v56 — Full-system audit & polish (audit phase executed early by the 2026-09-27 03:00 run: BLOGUX-0024 DONE; only open SEO gap og:locale privacy/terms fixed; seo-score 100/100)

Sau v56 mới scale article production theo `docs/BLOG-FACTORY.md`.

# v56 — BLOG APP FOUNDATION (2026-09-27)

Blog trở thành một màn hình của cùng ứng dụng, với phân loại cha/con cho 2.000 bài. KHÔNG sinh bài mới trong run này (2 bài pilot giữ nguyên; 1.998 dòng PLANNED).

## Nền tảng v56

- **Phân loại 5 tầng** (`data/blog/taxonomy.json` + `tools/taxonomy.mjs`): Agent → Cẩm nang → 3 cụm (Ứng Dụng, Thuê Xe, Khám Phá) → 6 danh mục canonical (ID không đổi) → subtopic → bài. Mọi trường phái sinh tính tất định từ dòng ma trận — CSV không đổi schema/ID.
- **Menu + Footer một nguồn sự thật** (`config/navigation.json`): nhãn ngắn 1–2 từ, cùng nhãn + URL ở drawer và footer; footer sinh tự động cho mọi trang content; viewport chat KHÔNG có footer (giữ full-screen app).
- **Blog home**: compact hero + tìm kiếm + 3 thẻ cụm + 6 thẻ danh mục + bài mới + CTA Agent.
- **Hub danh mục**: intro, chips subtopic (chỉ khi có bài), phân trang crawlable 24/trang, danh mục liên quan cùng cụm, CollectionPage + BreadcrumbList.
- **Subtopic hub**: chỉ sinh khi ≥ 1 bài PUBLISHED — không hub rỗng; bài #37/#500/#2,000 tự xuất hiện đúng chỗ, không sửa navigation thủ công.
- **Bài viết**: chips danh mục/subtopic, dek, TOC build-time (anchor tiếng Việt an toàn; mobile accordion, desktop sticky rail 230px + content 720px), related theo subtopic → danh mục, breadcrumb khớp BreadcrumbList, CTA Agent, footer.
- **Tìm kiếm**: index thêm trường cluster/subtopic/location (vẫn compact, lazy-load).
- **Địa phương Hà Nội** (`data/local/hanoi.json`): dữ liệu hành chính chính thống theo NQ 1656/NQ-UBTVQH15 (hiệu lực 01/07/2025: 51 phường + 75 xã, không còn cấp quận) — dùng cho chiến lược 400 bài LOCAL, chống doorway.
- Test mới: `tests/unit/blog-app-foundation.test.js` (24 test: taxonomy, nav/footer vocabulary, subtopic gate, pagination, TOC, breadcrumb↔schema, sitemap, local data, factory safety). Tổng suite 552/552; seo-score 100/100.

# v58 — CHAT HOME + CONTENT SITE + FACTORY PRODUCTION LOOP (2026-09-28)

Mô hình sản phẩm cuối cùng: `/aichatbot/` = MÀN HÌNH CHAT (không footer website, Menu bên phải, dock + drawer giữ nguyên). Mọi trang khác = trang content website chuyên nghiệp dùng chung một shell: site header gọn (identity trái, nav danh mục giữa ≥900px, search/theme/Menu PHẢI), cột nội dung, footer thật sinh từ `config/navigation.json`.

## Nền tảng v58

- **Shell content-site** (`tools/app-shell.mjs`): header + drawer + footer sinh một nguồn duy nhất; trang content KHÔNG có dock chat.
- **3 cụm cha** có trang hub thật: `/blog/cong-cu-huong-dan/`, `/blog/thue-xe-phuong-tien/`, `/blog/kham-pha-an-toan/` (CollectionPage + breadcrumb).
- **Trang tĩnh từ dữ liệu xác minh**: `/gioi-thieu/`, `/chinh-sach/`, `/lien-he/`, `/gia-thue/` (bảng giá chỉ render số từ `pricing.json`; ô thiếu = "Xác nhận trực tiếp"; không bịa giá/cọc).
- **Trang bài viết v58**: byline + reading time (từ/200), hộp "Tóm tắt nhanh", TOC, related, bảng responsive `.blog-table` trong `.table-wrap`.
- **Tìm kiếm v58** (`assets/js/blog.js`): lọc danh mục từ index, nút xóa, số kết quả, empty state; vẫn lazy-load.
- **Factory v58** (`tools/blog-factory.mjs`): vòng sản xuất `claim [≤10] → finish-chunk → checkpoint → publish`; `abandon-chunk` trả dòng WRITING về PLANNED khi crash; lock bắt buộc trước claim; không duplicate claim/id/path. Sandbox test qua `MOTOAI_FACTORY_ROOT`.
- **Zalo public = 0** trên toàn bộ UI; liên hệ qua data-contact-ref resolve từ `business.json`.
- Homepage thêm nút chủ đề (Auto/Sáng/Tối) trước Menu; homepage không có footer website.
- Test: `blog-app-ux` (18), `blog-foundation` (23), `blog-factory` (9 sandbox), seo-score mở rộng 17+ trang. Suite 498/498; seo-score 100/100; matrix 2.000 dòng bất biến (2 PUBLISHED pilot).

# v64 — BLOG FACTORY MICRO LOOP: 1 ARTICLE / CYCLE (2026-09-30)

Đơn giản hóa blog factory thành LIGHTWEIGHT MICRO LOOP (lấy ý tưởng /vanchinh, phù hợp kiến trúc /aichatbot). KHÔNG thay đổi 2 bài pilot PUBLISHED; không viết/claim/publish bài mới trong run này.

## Thay đổi

- **Hợp đồng sản xuất**: chunk ≤10 (v58) nghỉ hưu. `claim` nhận ĐÚNG 1 dòng (PLANNED đầu tiên hoặc BA-id explicit); refuse khi đã có dòng WRITING (single-flight happy path); refuse tham số số.
- **Scoped QA mới** (`tools/article-qa.mjs`): checklist deterministic PASS/FAIL cho đúng 1 bài (id/slug/path, body 1.500–4.000 từ hữu ích theo search intent, không filler/dup/spun/cannibal, title/meta/slug/date, SEO ownership + doorway guard, business facts verified, SAFE legal gate, internal links, retrieval consistency). Repo chưa có article-level numeric score nên không dựng hệ chấm điểm mới.
- **Lệnh mới**: `finish <BA-id>` (WRITING→QA), `qa <BA-id>` (QA→PASS hoặc REVIEW, quá 3 lần → BLOCKED). `finish-chunk`/`abandon-chunk`/`resume`/`publish`/`checkpoint` giữ nguyên; `publish` verify thêm self-canonical + Article/BreadcrumbList schema + đúng 1 H1.
- **Push selection** (`tools/factory-select.mjs`): detect exact ID từ diff push; >1 file bài → REFUSE; PLANNED/WRITING có file → REFUSE; PUBLISHED-row edit → SKIP.
- **Workflow mới** `.github/workflows/blog-factory-publish.yml`: detect exact ID → guard lock/txn → lock → scoped QA → publish transaction → validate → clean txn/lock → MỘT commit derived state (`[skip ci]`, GITHUB_TOKEN). KHÔNG chạy full chatbot test suite cho từng bài; `node --test` đầy đủ giữ nguyên trong `ci.yml` cho mọi engine/tool/workflow change.
- **build-blog**: chỉ stamp `notes=pilot/fixture` cho bài `pilot:true` (bài production không bị đánh dấu fixture).
- Test invariant production-tolerant: PUBLISHED sync với `published.json` thay vì hardcode "2".
- Test mới: `article-qa` (22), `blog-factory-cycle` (9 sandbox full-repo: claim→finish→qa→publish→resume→cycle 2→no-dup), `blog-factory` viết lại cho micro loop (14). Suite 2 PUBLISHED pilot / 1.998 PLANNED bất biến.
