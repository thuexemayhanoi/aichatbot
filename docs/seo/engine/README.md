# SEO Engine 06 — chế độ ZERO-DATA

> Không có Search Console/GA4/thứ hạng thật: engine chạy trên SERP Google đã chụp, volume do công cụ bên thứ ba đo và dữ liệu của repo. Không số liệu ước đoán. Có tệp xuất Search Console trong `data/seo/performance/` → engine tự sang DATA-DRIVEN (qua `tools/seo-cold-start.mjs`).

## Quy trình (tái dùng 5 công cụ, engine chỉ bổ sung phần còn thiếu)

| Bước | Công cụ | Kết quả |
|---|---|---|
| 1. Audit repo | site-audit, seo-score, seo-master-audit, seo-index-coverage, IndexNow | liên kết hỏng 0; SEO score 99,7; P0 0; sitemap↔ma trận Đạt; IndexNow có khóa |
| 2. SEO Matrix | seo-master-audit (URL) + engine (từ khóa) | 2.137 URL; 117 nhóm từ khóa → [seo-engine-matrix.csv](seo-engine-matrix.csv) |
| 3. Nghiên cứu SERP | seo-cold-start (snapshot) | 72 SERP (2026-10-14); hàng đợi: 0 nhóm cần chụp SERP, 0 nhóm cần đo volume (21 nhóm đã hỏi, công cụ không trả số) → [research-queue.md](research-queue.md) |
| 4. Keyword clustering | engine | 183 từ khóa → 117 nhóm (14 cặp trùng SERP) → [keyword-groups.md](keyword-groups.md) |
| 5. Topical map | engine + seo-master-audit | 20 cụm K01–K20 → [topical-map.md](topical-map.md) |
| 6. Content gap | seo-cold-start + engine | 0 nhóm cần bài mới, 4 bổ sung mục, 1 chỉnh title/meta, 2 nhóm chờ sửa nội dung lỗi thời, 3 chủ đề cần đối chiếu (0 nhóm) → [content-briefs.md](content-briefs.md), [proposed-matrix-rows.csv](proposed-matrix-rows.csv) |

## Sức khỏe repo (công cụ hiện có)

| Kiểm tra | Kết quả |
|---|---|
| Liên kết nội bộ (site-audit) | 226.614 liên kết kiểm tra, 0 hỏng — Đạt |
| SEO score (seo-score) | 99,7/100 — Đạt |
| Ma trận URL (seo-master-audit) | 2.137 URL; DONE 2.137, KEEP 0, TECH-DONE 0, PLANNED 0; P0 0; tệp đã commit khớp |
| Sitemap ↔ ma trận (seo-index-coverage) | Đạt (2.006 bài đăng) |
| Báo cáo cold-start | khớp dữ liệu |
| IndexNow | khóa công khai có trên site |

## Rà soát nội dung trước khi đẩy từ khóa (config/seo-cold-start.json → content_flags)

| Bài | Vấn đề | Trạng thái | Nhóm từ khóa trỏ tới | Volume/tháng |
|---|---|---|---:|---:|
| BA-0122 /blog/thue-xe/bang-lai-a1-va-thue-xe-may/ | Mô tả bằng A1 là xe từ 50 đến dưới 175 cm³ và A2 cho xe từ 175 cm³ như quy định hiện hành; từ 01/01/2025 hạng A1 cấp mới chỉ đến 125 cm³ hoặc 11 kW, xe lớn hơn cần hạng A, phạm vi dưới 175 cm³ chỉ còn cho bằng A1 cấp trước (Luật 36/2024/QH15 Điều 57, 89) | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 57, 88, 89)) | 4 | 9.250 |
| BA-0317 /blog/an-toan/bang-lai-a1-a2-khac-gi-cho-du-khach/ | Ghi bằng A2 cho xe 175–300 cc hoặc từ 150 phân, A1 dưới 150 phân, dẫn một thông tư không tồn tại và mức phạt 1–3 triệu, 10–30 triệu không có căn cứ | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 56, 57, 59, 88, 89); mức phạt dẫn sang bài đi xe không giấy phép) | 0 | 0 |
| BA-0035 /blog/an-toan/bang-lai-a1-a2-khac-gi/ | Nói Thông tư 46/2015/TT-BGTVT đã gộp A2 vào hạng A; thực tế hạng A thay A2 từ Luật 36/2024/QH15 (hiệu lực 01/01/2025); gọi xe gắn máy là mô tô | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34, 57)) | 1 | 0 |
| BA-0599 /blog/an-toan/bang-lai-a1-a2-khac-gi-cho-nguoi-moi/ | Cùng lỗi lịch sử Thông tư 46/2015/TT-BGTVT gộp A2 vào hạng A; dẫn Điều 59 cho hệ thống hạng (đúng là Điều 57) | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34, 57)) | 0 | 0 |
| BA-0190 /blog/huong-dan/thue-xe-cho-nguoi-duoi-18-tuoi/ | Viết bằng A1 cấp từ đủ 16 tuổi và người 16 tuổi có bằng A1 lái xe dưới 50 phân khối; luật cho người đủ 16 tuổi lái xe gắn máy không cần bằng, hạng A1 chỉ cấp từ đủ 18 tuổi | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34, 56, 59)) | 0 | 0 |
| BA-0496 /blog/huong-dan/thue-xe-cho-nguoi-duoi-18-tuoi-cho-nguoi-moi/ | Cùng lỗi bằng A1 cấp từ đủ 16 tuổi; cho rằng người 17 tuổi chưa có bằng không được lái xe gắn máy | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34, 59)) | 0 | 0 |
| BA-0044 /blog/thue-xe/thue-xe-50cc/ | Xếp xe đúng 50 cm³ vào nhóm mô tô; luật định nghĩa xe gắn máy là xe không lớn hơn 50 cm³ | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34)) | 0 | 0 |
| BA-0764 /blog/thue-xe/thue-xe-50cc-cho-sinh-vien/ | Cùng lỗi ranh giới 50 cm³ (xe đúng 50 cm³ không phải mô tô) | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34)) | 0 | 0 |
| BA-0010 /blog/huong-dan/giay-to-can-khi-thue-xe/ | Gọi xe đạp máy là xe gắn máy (luật xếp xe đạp máy, xe đạp điện vào xe thô sơ) và nêu chính sách cửa hàng cho bằng A1 thuê xe dưới 175 cm³ trái với hạng A1 cấp từ 2025 | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34)) | 0 | 0 |
| BA-0015 /blog/xe-dien/chon-xe-dien-phu-hop/ | Gọi xe đạp điện là xe gắn máy dưới 50 cm³ tương đương; xe gắn máy điện xác định theo công suất không quá 4 kW, xe đạp điện là xe thô sơ | Đã sửa 2026-10-14 (tools/seo-body-review.mjs với dữ kiện đã đối chiếu trong data/seo/legal-facts.json (Điều 34)) | 0 | 0 |
| BA-0041 /blog/an-toan/nguoi-nuoc-ngoai-lai-xe-o-viet-nam/ | Dẫn Thông tư 29/2015/TT-BGTVT như quy định đang áp dụng về sử dụng giấy phép lái xe quốc tế; từ 01/01/2025 nội dung này thuộc Thông tư 35/2024/TT-BGTVT rồi Thông tư 12/2025/TT-BCA (hiệu lực 01/3/2025) theo tiêu đề văn bản và bản tin pháp luật — chưa đối chiếu toàn văn (data/seo/legal-documents.json: tt-29-2015-bgtvt) | Cần sửa trước | 1 | 20 |
| BA-0047 /blog/an-toan/idp-va-bang-lai-quoc-te/ | Dẫn Thông tư 29/2015/TT-BGTVT như quy định đang áp dụng về sử dụng giấy phép lái xe quốc tế; từ 01/01/2025 nội dung này thuộc Thông tư 35/2024/TT-BGTVT rồi Thông tư 12/2025/TT-BCA (hiệu lực 01/3/2025) theo tiêu đề văn bản và bản tin pháp luật — chưa đối chiếu toàn văn (data/seo/legal-documents.json: tt-29-2015-bgtvt) | Cần sửa trước | 0 | 0 |
| BA-0605 /blog/an-toan/nguoi-nuoc-ngoai-lai-xe-o-viet-nam-cho-nguoi-moi/ | Dẫn Thông tư 29/2015/TT-BGTVT như quy định đang áp dụng về sử dụng giấy phép lái xe quốc tế; từ 01/01/2025 nội dung này thuộc Thông tư 35/2024/TT-BGTVT rồi Thông tư 12/2025/TT-BCA (hiệu lực 01/3/2025) theo tiêu đề văn bản và bản tin pháp luật — chưa đối chiếu toàn văn (data/seo/legal-documents.json: tt-29-2015-bgtvt) | Cần sửa trước | 0 | 0 |
| BA-0611 /blog/an-toan/idp-va-bang-lai-quoc-te-cho-nguoi-moi/ | Dẫn Thông tư 29/2015/TT-BGTVT như quy định đang áp dụng về sử dụng giấy phép lái xe quốc tế; từ 01/01/2025 nội dung này thuộc Thông tư 35/2024/TT-BGTVT rồi Thông tư 12/2025/TT-BCA (hiệu lực 01/3/2025) theo tiêu đề văn bản và bản tin pháp luật — chưa đối chiếu toàn văn (data/seo/legal-documents.json: tt-29-2015-bgtvt) | Cần sửa trước | 0 | 0 |
| BA-0227 /blog/an-toan/mua-ban-xe-may-giay-to/ | Dẫn Thông tư 24/2023/TT-BCA như thủ tục đăng ký, sang tên xe đang áp dụng; Thông tư 79/2024/TT-BCA có hiệu lực 01/01/2025 và bãi bỏ Thông tư 24/2023/TT-BCA theo bản tin pháp luật — chưa đối chiếu toàn văn (tt-24-2023-bca) | Cần sửa trước | 0 | 0 |
| BA-0509 /blog/an-toan/mua-ban-xe-may-giay-to-cho-du-khach/ | Dẫn Thông tư 24/2023/TT-BCA như thủ tục đăng ký, sang tên xe đang áp dụng; Thông tư 79/2024/TT-BCA có hiệu lực 01/01/2025 và bãi bỏ Thông tư 24/2023/TT-BCA theo bản tin pháp luật — chưa đối chiếu toàn văn (tt-24-2023-bca) | Cần sửa trước | 1 | 30 |
| BA-0275 /blog/an-toan/bao-ve-du-lieu-ca-nhan-khi-thue-xe/ | Dẫn Nghị định 13/2023/NĐ-CP như khung pháp lý hiện hành về dữ liệu cá nhân; từ 01/01/2026 Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP thay thế (LuatVietnam, EY, PwC) — chưa đối chiếu toàn văn (nd-13-2023) | Cần sửa trước | 0 | 0 |
| BA-0557 /blog/an-toan/bao-ve-du-lieu-ca-nhan-khi-thue-xe-cho-du-khach/ | Dẫn Nghị định 13/2023/NĐ-CP như khung pháp lý hiện hành về dữ liệu cá nhân; từ 01/01/2026 Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP thay thế (LuatVietnam, EY, PwC) — chưa đối chiếu toàn văn (nd-13-2023) | Cần sửa trước | 0 | 0 |
| BA-1121 /blog/an-toan/bao-ve-du-lieu-ca-nhan-khi-thue-xe-tom-tat/ | Dẫn Nghị định 13/2023/NĐ-CP như khung pháp lý hiện hành về dữ liệu cá nhân; từ 01/01/2026 Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP thay thế (LuatVietnam, EY, PwC) — chưa đối chiếu toàn văn (nd-13-2023) | Cần sửa trước | 0 | 0 |
| BA-1373 /blog/an-toan/tranh-app-thue-xe-lua-dao-vi-du-thuc-te/ | Dẫn Nghị định 13/2023/NĐ-CP như khung pháp lý hiện hành về dữ liệu cá nhân; từ 01/01/2026 Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP thay thế (LuatVietnam, EY, PwC) — chưa đối chiếu toàn văn (nd-13-2023) | Cần sửa trước | 0 | 0 |
| BA-0323 /blog/an-toan/nguoi-nuoc-ngoai-lai-xe-o-viet-nam-cho-du-khach/ | Gõ sai ký hiệu "Thông tư 38/2024/TB-BGTVT" (đúng: TT-BGTVT) và gán mức tốc độ tối đa 40 km/h cho mọi xe trên đường phố, trong khi các bài khác của kho bài dẫn Thông tư 38/2024/TT-BGTVT với mức 60/50 km/h cho xe mô tô trong khu đông dân cư theo loại đường (40 km/h là mức của xe gắn máy) — cần đối chiếu toàn văn trước khi sửa (tt-38-2024-bgtvt) | Cần sửa trước | 0 | 0 |

## Hàng đợi hành động (top 25 theo điểm ưu tiên)

> điểm = volume đo được × hệ số cơ hội (sửa nội dung lỗi thời 1; bài mới 1; bổ sung mục 0,7; chọn trang đích 0,5; tách bài 0,5; chỉnh title/meta 0,3; theo dõi 0,1; giao dịch–địa phương 0) × hệ số khả thi theo SERP (thông tin 1; hỗn hợp 0,6; giao dịch–địa phương 0,25; chưa có SERP: theo ý định của công cụ 0,1–0,8) × hệ số hiển thị (đang ở vị trí 11–20: 1,5; đã trong top 10: 0,5). Điểm chỉ để xếp thứ tự, không phải dự báo traffic.

| # | Nhóm | Volume/tháng | Cụm | Trang đích | Độ phủ | Hành động | Điểm |
|---:|---|---:|---|---|---|---|---:|
| 1 | [thuê xe máy cần giấy tờ gì](keyword-groups.md#thue-xe-may-can-giay-to-gi) | 30 | K04 | /blog/an-toan/mua-ban-xe-may-giay-to-cho-du-khach/ | Đã có bài | Sửa nội dung lỗi thời trước (review body có nguồn) | 30 |
| 2 | [người nước ngoài lái xe máy ở việt nam](keyword-groups.md#nguoi-nuoc-ngoai-lai-xe-may-o-viet-nam) | 20 | K19 | /blog/an-toan/nguoi-nuoc-ngoai-lai-xe-o-viet-nam/ | Đã có bài | Sửa nội dung lỗi thời trước (review body có nguồn) | 12 |

## Quyết định đã ghi (data/seo/engine-decisions.json)

| Nhóm | Hành động | Trạng thái | Ngày | Ghi chú | Hiện tại |
|---|---|---|---|---|---|
| [bằng lái xe máy a1](keyword-groups.md#bang-lai-xe-may-a1) | Đưa cụm từ chính vào title/meta (article-meta) | done | 2026-10-14 | Sau khi sửa nội dung pháp lý của BA-0122 (Điều 57, 89 Luật 36/2024/QH15), title/meta theo 'bằng lái xe máy A1' và 'bằng A1 lái được xe gì'. | Giữ nguyên |
| [không bằng lái xe máy phạt bao nhiêu](keyword-groups.md#khong-bang-lai-xe-may-phat-bao-nhieu) | Đưa cụm từ chính vào title/meta (article-meta) | done | 2026-10-14 | Title/meta BA-0029 mang cụm 'không có bằng lái xe máy phạt bao nhiêu' (data/seo/article-meta.json). | Giữ nguyên |
| [lỗi sử dụng điện thoại khi đi xe máy](keyword-groups.md#loi-su-dung-dien-thoai-khi-di-xe-may) | Bổ sung mục/FAQ vào bài đích (review body) | deferred | 2026-10-14 | BA-0989 đã nêu mức phạt và trừ điểm; khác biệt chỉ là từ đồng nghĩa (sử dụng/dùng, đi/lái). Xem lại khi có dữ liệu Search Console. | Bổ sung mục/FAQ vào bài đích (review body) |
| [mũ bảo hiểm đạt chuẩn](keyword-groups.md#mu-bao-hiem-dat-chuan) | Đưa cụm từ chính vào title/meta (article-meta) | done | 2026-10-14 | Volume đo được 590/tháng (OpenSEO); SERP hỏi 'thế nào là mũ đạt chuẩn, cách nhận biết tem CR' khớp nội dung BA-0017 (QCVN 2:2021/BKHCN, dấu CR, cài quai, mức phạt). | Giữ nguyên |
| [mức phạt nồng độ cồn xe máy](keyword-groups.md#muc-phat-nong-do-con-xe-may) | Đưa cụm từ chính vào title/meta (article-meta) | done | 2026-10-14 | Title/meta BA-0011 theo cụm 'mức phạt nồng độ cồn xe máy'. | Giữ nguyên |
| [phượt hà giang bằng xe máy](keyword-groups.md#phuot-ha-giang-bang-xe-may) | Bài mới (owner thêm ID vào ma trận) | rejected | 2026-10-14 | BA-0348 (vòng cung Hà Giang bằng xe máy) và các biến thể đã trả lời truy vấn; khác biệt chỉ là chữ 'phượt', viết thêm bài sẽ trùng chủ đề. | Bổ sung mục/FAQ vào bài đích (review body) |
| [phượt tam đảo bằng xe máy](keyword-groups.md#phuot-tam-dao-bang-xe-may) | Bổ sung mục/FAQ vào bài đích (review body) | rejected | 2026-10-14 | BA-0252 (đi Tam Đảo bằng xe máy: lộ trình, chạy đèo) đã phủ ý định; 'phượt' chỉ là cách gọi khác. | Bổ sung mục/FAQ vào bài đích (review body) |
| [bằng lái xe máy là hạng gì](keyword-groups.md#bang-lai-xe-may-la-hang-gi) | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Cùng bài BA-2002 (mục "bằng lái xe máy là hạng gì"); BM-006. | Đưa cụm từ chính vào title/meta (article-meta) |
| [bao nhiêu tuổi được đi xe máy điện](keyword-groups.md#bao-nhieu-tuoi-duoc-di-xe-may-dien) | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Cùng bài BA-2001 (mục độ tuổi 16/18); battle matrix BM-001. | Bổ sung mục/FAQ vào bài đích (review body) |
| [các loại bằng lái xe máy](keyword-groups.md#cac-loai-bang-lai-xe-may) | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Bài BA-2002 (các loại bằng lái xe máy: A1, A, B1 và bằng A1/A2 cũ) đăng 15/10/2026; BM-003. | Giữ nguyên |
| cac-loai-bang-lai-xe-may-theo-luat-36-2024-qh15-hang-a1-a-b1-va-bang-a1-a2-cap-truoc-2025 | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Chủ đề đã rà soát → BA-2002 đã đăng. | — |
| [cấm xe máy](keyword-groups.md#cam-xe-may) | Bài mới (owner thêm ID vào ma trận) | done | 2026-10-15 | Bài BA-2004 (cấm xe máy xăng Vành đai 1, Nghị quyết 57/2025/NQ-HĐND, Chỉ thị 20/CT-TTg) đăng 15/10/2026; BM-005. | Giữ nguyên |
| [cấm xe máy xăng vành đai 1](keyword-groups.md#cam-xe-may-xang-vanh-dai-1) | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Cùng bài BA-2004. | Giữ nguyên |
| [đi phượt bằng xe máy](keyword-groups.md#di-phuot-bang-xe-may) | Bài mới (owner thêm ID vào ma trận) | done | 2026-10-15 | Bài BA-2005 (đi phượt bằng xe máy, GUIDE, blog/huong-dan/) đăng 15/10/2026 qua Blog Factory; W4 battle matrix BM-001 (P1). | Giữ nguyên |
| [đồ đi phượt xe máy](keyword-groups.md#do-di-phuot-xe-may) | Bài mới (owner thêm ID vào ma trận) | done | 2026-10-15 | Bài BA-2006 (đồ đi phượt xe máy, GUIDE, blog/huong-dan/) đăng 15/10/2026 qua Blog Factory; W4 battle matrix BM-002 (P2). | Giữ nguyên |
| [lỗi không gương xe máy](keyword-groups.md#loi-khong-guong-xe-may) | Cân nhắc tách bài riêng | done | 2026-10-15 | Bài riêng BA-2003 (lỗi không gương xe máy, Điều 14 NĐ 168/2024) đăng 15/10/2026; tách khỏi mục của BA-0095; BM-004. | Giữ nguyên |
| vung-phat-thai-thap-trong-vanh-dai-1-ha-noi-va-nguoi-thue-xe-may-xang | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Chủ đề đã rà soát → BA-2004 đã đăng. | — |
| [xe máy điện có cần bằng lái không](keyword-groups.md#xe-may-dien-co-can-bang-lai-khong) | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Bài BA-2001 (xe máy điện có cần bằng lái không, bao nhiêu tuổi) đăng 15/10/2026 theo battle matrix BM-002; dữ kiện Điều 34, 56, 57, 59 Luật 36/2024/QH15. | Giữ nguyên |
| xe-may-dien-co-can-bang-lai-khong-va-bao-nhieu-tuoi-duoc-di | Bài mới sau khi đối chiếu văn bản gốc | done | 2026-10-15 | Chủ đề đã rà soát → BA-2001 đã đăng. | — |

## Phạm vi từ khóa

Trong phạm vi: 183 · Website chị em sở hữu: 8 · Ngoài ý định thuê xe: 368 · Thị trường khác: 180 · Thuê tại điểm đến: 18 · Ý định gần tôi (bản đồ): 8 · Dịch vụ chưa xác minh: 26

## Vòng tự động (agent)

1. `node tools/seo-engine.mjs` → đọc hàng đợi hành động và [research-queue.md](research-queue.md).
2. Nghiên cứu: chụp SERP/đo volume theo hàng đợi bằng công cụ sẵn có (không API trả phí mới), lưu vào `data/seo/serp-snapshots/` và `data/seo/keyword-demand.json`.
3. Thực thi an toàn: chỉnh title/meta qua `data/seo/article-meta.json` (validator + audit cannibalization), bổ sung mục/FAQ qua `tools/seo-body-review.mjs`; bài mới → [proposed-matrix-rows.csv](proposed-matrix-rows.csv) chờ owner.
4. Ghi quyết định vào `data/seo/engine-decisions.json`, chạy lại `node tools/seo-cold-start.mjs`, `node tools/seo-engine.mjs`, `node --test`, build, rồi commit/push.
