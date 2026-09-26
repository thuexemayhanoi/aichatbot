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
tests/                   # 447 test (node --test): unit, integration, golden + multi-turn + distribution
docs/                    # LOCAL-AI.md, EMBED.md, ARCHITECTURE.md, COMPATIBILITY.md, WORKFLOW.md, TESTING.md, UI-UX.md, WORDPRESS.md, PWA.md, MOBILE.md, DISTRIBUTION.md
docs/matrix/             # Master Matrix (276 tasks, BOT-0001..BOT-0276) + test matrix
docs/state/active-work.json  # checkpoint/lock cho các scheduled run
reports/                 # evidence report theo từng run
tools/gen-matrix.mjs     # tái tạo Master Matrix (idempotent)
.github/workflows/ci.yml # CI: full tests + secret scan + bundle guard
```

LLM **tùy chọn hoàn toàn** — không có API key, không backend, không paid inference; mọi tính năng cơ bản (rules, NLU, BM25, recommendation, calculator, context) chạy không cần LLM. Lớp semantic cũng là local-first: model embedding tải từ CDN tĩnh, chạy WASM trong trình duyệt, chỉ warm-up SAU lượt chat đầu tiên, fail thì BM25 vẫn đầy đủ. Toàn bộ context memory nằm trong localStorage của người dùng (nút 🧹 để xoá).

## UI khách hàng (v45)

Header hiển thị **"Hỗ trợ Agent"** + subtitle địa chỉ verified ("Thuê xe máy Nguyễn Tú — 112 Nguyễn Văn Cừ, Long Biên, Hà Nội"); MotoAI chỉ còn là tên nội bộ của dự án. Quick chips: 4 chip chính (💰 Giá thuê / 🛵 Xe ga / 🏍️ Xe số / 📅 Theo tháng) trên một hàng cuộn ngang, sau mỗi câu trả lời chips contextual được chọn deterministic từ intent + slots (`src/app/suggestions.js`) — LLM không sinh suggestion, UI không hard-code giá. Nhãn khách hàng cho Local AI là **"Agent"**: "Đang chuẩn bị Agent...", "Agent sẵn sàng" (tự ẩn), model id/WebLLM/VRAM không bao giờ hiện ở UI thường (chỉ ở `?debug=1`, console, docs).

## Thứ tự ưu tiên trả lời (không đổi)

1. **Rule engine tất định** — giá, cọc, giờ mở cửa, địa chỉ... luôn thắng.
2. **Business-data retrieval** (BM25 trên dữ liệu repo).
3. **Local LLM** (WebLLM, opt-in, chỉ chạy khi 1+2 khước từ, bị fact-guard).
4. **Fallback trung thực** ("mình chưa có thông tin chắc chắn").

LLM **không bao giờ** được phép bịa giá, chính sách, địa chỉ, số điện thoại. Output có chứa số không có trong context đã verify sẽ bị loại bỏ. Xem `docs/LOCAL-AI.md`.

## Chạy test

```bash
npm test        # node --test — 447 tests
```

Golden conversation regression nằm ở `tests/integration/golden.test.js`, kỳ vọng đọc trực tiếp từ `data/business/*.json` (không hard-code).

CI chạy toàn bộ suite trên mỗi push/PR tới `main`, kèm secret-scan và bundle regression guard. Quy trình scheduled run: xem `docs/WORKFLOW.md` (RESUME > FIX > VERIFY > IMPROVE > NEW FEATURE). Danh sách 276 task và trạng thái: `docs/matrix/chatbot-master-matrix.csv`.

## Cấu hình

Direct link hỗ trợ query params: `?lang=vi|en&theme=auto|light|dark&source=<label>&embed=1`.

Embed: `data-lang`, `data-theme`, `data-position`, `data-title`, `data-source`, `data-open` — xem `docs/EMBED.md`.

## Phân phối (Distribution)

MotoAI có thể chạy dưới 6 hình thức, tất cả dùng **một engine canonical duy nhất** (không fork business logic):

1. **Direct web app** — <https://thuexemayhanoi.github.io/aichatbot/>
2. **Embed widget** — một thẻ `<script>` (docs/EMBED.md)
3. **WordPress plugin** — loader mỏng `integrations/wordpress/`, ZIP `dist/motoai-agent.zip` (docs/WORDPRESS.md)
4. **PWA / Add to Home Screen** — manifest + service worker, offline shell (docs/PWA.md)
5. **Android wrapper** — nền Capacitor (docs/MOBILE.md)
6. **iOS wrapper** — nền Capacitor (docs/MOBILE.md)

Không kênh nào cần API key, backend hay inference từ xa. Chi tiết chiến lược versioning/build: docs/DISTRIBUTION.md.

## Local AI — model được chọn động (v43.1)

Model id KHÔNG bị hard-code. Khi người dùng xác nhận bật AI tại chỗ, MotoAI tải module WebLLM, đọc `prebuiltAppConfig.model_list` của chính module đó và chọn model nhỏ phù hợp nhất (ưu tiên Qwen 0.5B multilingual, low-resource, ≤1.5B tham số, đủ VRAM). Không có model phù hợp → AI tại chỗ tắt nhẹ nhàng, trợ lý cơ bản vẫn hoạt động. Lỗi kỹ thuật chỉ vào console/debug; người dùng chỉ thấy câu tiếng Việt thân thiện.

## Quyền riêng tư

MotoAI yêu cầu: KHÔNG backend, KHÔNG API key, KHÔNG paid inference API. Mặc định mọi câu trả lời chạy trên thiết bị người dùng; không hội thoại nào được gửi tới API bên thứ ba. CDN (esm.run, Hugging Face model shards) chỉ dùng để tải asset tĩnh — inference luôn chạy trong browser người dùng. Local AI (WebLLM) tải model về máy người dùng và cache (Cache API), chỉ bật khi người dùng chủ động chọn. Xem `docs/LOCAL-AI.md`.

## Trình duyệt

Chatbot cơ bản chạy trên mọi trình duyệt hiện đại (kể cả không có WebGPU). Local AI cần WebGPU — xem `docs/COMPATIBILITY.md`.
