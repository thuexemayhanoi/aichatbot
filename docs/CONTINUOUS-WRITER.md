# Continuous Writer Contract — vòng lặp bắt buộc của external writer

Tài liệu này là nguồn chuẩn duy nhất cho cách một writer run (agent AI bên ngoài) PHẢI hoạt động liên tục với `/aichatbot/`. `docs/BLOG-FACTORY.md`, `README.md` và workflow tham chiếu tài liệu này.

## Phân vai (quan trọng)

- **External AI writer** thực hiện vòng lặp viết liên tục: chọn bài, research, viết prose, push.
- **GitHub Actions** (`blog-factory-publish.yml`) thực hiện phần deterministic: detect đúng các bài, auto-claim, scoped QA, grouped transactional publish, rebuild, verify, unlock, commit derived state.
- **Actions KHÔNG BAO GIỜ tự viết prose, không gọi AI, không schedule writer.** Continuous production chỉ chạy khi owner yêu cầu rõ ràng; factory đã continuous-ready.

## Mô hình canonical — 2 ARTICLES / MICRO CHUNK (v66)

- Đơn vị làm việc = MỘT MICRO CHUNK gồm 2 bài mỗi lượt writer. Push = đúng 2 article source (2 body mới tại `data/blog/articles/<slug>.body.html`) + đúng 2 manifest draft entries (`data/blog/published.json`). Nếu chỉ còn đúng 1 bài actionable ở biên batch/corpus, chunk size 1 được cho phép.
- **Writer KHÔNG lock → claim → finish → push matrix bằng tay.** Ma trận không nằm trong writer push. Workflow tự claim đúng các dòng (prepare-chunk: PLANNED → WRITING → QA), tự QA từng bài (qa-chunk, kết quả độc lập mỗi bài), tự publish nhóm (publish-chunk: MỘT build cho cả chunk).
- Push sớm từng cặp = safe checkpoint trên main: mất workspace/session không mất tiến độ. Không giữ nhiều bài chưa push trong workspace.
- Hard invariant của workflow: tối đa 50 body thay đổi một push (giống /vanchinh). Micro loop chuẩn push đúng 2 mỗi lần; nhảy 10–50 bài/lượt làm mất lợi thế checkpoint và KHÔNG phải canonical.
- Ma trận (2.000 dòng) vẫn là source of truth; checkpoint/lock/txn là derived operational state, không bao giờ được push.
- Backlog: nếu một workflow trước đó chết giữa chừng (body + manifest draft đã có nhưng dòng vẫn PLANNED), factory tự discovery và xử lý backlog đó một cách deterministic — writer KHÔNG phải viết lại hay push lại bài chỉ để retrigger.
- Resume/repair (dòng QA/REVIEW/REPAIR/PASS đang dở) LUÔN được ưu tiên trước bài PLANNED mới trong cùng một run.

## LOOP (bắt buộc mỗi writer run)

```
FETCH FRESH MAIN
→ RECOVER (txn marker / lock / last remote commit — remote state luôn thắng)
→ RESUME (bài đang QA/REVIEW/REPAIR/PASS dở: hoàn tất TRƯỚC)
→ SELECT next 2 actionable rows (PLANNED kế tiếp theo thứ tự ma trận)
→ RESEARCH (nguồn xác minh; bài SAFE cần nguồn gov.vn/vbpl.vn)
→ WRITE 2 (bodies + manifest draft entries; 1.500–4.000 từ hữu ích mỗi bài)
→ LOCAL SCOPED QA each article (node tools/article-qa.mjs <BA-id> — PASS mới push)
→ PUSH 2 (2 bodies + 2 manifest draft entries; KHÔNG push matrix, lock, txn, checkpoint)
→ WAIT factory GREEN (blog-factory-publish.yml xanh cho đúng SHA — grouped publish, 1 build)
→ VERIFY BOTH remote state (workflow xanh, matrix=PUBLISHED cả 2, không lock/txn)
→ FETCH FRESH MAIN
→ NEXT 2
→ REPEAT (không dừng sau mỗi cặp 2 bài)
```

Canonical chunk = 2 articles.

## Không được dừng vì

- một cặp 2 bài vừa publish (đó là checkpoint, KHÔNG phải điểm kết thúc);
- một workflow vừa GREEN; một Pages deploy vừa xong;
- tests vừa xanh; progress report vừa được sinh.

## Chỉ được dừng khi

1. toàn bộ corpus terminal hợp lệ (PUBLISHED theo ma trận, hoặc FAIL/BLOCKED chờ người);
2. blocker thật cần con người (txn mơ hồ sau resume, validation critical);
3. owner yêu cầu dừng;
4. runtime/session/network/tool limit buộc dừng — dừng tại điểm an toàn: workflow đã xong, fresh main đã fetch, không lock, không txn.

Nếu runtime chết giữa chừng: remote GitHub state (matrix + manifest + bodies đã push) chính là checkpoint; run sau fetch fresh main và resume từ đó (workflow tự resume đúng các id trong txn marker).

## Writer push — refuse rules (workflow REFUSE, writer phải sửa rồi push lại)

- Push chứa **hơn 50 article body** → REFUSE (workflow ceiling; canonical = 2).
- Body có slug **không tồn tại trong ma trận** → REFUSE. Slug trùng nhau trong push → REFUSE.
- Body **không có** manifest draft entry khớp (id/slug/body path) → REFUSE.
- **Duplicate article_id** trong manifest → REFUSE.
- Push `docs/state/**` (lock/txn/checkpoint) → REFUSE.
- `published.json` đổi mà không có body mới → REFUSE.
- Bài **FAIL/BLOCKED** → REFUSE (cần người xem xét).
- Bài **PUBLISHED** bị sửa body → workflow SKIP, không bao giờ tự rewrite.

Không còn rule "còn draft bài khác chưa xong → REFUSE": unfinished rows (QA/REVIEW/REPAIR/PASS) được factory ưu tiên xử lý trong cùng run với push mới (resume-first), thay vì chặn writer.

## Recovery (workflow + writer)

Trước mỗi run, workflow theo thứ tự:

1. txn marker còn → `resume` đúng TOÀN BỘ các id trong marker TRƯỚC (rebuild + verify từng id + clear marker);
2. lock stale → dọn (runs đã serialize bằng concurrency group);
3. dòng đang QA/REVIEW/REPAIR/PASS + draft tồn tại → qa/publish đúng các bài đó TRƯỚC khi nhận bài PLANNED mới;
4. backlog: dòng PLANNED có sẵn body + draft (workflow cũ chết) → tự claim + xử lý, không cần push lại;
5. chỉ khi không còn gì dở mới nhận bài PLANNED mới từ push.

Writer phía mình: fetch fresh main, đọc matrix + manifest, không push từ stale HEAD, không force push.

## Length rule (chính thức, đồng bộ `docs/ARTICLE-RULES.md` + `tools/article-qa.mjs`)

- **1.500–4.000 từ tiếng Việt hữu ích.** <1.500 → FAIL/REVIEW. >4.000 → REVIEW để writer rút gọn có nghĩa, tool không tự truncate.
- Không padding để đạt sàn; không cắt tại 2.000 từ; không truncate giữa câu/đoạn. Độ dài theo search intent.

## Scoped QA (hard gates, `tools/article-qa.mjs`)

ID/slug/output_path nhất quán · body tồn tại · 1.500–4.000 từ · title/meta/canonical · Article/Breadcrumb schema · không filler/trùng/spin · không trùng primary intent · internal links hợp lệ · business facts chỉ từ dữ liệu đã xác minh · SEO ownership · SAFE legal gate + nguồn chính gov.vn/vbpl.vn · không doorway page.

Mỗi bài có kết quả QA độc lập (qa-chunk): một bài FAIL không làm hỏng bài PASS trong cùng chunk; chỉ các id PASS được publish, các id REVIEW/REPAIR ở lại chờ sửa. Threshold không bao giờ bị hạ.

Production loop KHÔNG chạy whole-site SEO audit hay full chatbot regression sau mỗi chunk — những gate đó nằm trong `ci.yml` cho engine/tool/workflow changes.

## CI theo loại push

- Article-only push (bodies + manifest): chỉ `blog-factory-publish.yml` + scoped QA. `ci.yml` / `distribution.yml` bỏ qua qua `paths-ignore`.
- Engine/tool/workflow/test/PWA/chatbot changes: full `node --test` + distribution vẫn chạy đầy đủ.
- Derived commit của factory (`[skip ci]`, không chạm trigger paths) không recursive trigger.

## Verify (định nghĩa)

VERIFY của mỗi chunk = workflow GREEN cho đúng SHA vừa push + matrix cả 2 dòng PUBLISHED + không lock + không txn + (tuỳ chọn) URL live. Không mở rộng scope sau mỗi cặp 2 bài.
