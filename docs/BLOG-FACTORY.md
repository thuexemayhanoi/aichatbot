# Blog Factory — nhà máy nội dung có thể phục hồi

Công cụ: `tools/blog-factory.mjs`. Nguyên tắc an toàn giống các hệ thống sản xuất trưởng thành: state machine, transaction, checkpoint, KHÔNG phụ thuộc bộ nhớ chat/session.

## State machine mỗi bài (cột `status` trong `data/blog/content-matrix.csv`)

```
PLANNED → WRITING → QA → PASS → PUBLISHED
                ↘ REVIEW → REPAIR (tối đa 3 lần sửa có nghĩa) → PASS
                ↘ FAIL / BLOCKED
```

Chỉ bài `PASS` mới được publish. Bài FAIL/BLOCKED phải được người phụ trách xem xét lại; không tự động retry vượt 3 lần.

## Lệnh

```bash
node tools/blog-factory.mjs status
node tools/blog-factory.mjs validate       # QA ma trận: số dòng, lô, phân bố, trùng lặp, legal gate
node tools/blog-factory.mjs lock           # run lock (docs/state/blog-factory.lock)
node tools/blog-factory.mjs unlock
node tools/blog-factory.mjs publish BA-0001 # transaction cho 1 bài
node tools/blog-factory.mjs resume         # phục hồi transaction đứt quãng
```

## Publish transaction

Publish có thể cập nhật: article HTML, matrix, hub, blog index, search index, knowledge index, sitemap, reports. Ngữ nghĩa phục hồi:

```
marker (docs/state/blog-factory.transaction.json)
→ write (build-blog.mjs: manifest là nguồn sự thật)
→ verify consistency (file tồn tại + matrix=PUBLISHED + sitemap chứa URL)
→ clear marker (chỉ sau khi verify xanh)
```

Nếu bất kỳ bước nào fail: marker GIỮ NGUYÊN, lệnh `resume` dựng lại từ manifest và chỉ xóa marker khi verify pass.

## QA trước publish (bắt buộc)

1. Đúng 1 H1, tiêu đề + meta description duy nhất, self-canonical.
2. Article schema + BreadcrumbList, author/date, link hub danh mục.
3. 1.600–2.000 từ tiếng Việt hữu ích (trừ khi rubric quyết định khác).
4. Không filler, không đoạn trùng, không spun content.
5. Bài SAFE: legal gate (xem `docs/ARTICLE-RULES.md` §Legal).
6. Duplicate-intent check: không 2 bài cùng primary intent.
7. Fact check: `{{ business.* }}` resolve đúng từ `business.json`; không bịa thông số xe.

## Scheduled run procedure (cho các run tương lai)

```
FETCH → README → docs/BLOG.md → docs/BLOG-FACTORY.md
     → data/blog/content-matrix.csv + reports/blog-factory-run.md
     → lock → chọn lô PLANNED (batch_id nhỏ nhất trước)
     → WRITE batch (50 bài, qua QA từng bài)
     → publish từng bài qua transaction
     → unlock → báo cáo vào reports/
```

KHÔNG tự động viết hàng loạt trong các run chát thông thường. Mass writing chỉ chạy khi được chủ repo yêu cầu rõ ràng, qua scheduled command được ghi trong README.
