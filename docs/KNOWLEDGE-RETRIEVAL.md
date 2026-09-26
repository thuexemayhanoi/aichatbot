# Knowledge Retrieval — blog tri thức cho Agent

## Vị trí trong pipeline (thứ tự cố định, không đổi)

```
Business rules          (src/rules — luôn thắng)
→ Business data         (BM25/hybrid trên business.json + pricing.json + faq.json)
→ Blog knowledge        (src/search/blog-knowledge.js — TÙY CHỌN, tier thấp nhất)
→ Recommendation/Calculator
→ Local Agent phrasing  (opt-in, fact-guard)
→ Fact Guard           (src/ai/fact-guard.js)
→ Honest fallback
```

## Nguyên tắc bất di bất dịch

1. Blog KHÔNG BAO GIỜ override dữ liệu xác minh: giá, địa chỉ, điện thoại, giờ mở cửa, tiền cọc, chính sách. `business.json` luôn hơn blog prose.
2. Tier blog chỉ chạy khi engine đã trả về honest fallback — nghĩa là rules và business-data retrieval đều khước từ.
3. Blog retriever khước từ mọi intent thuộc về dữ liệu kinh doanh (price, deposit, hours, location, contact, delivery, return, documents, policy, recommendation, duration) — kể cả khi chunk khớp (PROTECTED_INTENTS trong `src/search/blog-knowledge.js`).
4. Bài SAFE (legal) không bao giờ vào knowledge index (`agent_retrieval=no`).

## Chỉ mục

- `data/blog/knowledge-index.json` — chỉ chunks compact (mỗi chunk < 800 ký tự) từ bài PUBLISHED, sinh bởi `tools/build-blog.mjs`. Không nạp 2.000 tài liệu đầy đủ vào bộ nhớ trình duyệt.
- UI nạp LAZY: `assets/js/main.js` fetch knowledge-index SAU lượt chat đầu tiên (direct mode; embed không nạp), gắn qua `app.attachBlogIndex(chunks)`. Fail = im lặng, Agent vẫn đầy đủ tính năng cơ bản.
- Điểm BM25 dưới `minScore` → khước từ (null), không bao giờ trả lời đoán; score malformed (NaN/Infinity) bị chặn.

## Hướng dẫn viết chunk

Mỗi bài đăng manifest khai báo `knowledge_chunks`: 2–5 câu tự thân (self-contained), không chứa số liệu kinh doanh (số liệu đó thuộc business.json và sẽ được rules trả lời trước blog anyway). Chunk tốt = tri thức tổng quát (cách làm, khái niệm, kinh nghiệm) giúp Agent trả lời informational queries.
