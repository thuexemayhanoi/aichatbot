# Continuous Writer Contract — vòng lặp bắt buộc của external writer

Tài liệu này là nguồn chuẩn duy nhất cho cách một writer run (agent AI bên ngoài) PHẢI hoạt động liên tục với `/aichatbot/`. `docs/BLOG-FACTORY.md`, `README.md` và workflow tham chiếu tài liệu này.

## Phân vai (quan trọng)

- **External AI writer** thực hiện vòng lặp viết liên tục: chọn bài, research, viết prose, push.
- **GitHub Actions** (`blog-factory-publish.yml`) thực hiện phần deterministic: detect đúng bài, auto-claim, scoped QA, publish transaction, rebuild, verify, unlock, commit derived state.
- **Actions KHÔNG BAO GIỜ tự viết prose, không gọi AI, không schedule writer.** Continuous production chỉ chạy khi owner yêu cầu rõ ràng; factory đã continuous-ready.

## Mô hình canonical — 1 ARTICLE / CYCLE (micro loop)

- Đơn vị làm việc = ĐÚNG MỘT bài mỗi cycle. Push = đúng 1 article source (body mới tại `data/blog/articles/<slug>.body.html`) + đúng 1 manifest draft entry (`data/blog/published.json`).
- **Writer KHÔNG còn lock → claim → finish → push matrix bằng tay.** Ma trận không nằm trong writer push. Workflow tự claim đúng dòng (PLANNED → WRITING → QA), tự QA, tự publish.
- Push sớm từng bài = safe checkpoint trên main: mất workspace/session không mất tiến độ. Không giữ nhiều bài chưa push trong workspace.
- Ma trận (2.000 dòng) vẫn là source of truth; checkpoint/lock/txn là derived operational state, không bao giờ được push.

## LOOP (bắt buộc mỗi writer run)

```
FETCH FRESH MAIN
→ RECOVER (txn marker / lock / last remote commit — remote state luôn thắng)
→ RESUME (bài đang QA/REVIEW/REPAIR/PASS dở: hoàn tất đúng bài đó TRƯỚC)
→ SELECT exactly 1 next actionable article (PLANNED kế tiếp theo thứ tự ma trận)
→ RESEARCH (nguồn xác minh; bài SAFE cần nguồn gov.vn/vbpl.vn)
→ WRITE 1 (body + manifest draft entry; 1.500–4.000 từ hữu ích)
→ LOCAL SCOPED QA (node tools/article-qa.mjs <BA-id> — PASS mới push)
→ PUSH (body + published.json; KHÔNG push matrix, lock, txn, checkpoint)
→ WAIT factory GREEN (blog-factory-publish.yml xanh cho đúng SHA)
→ VERIFY remote state (workflow xanh, matrix=PUBLISHED, không lock/txn)
→ FETCH FRESH MAIN
→ NEXT 1
→ REPEAT
```

## Không được dừng vì

- một bài vừa publish (đó là checkpoint, KHÔNG phải điểm kết thúc);
- một workflow vừa GREEN; một Pages deploy vừa xong;
- tests vừa xanh; progress report vừa được sinh.

## Chỉ được dừng khi

1. toàn bộ corpus terminal hợp lệ (PUBLISHED theo ma trận, hoặc FAIL/BLOCKED chờ người);
2. blocker thật cần con người (txn mơ hồ sau resume, validation critical);
3. owner yêu cầu dừng;
4. runtime/session/network/tool limit buộc dừng — dừng tại điểm an toàn: workflow đã xong, fresh main đã fetch, không lock, không txn.

Nếu runtime chết giữa chừng: remote GitHub state (matrix + manifest + body đã push) chính là checkpoint; run sau fetch fresh main và resume từ đó.

## Writer push — refuse rules (workflow REFUSE, writer phải sửa rồi push lại)

- Push chứa **2+ article body** → REFUSE (1 bài / cycle).
- Body có slug **không tồn tại trong ma trận** → REFUSE.
- Body **không có** manifest draft entry khớp (id/slug/body path) → REFUSE.
- **Duplicate article_id** trong manifest → REFUSE.
- Còn **draft bài khác chưa xong** (entry trong manifest nhưng dòng ma trận chưa PUBLISHED) → REFUSE — resume bài dở trước, không nhảy sang bài mới.
- Push `docs/state/**` (lock/txn/checkpoint) → REFUSE.
- `published.json` đổi mà không có body mới → REFUSE.
- Bài **PUBLISHED** bị sửa body → workflow SKIP, không bao giờ tự rewrite.

## Recovery (workflow + writer)

Trước mỗi cycle, workflow theo thứ tự:

1. txn marker còn → `resume` đúng bài trong marker TRƯỚC (rebuild + verify + clear marker);
2. lock stale → dọn (runs đã serialize bằng concurrency group);
3. dòng đang QA/REVIEW/REPAIR/PASS + draft tồn tại → chuẩn bị/QA/publish đúng bài đó;
4. chỉ khi không còn gì dở mới nhận bài PLANNED mới.

Writer phía mình: fetch fresh main, đọc matrix + manifest, không push từ stale HEAD, không force push.

## Length rule (chính thức, đồng bộ `docs/ARTICLE-RULES.md` + `tools/article-qa.mjs`)

- **1.500–4.000 từ tiếng Việt hữu ích.** <1.500 → FAIL/REVIEW. >4.000 → REVIEW để writer rút gọn có nghĩa, tool không tự truncate.
- Không padding để đạt sàn; không cắt tại 2.000 từ; không truncate giữa câu/đoạn. Độ dài theo search intent.

## Scoped QA (hard gates, `tools/article-qa.mjs`)

ID/slug/output_path nhất quán · body tồn tại · 1.500–4.000 từ · title/meta/canonical · Article/Breadcrumb schema · không filler/trùng/spin · không trùng primary intent · internal links hợp lệ · business facts chỉ từ dữ liệu đã xác minh · SEO ownership · SAFE legal gate + nguồn chính gov.vn/vbpl.vn · không doorway page.

Production loop KHÔNG chạy whole-site SEO audit hay full chatbot regression sau mỗi bài — những gate đó nằm trong `ci.yml` cho engine/tool/workflow changes.

## CI theo loại push

- Article-only push (body + manifest): chỉ `blog-factory-publish.yml` + scoped QA. `ci.yml` / `distribution.yml` bỏ qua qua `paths-ignore`.
- Engine/tool/workflow/test/PWA/chatbot changes: full `node --test` + distribution vẫn chạy đầy đủ.
- Derived commit của factory (`[skip ci]`, không chạm trigger paths) không recursive trigger.

## Verify (định nghĩa)

VERIFY của mỗi cycle = workflow GREEN cho đúng SHA vừa push + matrix dòng đó PUBLISHED + không lock + không txn + (tuỳ chọn) URL live. Không mở rộng scope sau mỗi bài.
