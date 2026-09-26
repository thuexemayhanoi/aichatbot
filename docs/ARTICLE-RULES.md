# ARTICLE-RULES — chuẩn bài viết blog

Áp dụng cho mọi bài blog sản xuất của `/aichatbot/`.

## Kích thước & cấu trúc

- 1.600–2.000 từ tiếng Việt hữu ích (trừ khi rubric của bài quyết định khác).
- Đúng 1 H1 (được sinh tự động từ tiêu đề bài).
- Tiêu đề duy nhất, meta description duy nhất, self-canonical.
- Schema: `Article` + `BreadcrumbList`; author + date; link về hub danh mục; internal links theo ngữ cảnh.
- Body viết ở `data/blog/articles/<slug>.body.html` (chỉ thẻ h2/p/ul/li) — layout, head, schema do `tools/build-blog.mjs` sinh.

## Nội dung

- Không filler, không đoạn lặp, không spun content, không bịa số liệu.
- Không bịa thông số kỹ thuật xe (pin, tốc độ, phạm vi…). Nếu không chắc: viết hướng dẫn kiểm tra/cách hỏi, không viết con số.
- Scope dịch vụ: không tuyên bố cho thuê toàn quốc. Thông tin cửa hàng chỉ từ `data/business/business.json` qua placeholder `{{ business.* }}`.
- Bài LOCAL: góc độ riêng từng hành trình/chủ đề; cấm “app thuê xe máy quận X” nhân bản hàng loạt.

## Legal gate (bài SAFE bắt buộc)

Một nhận định pháp lý chỉ được publish khi khai báo đủ:

```
CLAIM → SUBJECT (đối tượng/loại xe/người) → CONDITION → RULE/VALUE
      → EFFECTIVE VERSION (hiệu lực) → PRIMARY SOURCE (văn bản gốc)
```

Tên miền chính phủ (gov.vn) KHÔNG tự động làm claim đúng. Lỗi thực tế pháp lý là QA failure nghiêm trọng. Bài SAFE luôn có `source_policy=legal-gate`, `agent_retrieval=no` (prose pháp lý không vào Agent retrieval).

## Từ khóa & liên kết

- Mỗi bài đúng 1 primary_keyword (duy nhất trong ma trận) + secondary keywords tự nhiên.
- Internal links phục vụ cả SEO và điều hướng tri thức Agent: hub danh mục, bài liên quan, trang Agent, trang thương mại đã xác minh (giới hạn, tránh spam thương mại).
- Vòng: Homepage → Blog → bài → “Hỏi Agent về chủ đề này”; Agent gợi ý bài liên quan khi có chunk khớp. Không loop link vòng tròn spammy.
