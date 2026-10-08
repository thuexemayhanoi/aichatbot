# Continuous Writer Contract — vòng lặp bắt buộc của external writer

Tài liệu này là nguồn chuẩn duy nhất cho cách một writer run (agent AI bên ngoài) PHẢI hoạt động liên tục với `/`. `docs/BLOG-FACTORY.md`, `README.md` và workflow tham chiếu tài liệu này.

## Phân vai (quan trọng)

- **External AI writer** thực hiện vòng lặp viết liên tục: chọn bài, research, viết prose, push.
- **GitHub Actions** (`blog-factory-publish.yml`) thực hiện phần deterministic: detect đúng các bài, auto-claim, scoped QA, grouped transactional publish, rebuild, verify, commit derived state.
- **Actions KHÔNG BAO GIỜ tự viết prose, không gọi AI, không schedule writer.** Continuous production chỉ chạy khi owner yêu cầu rõ ràng; factory đã continuous-ready.

## 3 writer song song (PARALLEL WRITER MODE, v68)

Khi cần tăng throughput phần WRITE, repo chạy 3 external writer song song với MỘT central coordinator + MỘT serialized publisher. Hợp đồng đầy đủ nằm ở `docs/PARALLEL-WRITER.md`, tool là `tools/writer-queue.mjs`, tests là `tests/unit/writer-queue.test.js`. Tóm tắt bất biến:

- CHỈ coordinator được reserve article ID (tối đa 50 PLANNED một batch, chia micro-chunk 2 bài, round-robin A/B/C). Manifest `docs/state/writer-assignments.json` là nguồn sự thật duy nhất; duplicate ID → fail closed.
- Writer chỉ làm queue riêng, KHÔNG tự chọn "next PLANNED", KHÔNG push main — chỉ push branch `writer/<batch>/<A|B|C>` (2 bodies + chunk file `writer-work/...`).
- Publisher serialized duy nhất đẩy lên main: FIFO theo chunk seq, mỗi lần đúng một chunk 2 bài, fresh-main verification trước push, published chunk không bao giờ chạy lại.
- SIMPLE PRODUCTION MODE (v67) bên dưới được giữ nguyên: NEW/REPAIR/BACKLOG tách rời, factory exact-scope 2 bài, một build mỗi chunk. 3 writer không làm thay bất kỳ gate nào.

## Mô hình canonical — 2 ARTICLES / MICRO CHUNK, SIMPLE PRODUCTION MODE (v67)

- Đơn vị làm việc = MỘT MICRO CHUNK gồm 2 bài mỗi lượt writer. Push = đúng 2 article source (2 body mới tại `data/blog/articles/<slug>.body.html`) + đúng 2 manifest draft entries (`data/blog/published.json`). Nếu chỉ còn đúng 1 bài actionable ở biên batch/corpus, chunk size 1 được cho phép.
- Triết lý vận hành giống /vanchinh: SIMPLE → FAST → STABLE. Production push chỉ cần scoped verification. KHÔNG chạy full `node --test`, full-site SEO audit, full-site duplicate scan, full chatbot regression, distribution build hay toàn-site link audit cho mỗi cặp 2 bài. Các gate nặng chỉ chạy khi engine/workflow/tool thay đổi (trong `ci.yml`), hoặc ở audit cuối corpus 2.000 bài.
- **Writer KHÔNG lock → claim → finish → push matrix bằng tay.** Ma trận không nằm trong writer push. Workflow không dùng persistent lock: các run đã serialize bằng concurrency group; crash safety nằm ở txn marker (`resume`) và backlog discovery.
- Push sớm từng cặp = safe checkpoint trên main: mất workspace/session không mất tiến độ. Không giữ nhiều bài chưa push trong workspace.
- Hard invariant của workflow: tối đa 50 body thay đổi một push (giống /vanchinh). Micro loop chuẩn push đúng 2 mỗi lần; writer bình thường KHÔNG dùng 50.
- Ma trận (2.000 dòng) vẫn là source of truth; checkpoint/lock/txn là derived operational state, không bao giờ được push.
- Pages deploy chạy độc lập: factory KHÔNG chờ Pages xong. Factory GREEN + derived state committed là checkpoint production; writer có thể làm cặp sau ngay sau đó.

## Scope tách rời — NEW / REPAIR / BACKLOG (giống /vanchinh)

Factory-select bắt buộc các scope MUTUALLY EXCLUSIVE, không trộn:

- **NEW**: push chứa body của dòng PLANNED/WRITING → claim + QA đúng đúng các id đã push. Body của dòng QA/REPAIR nằm trong cùng push → QA cùng chạy (thuộc scope push). NEW KHÔNG BAO GIỜ tự kéo unrelated pending/backlog vào cùng run.
- **REPAIR**: push chỉ chứa body của dòng QA/REPAIR/PASS → xử lý đúng các id đó, KHÔNG claim dòng PLANNED mới.
- **BACKLOG**: chỉ chạy khi KHÔNG có body nào được push (workflow_dispatch không ids): dòng dở (QA/REPAIR/PASS có draft hợp lệ) trước, rồi dòng PLANNED có sẵn body + draft (workflow cũ chết). Deterministic, tối đa 50.

Hệ quả cho writer: dòng dở KHÔNG còn tự được factory trộn vào run NEW. Writer phải sửa bài dở rồi push body sửa (→ REPAIR), hoặc owner dispatch quét backlog.

## LOOP (bắt buộc mỗi writer run)

```
FETCH FRESH MAIN
→ RECOVER IF NEEDED (txn marker → resume; state sạch → đi thẳng)
→ REPAIR/RESUME bài đang dở (QA/REPAIR/PASS): sửa rồi push body (REPAIR) TRƯỚC
→ SELECT next 2 actionable rows (PLANNED kế tiếp theo thứ tự ma trận)
→ RESEARCH (nguồn xác minh; bài SAFE cần nguồn gov.vn/vbpl.vn)
→ WRITE 2 (bodies + manifest draft entries; 1.500–4.000 từ hữu ích mỗi bài)
→ LOCAL SCOPED QA each article (node tools/article-qa.mjs <BA-id> — PASS mới push)
→ PUSH 2 (2 bodies + 2 manifest draft entries; KHÔNG push matrix, lock, txn, checkpoint)
→ FACTORY GREEN (blog-factory-publish.yml xanh cho đúng SHA — grouped publish, 1 build)
→ VERIFY remote state (workflow xanh, matrix=PUBLISHED cả 2, không lock, không txn)
→ FETCH FRESH MAIN
→ NEXT 2
→ REPEAT (không dừng sau mỗi cặp 2 bài)
```

Canonical writer: WRITE 2 → LOCAL QA → PUSH 2 → FACTORY → FETCH FRESH MAIN → NEXT 2.

## Không được dừng vì

- một cặp 2 bài vừa publish (đó là checkpoint, KHÔNG phải điểm kết thúc);
- một workflow vừa GREEN; một Pages deploy vừa xong;
- tests vừa xanh; progress report vừa được sinh.

## Chỉ được dừng khi

1. toàn bộ corpus terminal hợp lệ (PUBLISHED theo ma trận, hoặc FAIL/BLOCKED chờ người);
2. blocker thật cần con người (txn mơ hồ sau resume, validation critical);
3. owner yêu cầu dừng;
4. runtime/session/network/tool limit buộc dừng — dừng tại điểm an toàn: workflow đã xong, fresh main đã fetch, không lock, không txn.

Nếu runtime chết giữa chừng: remote GitHub state (matrix + manifest + bodies đã push) chính là checkpoint; run sau fetch fresh main và resume từ đó.

## Writer push — refuse rules (workflow REFUSE, writer phải sửa rồi push lại)

- Push chứa **hơn 50 article body** → REFUSE (workflow ceiling; canonical = 2).
- Body có slug **không tồn tại trong ma trận** → REFUSE. Slug trùng nhau trong push → REFUSE.
- Body **không có** manifest draft entry khớp (id/slug/body path) → REFUSE.
- **Duplicate article_id** trong manifest → REFUSE.
- Push `docs/state/**` (lock/txn/checkpoint) → REFUSE.
- `published.json` đổi mà không có body mới → REFUSE.
- Bài **FAIL/BLOCKED** → REFUSE (cần người xem xét).
- Bài **PUBLISHED** bị sửa body → workflow SKIP, không bao giờ tự rewrite.

## Recovery (workflow — gọn như /vanchinh)

Happy path sạch đi thẳng production, không thao tác recovery:

1. txn marker còn → `resume` đúng TOÀN BỘ các id trong marker TRƯỚC (rebuild + verify từng id + clear marker); không có marker → không chạy gì cả.
2. lock đã retired khỏi workflow (v67): run serialize bằng concurrency group `blog-factory-publish`, `cancel-in-progress: false`; stale lock (nếu có) bị dọn ở bước recover.
3. crash giữa prepare/QA → dòng ở lại QA/PLANNED với body + draft trên main → lần push kế của writer tự claim tiếp (backlog logic), hoặc owner dispatch `--backlog`.
4. crash giữa publish → txn marker + `resume` dựng lại đúng chunk (một build).

Writer phía mình: fetch fresh main, đọc matrix + manifest, không push từ stale HEAD, không force push.

## Length guideline (v69 — GUIDELINE, không còn là gate chặn publish)

- **<300 từ → critical FAIL (bài rác/cụt nghiêm trọng).**
- 300–1.499 từ → warning `-5` điểm (score vẫn PASS được nếu >=70). 1.500–4.000 từ → không cảnh báo. >4.000 từ → warning, writer rút gọn có nghĩa, tool không tự truncate.
- Không padding để đạt sàn; không cắt tại 2.000 từ; không truncate giữa câu/đoạn. Độ dài theo search intent.

## Minimal production QA (v69, `tools/article-qa.mjs`)

Score: **70–100 = PASS; <70 = FAIL → REPAIR** (tối đa 3 lần sửa có nghĩa, vượt → BLOCKED). Không REVIEW, không EXCELLENT, không warning score band, không yêu cầu 75/90/100. Bài >=70 KHÔNG BAO GIỜ bị sửa chỉ để tăng điểm.

Critical gate (duy nhất 7 nhóm, mỗi lỗi → score 0):

1. bài rỗng/cụt nghiêm trọng (<300 từ);
2. duplicate article ID;
3. duplicate slug;
4. duplicate/sai canonical (id-slug-path lệch matrix/manifest);
5. HTML/frontmatter hỏng khiến trang không render (script nhúng, tag không cân);
6. sai giá hoặc policy kinh doanh đã xác minh (fact-resolution, verified-phones-only, verified-deposits-only);
7. broken link nghiêm trọng (internal links không trỏ tới file thật).

Mọi lỗi SEO nhẹ khác chỉ là warning `-5` điểm, KHÔNG chặn publish: body-words (guideline 1.500–4.000) · body-structure · no-filler · no-duplicate-paragraphs/sentences · no-cross-article-duplicate · no-cannibalization · title-meta-valid · seo-ownership · local-angle · safe-legal-gate (gov.vn/vbpl.vn) · no-external-links · retrieval-consistency.

QA scoped tới đúng các bài mới của cycle hiện tại (12–18 bài, không quét lại toàn site, không re-audit bài PUBLISHED). Mỗi bài kết quả độc lập (qa-chunk): một bài FAIL chuyển sang repair queue, các bài PASS tiếp tục publish trong cùng cycle — một bài FAIL KHÔNG giữ toàn bộ cycle.

## CI theo loại push

- Article-only push (bodies + manifest): chỉ `blog-factory-publish.yml` + scoped QA + light matrix smoke. `ci.yml` / `distribution.yml` bỏ qua qua `paths-ignore`.
- Engine/tool/workflow/test/PWA/chatbot changes: full `node --test` + distribution vẫn chạy đầy đủ.
- Derived commit của factory (`[skip ci]`, không chạm trigger paths) không recursive trigger. Pages deploy độc lập, KHÔNG bị factory chờ.

## Verify (định nghĩa)

VERIFY của mỗi chunk = workflow GREEN cho đúng SHA vừa push + matrix cả 2 dòng PUBLISHED + không lock + không txn. Không mở rộng scope sau mỗi cặp 2 bài; không chờ Pages để làm cặp kế tiếp.
