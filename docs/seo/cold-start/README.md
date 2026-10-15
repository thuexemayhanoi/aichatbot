# SEO cold-start — chế độ ZERO-DATA

> Chưa có dữ liệu Search Console/GA4/thứ hạng thật trong `data/seo/performance/`, nên mọi quyết định dựa trên SERP thật, nhu cầu từ khóa đo bởi công cụ bên thứ ba và dữ liệu sẵn có của repo. Không có số liệu ước đoán. Khi có tệp xuất Search Console, chạy lại công cụ — chế độ tự chuyển sang DATA-DRIVEN (xem [data-driven.md](data-driven.md)).

## Dữ liệu đầu vào

- SERP: 72 truy vấn tiếng Việt, Google Việt Nam — `data/seo/serp-snapshots/` (2026-10-14.json: 72 truy vấn).
- Nhu cầu từ khóa: 723 từ khóa có volume (`data/seo/keyword-demand.json`, `data/seo/keyword-clusters.json`).
- Kho bài: 2006 bài đã đăng (title/từ khóa SEO, H2/H3), 20 cụm K01–K20.
- Tín hiệu sớm sẵn có: `docs/INDEX-MONITORING-20261013.md` ghi một ảnh chụp Search Console rời rạc (9–10/10/2026: 130 lượt hiển thị, 3 lượt nhấp; trang Hồ Tây và Hoàn Kiếm có hiển thị). Repo không có tệp xuất nên số này chỉ là bối cảnh, không kích hoạt DATA-DRIVEN.

## Phát hiện chính

1. **AI Overview ở 60/72 SERP** — câu trả lời trực tiếp, FAQ và nguồn chính thức trong bài là điều kiện để được trích dẫn (GEO).
2. **Local pack ở 18/72 SERP**, đều là truy vấn giao dịch theo khu vực — Google ưu tiên bản đồ, nhóm Facebook và trang dịch vụ; bài blog khó vào top cho các truy vấn này.
3. **Website này đã xuất hiện ở 4/72 SERP** (top 10: 1). Cụm ứng dụng (K01): "app thuê xe máy" #7, #9; "app thuê xe máy điện" —; "app thuê xe máy hà nội" —; "đặt thuê xe máy online" —; "ứng dụng thuê xe máy" —.
4. **2 URL dạng /index.html** của website đang hiển thị trên SERP (trùng URL chuẩn) — trang HTML còn link nội bộ dạng này: 0.
5. **Phạm vi từ khóa**: 183 trong phạm vi; 180 thuộc thành phố khác; 368 ý định khác; 8 do site chị em sở hữu; 8 ý định "gần tôi"; 26 dịch vụ chưa xác minh.
6. **Độ phủ nội dung**: 113 đã có bài, 9 có mục, 28 phủ một phần, 33 chưa có (chi tiết: [content-gap.md](content-gap.md)).

## Lộ trình (ưu tiên)

| Ưu tiên | Hạng mục | Bằng chứng | Hành động | Trạng thái |
|---|---|---|---|---|
| P0 | URL trùng /index.html | 2 URL trên SERP | Chuẩn hóa link nội bộ về dạng thư mục khi build; canonical tự trỏ đã có | Đã xử lý |
| P0 | Khám phá URL không cần Search Console | sitemap trong robots.txt: có | IndexNow (Bing, Yandex, Seznam, Naver…) cho URL mới/cập nhật | Đã triển khai |
| P0 | Chuyển sang DATA-DRIVEN | chưa có dữ liệu thật | Owner xác minh Google Search Console + Bing Webmaster Tools cho đúng subdomain, xuất "Queries"/"Pages" vào `data/seo/performance/` | Chờ owner |
| P1 | Nội dung: "bao nhiêu tuổi được đi xe máy điện" | 1.600/tháng, chưa có | Kiểm tra bài gần nhất; nếu chưa trả lời đúng câu hỏi, bổ sung mục/FAQ (review body) hoặc đề xuất bài mới (gần nhất: /blog/thue-xe/dieu-kien-thue-xe-may-o-ha-noi/) | Đề xuất |
| P1 | Nội dung: "xe máy điện bao nhiêu tuổi được đi" | 1.000/tháng, chưa có | Kiểm tra bài gần nhất; nếu chưa trả lời đúng câu hỏi, bổ sung mục/FAQ (review body) hoặc đề xuất bài mới (gần nhất: /blog/thue-xe/dieu-kien-thue-xe-may-o-ha-noi/) | Đề xuất |
| P1 | Nội dung: "bao nhiêu tuổi thì được đi xe máy điện" | 480/tháng, chưa có | Kiểm tra bài gần nhất; nếu chưa trả lời đúng câu hỏi, bổ sung mục/FAQ (review body) hoặc đề xuất bài mới (gần nhất: /blog/thue-xe/dieu-kien-thue-xe-may-o-ha-noi/) | Đề xuất |
| P1 | Nội dung: "lỗi sử dụng điện thoại khi đi xe máy" | 480/tháng, phủ một phần | Bổ sung mục/FAQ trả lời đúng câu hỏi vào bài gần nhất (review body) hoặc đề xuất bài mới (gần nhất: /blog/an-toan/dien-thoai-khi-lai-xe-tom-tat/) | Đề xuất |
| P1 | Nội dung: "thuê xe máy hà đông" | 110/tháng, chưa có | Đề xuất bài mới — cần owner thêm ID vào ma trận (writer viết, factory đăng) (gần nhất: /blog/thue-xe/bang-lai-a1-va-thue-xe-may/) | Đề xuất |
| P1 | Nội dung: "phượt tam đảo bằng xe máy" | 70/tháng, phủ một phần | Bổ sung mục/FAQ trả lời đúng câu hỏi vào bài gần nhất (review body) hoặc đề xuất bài mới (gần nhất: /blog/dia-phuong/tam-dao-bang-xe-may/) | Đề xuất |
| P1 | Nội dung: "du lịch gần hà nội 1 ngày bằng xe máy" | 50/tháng, phủ một phần | Bổ sung mục/FAQ trả lời đúng câu hỏi vào bài gần nhất (review body) hoặc đề xuất bài mới (gần nhất: /blog/dia-phuong/du-lich-hoan-kiem-bang-xe-may-trong-ngay/) | Đề xuất |
| P1 | Nội dung: "phượt hà giang bằng xe máy" | 50/tháng, phủ một phần | Bổ sung mục/FAQ trả lời đúng câu hỏi vào bài gần nhất (review body) hoặc đề xuất bài mới (gần nhất: /blog/dia-phuong/ha-giang-vong-cung/) | Đề xuất |
| P2 | Khớp cụm từ: "không bằng lái xe máy phạt bao nhiêu" | 6.600/tháng | Bài /blog/thue-xe/thue-xe-khong-bang-lai-duoc-khong-cuoi-tuan/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "lỗi không bằng lái xe máy" | 2.900/tháng | Bài /blog/thue-xe/thue-xe-khong-bang-lai-duoc-khong-cuoi-tuan/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "không có bằng lái xe máy phạt bao nhiêu tiền" | 1.000/tháng | Bài /blog/an-toan/di-xe-khong-giay-phep/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "bằng lái xe máy là hạng gì" | 880/tháng | Bài /blog/an-toan/cac-loai-bang-lai-xe-may/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "không bằng lái xe máy phạt bao nhiêu 2025" | 880/tháng | Bài /blog/thue-xe/thue-xe-khong-bang-lai-duoc-khong-cuoi-tuan/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "lỗi không có bằng lái xe máy" | 880/tháng | Bài /blog/an-toan/di-xe-khong-giay-phep/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "bằng lái xe máy 2025" | 720/tháng | Bài /blog/thue-xe/bang-lai-a1-va-thue-xe-may/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P2 | Khớp cụm từ: "mức phạt không bằng lái xe máy" | 720/tháng | Bài /blog/thue-xe/thue-xe-khong-bang-lai-duoc-khong-cuoi-tuan/ đã phủ; cân nhắc đưa cụm từ chính xác vào title/meta | Đề xuất |
| P1 | Chủ đề mới: Vùng phát thải thấp trong Vành đai 1 (Hà Nội) và người thuê xe máy xăng | SERP "cấm xe máy xăng vành đai 1"; 1.000/tháng đo được | Bài mới sau khi đối chiếu văn bản gốc (cần owner thêm ID vào ma trận) | Đề xuất |
| P1 | Chủ đề mới: Xe máy điện: có cần bằng lái không và bao nhiêu tuổi được đi | SERP "xe máy điện có cần bằng lái không"; 6.350/tháng đo được | Bài mới sau khi đối chiếu văn bản gốc (cần owner thêm ID vào ma trận) | Đề xuất |
| P1 | Chủ đề mới: Các loại bằng lái xe máy theo Luật 36/2024/QH15: hạng A1, A, B1 và bằng A1, A2 cấp trước 2025 | SERP "các loại bằng lái xe máy"; 2.270/tháng đo được | Bài mới sau khi đối chiếu văn bản gốc (cần owner thêm ID vào ma trận) | Đề xuất |
| P2 | Truy vấn địa phương/gần tôi | local pack trên mọi truy vấn quận/khu vực | Google Business Profile, NAP khớp `data/business/business.json`, ảnh thật; trang /lien-he/ có LocalBusiness schema | Chờ owner |
| P2 | Trích dẫn (off-page) | diễn đàn, cẩm nang du lịch, báo chí chiếm truy vấn kinh nghiệm | Chỉ trích dẫn/biên tập tự nhiên; không mua link, không spam nhóm Facebook | Liên tục |
| P3 | Làm mới SERP | mốc 2026-10-14 | Chụp lại cùng bộ truy vấn sau 45 ngày, so với visibility-baseline | Định kỳ |

## Tệp chi tiết

- [competitor-map.md](competitor-map.md) — đối thủ theo tên miền và loại trang
- [serp-intent.md](serp-intent.md) — ý định, tính năng SERP, trang đích gợi ý từng truy vấn
- [topical-map.md](topical-map.md) — cụm chủ đề, số bài, nhu cầu đo được
- [content-gap.md](content-gap.md) — độ phủ từng từ khóa và đề xuất
- [visibility-baseline.md](visibility-baseline.md) — vị trí quan sát được của website
- [cold-start.json](cold-start.json) — dữ liệu máy đọc

## Quy tắc

- Không bịa số liệu: volume chỉ lấy từ công cụ (ghi nguồn, ngày); vị trí chỉ lấy từ SERP đã chụp; "—" nghĩa là chưa đo.
- Không nhắm từ khóa thương mại của site chị em (`config/seo-ownership.json`), không tạo doorway theo thành phố khác.
- Bài mới chỉ qua ma trận + writer + factory (AGENTS.md); sửa bài đã đăng chỉ qua `tools/seo-body-review.mjs`; title/meta qua `data/seo/article-meta.json`.
