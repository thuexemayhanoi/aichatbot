# SEO Ownership — `thuexemayhanoi/aichatbot`

**Owner decision updated: 29/10/2026.** Máy đọc: `config/seo-ownership.json` (v2). Chiến dịch: `docs/seo/commercial/README.md` và `docs/seo/commercial/CLAUDE-SEO-AGENT.md`.

## 1. Mục tiêu thương mại mới

Chủ website đã cho phép **MotoAI cạnh tranh toàn bộ nhóm từ khóa thương mại về cho thuê xe máy Hà Nội**, không còn nhường độc quyền cho các domain khác (kể cả website cùng chủ sở hữu). Mục tiêu tham vọng: Google vị trí 2–10 cho từ khóa chính **“cho thuê xe máy ở Hà Nội”** và nhóm phù hợp. Đây là KPI, không phải thứ hạng được đảm bảo.

- `/`: intent chính **cho thuê xe máy ở Hà Nội** và biến thể cùng ý định “cho thuê xe máy Hà Nội”, “thuê xe máy Hà Nội”; chỉ chỉnh homepage sau khi duyệt nội dung thực sự phục vụ nhu cầu thương mại và test an toàn.
- `/gia-thue/`: giá thuê, bảng giá ngày/tuần/tháng, cọc tách riêng.
- `/lien-he/`: thông tin liên hệ, địa chỉ và giờ làm việc được xác minh.
- `/agent/`: **APP / WEB APPLICATION / DIGITAL RENTAL ASSISTANT (app thuê xe máy, ứng dụng web MotoAI)**, vẫn là công cụ thông tin (không giả làm App Store/Google Play hoặc hệ thống đặt xe tự động).
- Các category hub và bài riêng: tháng, Vision, 50cc, xe điện, Long Biên, Hoàn Kiếm, Phố Cổ, Tây Hồ, Ba Đình, thủ tục, luật, du lịch... mỗi URL chủ lực một search intent duy nhất.

`data/blog/content-matrix.csv` và `data/blog/published.json` là nguồn sự thật 2.006 URL; kết quả SEO lập kế hoạch từ `tools/seo-commercial-matrix.mjs`. **Không nhồi exact head keyword vào 2.006 H1/title.**

## 2. Phạm vi quốc gia và địa phương

Được xuất bản nội dung hữu ích trên toàn quốc nhưng KHÔNG khẳng định có đội xe hoặc chi nhánh phục vụ toàn quốc. Không tự tạo dịch vụ, khẳng định còn xe, giá, hỗ trợ kỹ thuật, giấy phép hay giờ mở cửa ngoài `data/business/business.json` và `data/business/pricing.json`. Mỗi trang địa phương cần nội dung thực sự riêng, không tạo doorway pages hàng loạt.

## 3. Anti-cannibalization trong MotoAI

Loại bỏ `protected_commercial_intents` cũ chỉ ngăn cạnh tranh với website chị em. Thay bằng quy tắc **một intent có một URL owner trong chính repo này**, dựa trên nội dung thực và SERP. Trang chủ không tranh từ khóa giá thuê của `/gia-thue/`; Agent không tự nhận là doanh nghiệp cho thuê độc lập. Các domain cùng chủ đều có thể cạnh tranh nếu trang của mỗi domain thực sự hữu ích/khác biệt, không sao chép nội dung.

Kiểm thử: `tests/unit/seo-ownership.test.js`, `tests/unit/blog-foundation.test.js`, `tests/unit/article-qa.test.js` theo chính sách mới. Bài đã PUBLISHED được bảo vệ: không tự ghi đè body, slug, canonical, sitemap, URL.

## 4. KPI và nguồn

Top 2–10 **chỉ là mục tiêu**. Không có GSC/GA4 thì ghi `NOT_MEASURED`, không bịa traffic/rank/CTR/volume. Theo dõi trên Google Search Console khi có dữ liệu, tối ưu theo từng lô 30 URL có checkpoint và QA.

Tham khảo: https://developers.google.com/search/docs/essentials/spam-policies
