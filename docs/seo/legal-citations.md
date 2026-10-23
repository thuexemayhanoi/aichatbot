# Hiệu lực văn bản pháp luật mà bài viết trích dẫn

_Sinh bởi `node tools/seo-legal-citations.mjs` từ sổ đăng ký `data/seo/legal-documents.json` (rà ngày 23/10/2026) và 317 bài đã đăng có trích dẫn văn bản. Không sửa tay. Phân loại "đang áp dụng"/"nhắc quy định cũ" là theo từ ngữ trong câu; mỗi dòng in kèm câu để người rà soát quyết định._

| Mục | Số |
|---|---:|
| Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng (cần sửa qua review body sau khi đối chiếu toàn văn) | 15 |
| Trích dẫn sai ký hiệu | 1 |
| Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu | 0 |
| Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn | 10 |
| Trích dẫn ngoài sổ đăng ký | 0 |

## 1. Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng

Mỗi bài dưới đây phải có cờ trong `config/seo-cold-start.json` → `content_flags` (engine 06 ngừng đẩy từ khóa tới bài cho đến khi sửa). Sửa qua `tools/seo-body-review.mjs` với dữ kiện đã đối chiếu toàn văn (`data/seo/legal-facts.json`).

| Bài | Văn bản đang dẫn | Thay bởi | Từ ngày | Bằng chứng | Lượt | Câu trong bài |
|---|---|---|---|---|---:|---|
| BA-0041 `nguoi-nuoc-ngoai-lai-xe-o-viet-nam` | tt-29-2015-bgtvt | tt-108-2026-bca | 01/01/2025 | reported | 3 | Theo Điều 11 Thông tư 29/2015/TT-BGTVT của Bộ Giao thông vận tải, quy định về sử dụng giấy phép lái xe quốc tế, người có IDP do nước tham gia Công ước Viên cấp khi điều khiển xe t… |
| BA-0047 `idp-va-bang-lai-quoc-te` | tt-12-2025-bca | tt-108-2026-bca | 01/07/2026 | fulltext | 5 | Một điểm mới đáng lưu ý: từ ngày 01/3/2025, Thông tư 12/2025/TT-BCA của Bộ Công an quy định về sát hạch, cấp giấy phép lái xe và cấp, sử dụng giấy phép lái xe quốc tế cho phép cả … |
| BA-0047 `idp-va-bang-lai-quoc-te` | tt-29-2015-bgtvt | tt-108-2026-bca | 01/01/2025 | reported | 2 | Việt Nam công nhận loại IDP nào, từ khi nào Việt Nam gia nhập Công ước Vienna 1968 về giao thông đường bộ và Công ước về biển báo, tín hiệu đường bộ vào năm 2014, và liên quan trự… |
| BA-0227 `mua-ban-xe-may-giay-to` | tt-24-2023-bca | tt-79-2024-bca | 01/01/2025 | fulltext | 1 | Theo Thông tư 24/2023/TT-BCA của Bộ Công an, ban hành năm 2023 và áp dụng từ giữa tháng Tám, người mua kê khai giấy khai đăng ký xe, đưa xe đến cơ quan công an quản lý hồ sơ để ki… |
| BA-0275 `bao-ve-du-lieu-ca-nhan-khi-thue-xe` | nd-13-2023 | nd-356-2025 | 01/01/2026 | fulltext | 6 | Quy định: Nghị định 13/2023/NĐ-CP của Chính phủ quy định chi tiết về bảo vệ dữ liệu cá nhân. |
| BA-0509 `mua-ban-xe-may-giay-to-cho-du-khach` | tt-24-2023-bca | tt-79-2024-bca | 01/01/2025 | fulltext | 1 | Theo Thông tư 24/2023 của Bộ Công an về cấp đăng ký xe, người mua kê khai giấy khai, đưa xe đến cơ quan công an quản lý hồ sơ để kiểm tra và nộp hồ sơ sang tên đúng thủ tục. |
| BA-0557 `bao-ve-du-lieu-ca-nhan-khi-thue-xe-cho-du-khach` | nd-13-2023 | nd-356-2025 | 01/01/2026 | fulltext | 2 | Quy định nền là Nghị định 13/2023/NĐ-CP của Chính phủ quy định chi tiết về bảo vệ dữ liệu cá nhân: dữ liệu chỉ được thu thập khi chủ thể biết rõ và đồng ý trước, trừ trường hợp ph… |
| BA-0605 `nguoi-nuoc-ngoai-lai-xe-o-viet-nam-cho-nguoi-moi` | tt-29-2015-bgtvt | tt-108-2026-bca | 01/01/2025 | reported | 1 | Văn bản và hiệu lực: Điều 11 Thông tư 29/2015/TT-BGTVT của Bộ Giao thông vận tải về quy định sử dụng giấy phép lái xe quốc tế. |
| BA-0611 `idp-va-bang-lai-quoc-te-cho-nguoi-moi` | tt-12-2025-bca | tt-108-2026-bca | 01/07/2026 | fulltext | 1 | Một điểm mới đáng chú ý: từ ngày 01/3/2025, theo Thông tư 12/2025/TT-BCA của Bộ Công an, cả người nước ngoài đang cư trú tại Việt Nam cũng được nộp hồ sơ đề nghị cấp IDP, với điều… |
| BA-0611 `idp-va-bang-lai-quoc-te-cho-nguoi-moi` | tt-29-2015-bgtvt | tt-108-2026-bca | 01/01/2025 | reported | 1 | Văn bản và hiệu lực: điều khoản về sử dụng giấy phép lái xe quốc tế được quy định tại Thông tư 29/2015/TT-BGTVT do Bộ Giao thông vận tải ban hành, áp dụng từ cuối năm 2015. |
| BA-0893 `idp-va-bang-lai-quoc-te-tom-tat` | tt-12-2025-bca | tt-108-2026-bca | 01/07/2026 | fulltext | 1 | Văn bản và hiệu lực: với người cần làm IDP từ năm 2025, Thông tư 12/2025/TT-BCA của Bộ Công an là văn bản điều chỉnh, có hiệu lực từ ngày 01/3/2025. |
| BA-1121 `bao-ve-du-lieu-ca-nhan-khi-thue-xe-tom-tat` | nd-13-2023 | nd-356-2025 | 01/01/2026 | fulltext | 2 | Hiệu lực: Nghị định 13/2023/NĐ-CP, có hiệu lực từ ngày 01/7/2023. |
| BA-1175 `idp-va-bang-lai-quoc-te-vi-du-thuc-te` | tt-12-2025-bca | tt-108-2026-bca | 01/07/2026 | fulltext | 1 | Văn bản và hiệu lực: với nhóm cư trú, thủ tục nằm trong Thông tư 12/2025/TT-BCA của Bộ Công an, áp dụng từ 01/3/2025. |
| BA-1373 `tranh-app-thue-xe-lua-dao-vi-du-thuc-te` | nd-13-2023 | nd-356-2025 | 01/01/2026 | fulltext | 1 | Pháp lý liên quan: việc thu thập, xử lý dữ liệu cá nhân phải có sự đồng ý của chủ thể và gắn với mục đích đã thông báo; đối tượng là bên thu thập và xử lý; quy định nằm trong Nghị… |
| BA-1457 `idp-va-bang-lai-quoc-te-cau-hoi-thuong-gap` | tt-12-2025-bca | tt-108-2026-bca | 01/07/2026 | fulltext | 1 | Người cư trú dài hạn nên tìm hiểu thủ tục đổi sang giấy phép lái xe Việt Nam tại cơ quan có thẩm quyền; kể từ năm 2025, việc cấp và đổi giấy phép lái xe, bao gồm giấy phép quốc tế… |

## 2. Trích dẫn sai ký hiệu

| Bài | Trong bài | Đúng là | Câu |
|---|---|---|---|
| BA-0323 `nguoi-nuoc-ngoai-lai-xe-o-viet-nam-cho-du-khach` | Thông tư 38/2024/TB-BGTVT | Thông tư 38/2024/TT-BGTVT | Cụ thể, theo Thông tư 38/2024/TB-BGTVT , tốc độ trên đường phố không được vượt quá 40 km/h, và phải giảm tốc độ trong khu vực đông dân cư hoặc nguy hiểm. |

## 3. Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu toàn văn

| Văn bản | Sửa bởi | Từ ngày | Bài đang dẫn | Việc chờ |
|---|---|---|---:|---|
| — | | | | |

Đã đối chiếu toàn văn văn bản sửa đổi: nd-168-2024 ← nd-238-2026 (rà ngày 23/10/2026, 227 bài dẫn; ghi chú trong sổ đăng ký).

## 4. Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn

Hàng đợi đối chiếu (cần truy cập nguồn chính thức: Cổng TTĐT Chính phủ, Công báo, cơ sở dữ liệu văn bản pháp luật).

| Văn bản | Trạng thái | Bằng chứng | Bài đang dẫn | Việc chờ | Nguồn để đối chiếu |
|---|---|---|---:|---|---|
| luat-39-2024 | in_force | unverified | 1 | — | — |
| bo-luat-dan-su-91-2015 | in_force | unverified | 34 | — | — |
| luat-08-2022 | in_force | unverified | 1 | — | — |
| nd-67-2023 | in_force | unverified | 11 | — | — |
| nd-96-2016 | in_force | unverified | 5 | — | — |
| nd-10-2022 | in_force | unverified | 1 | — | — |
| tt-04-2021-bkhcn | in_force | unverified | 4 | — | — |
| tt-60-2023-btc | in_force | unverified | 5 | — | — |
| qd-13-2026-ttg | in_force | reported | 7 | Đọc toàn văn trên Cổng TTĐT Chính phủ: các mốc 01/7/2027 (Hà Nội, TP.HCM), 01/7/2028, 01/7/2030 và mức quy chuẩn theo năm sản xuất (bản tin mâu thuẫn nhau). | <https://luatvietnam.vn/tin-van-ban-moi/tu-01-7-2027-ha-noi-va-tphcm-bat-dau-kiem-dinh-khi-thai-xe-may-186-108232-article.html> <https://vnexpress.net/ha-noi-tp-hcm-se-kiem-dinh-khi-thai-xe-may-tu-ngay-1-7-2027-5059602.html> |
| nq-202-2025-qh15 | in_force | unverified | 3 | — | — |

## 5. Sổ đăng ký và số bài dẫn

| Văn bản | Tên | Trạng thái | Bằng chứng | Hiệu lực | Thay/sửa bởi | Bài dẫn như hiện hành | Bài nhắc quy định cũ | Dẫn theo tên |
|---|---|---|---|---|---|---:|---:|---:|
| luat-36-2024 | Luật Trật tự, an toàn giao thông đường bộ số 36/2024/QH15 | in_force | fulltext | 01/01/2025 | — | 223 | 2 | 220 |
| luat-23-2008 | Luật Giao thông đường bộ số 23/2008/QH12 | replaced | reported | 01/07/2009 | luat-36-2024 | 0 | 3 | 3 |
| luat-39-2024 | Luật Thủ đô số 39/2024/QH15 | in_force | unverified | 01/01/2025 | — | 1 | 0 | 1 |
| bo-luat-dan-su-91-2015 | Bộ luật Dân sự số 91/2015/QH13 | in_force | unverified | 01/01/2017 | — | 34 | 1 | 34 |
| luat-08-2022 | Luật Kinh doanh bảo hiểm số 08/2022/QH15 | in_force | unverified | 01/01/2023 | — | 1 | 0 | 0 |
| luat-91-2025 | Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 | in_force | fulltext | 01/01/2026 | — | 2 | 0 | 2 |
| nd-168-2024 | Nghị định 168/2024/NĐ-CP quy định xử phạt vi phạm hành chính về trật tự, an toàn giao thông trong lĩnh vực giao thông đường bộ; trừ điểm, phục hồi điểm giấy phép lái xe | amended | fulltext | 01/01/2025 | nd-238-2026 | 227 | 11 | 0 |
| nd-238-2026 | Nghị định 238/2026/NĐ-CP sửa đổi, bổ sung một số điều của Nghị định 168/2024/NĐ-CP | in_force | fulltext | 15/08/2026 | — | 1 | 0 | 0 |
| nd-100-2019 | Nghị định 100/2019/NĐ-CP xử phạt vi phạm hành chính trong lĩnh vực giao thông đường bộ và đường sắt | replaced | reported | 01/01/2020 | nd-168-2024 | 0 | 3 | 0 |
| nd-13-2023 | Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân | replaced | fulltext | 01/07/2023 | nd-356-2025 | 4 | 4 | 0 |
| nd-356-2025 | Nghị định 356/2025/NĐ-CP quy định chi tiết một số điều và biện pháp thi hành Luật Bảo vệ dữ liệu cá nhân | in_force | fulltext | 01/01/2026 | — | 0 | 0 | 0 |
| nd-67-2023 | Nghị định 67/2023/NĐ-CP về bảo hiểm bắt buộc trách nhiệm dân sự của chủ xe cơ giới, bảo hiểm cháy nổ bắt buộc, bảo hiểm bắt buộc trong hoạt động đầu tư xây dựng | in_force | unverified | 06/09/2023 | — | 11 | 0 | 0 |
| nd-03-2021 | Nghị định 03/2021/NĐ-CP về bảo hiểm bắt buộc trách nhiệm dân sự của chủ xe cơ giới | replaced | unverified | 01/03/2021 | nd-67-2023 | 0 | 1 | 0 |
| nd-96-2016 | Nghị định 96/2016/NĐ-CP quy định điều kiện về an ninh, trật tự đối với một số ngành, nghề đầu tư kinh doanh có điều kiện | in_force | unverified | 01/07/2016 | — | 5 | 0 | 0 |
| nd-10-2022 | Nghị định 10/2022/NĐ-CP quy định về lệ phí trước bạ | in_force | unverified | 01/03/2022 | — | 1 | 0 | 0 |
| tt-38-2024-bgtvt | Thông tư 38/2024/TT-BGTVT quy định về tốc độ và khoảng cách an toàn của xe cơ giới, xe máy chuyên dùng tham gia giao thông đường bộ | in_force | fulltext | 01/01/2025 | — | 21 | 0 | 0 |
| tt-04-2021-bkhcn | Thông tư 04/2021/TT-BKHCN ban hành Quy chuẩn kỹ thuật quốc gia về mũ bảo hiểm cho người đi mô tô, xe máy (QCVN 2:2021/BKHCN) | in_force | unverified | 01/01/2022 | — | 4 | 1 | 0 |
| tt-60-2023-btc | Thông tư 60/2023/TT-BTC quy định mức thu, chế độ thu, nộp, miễn, quản lý lệ phí đăng ký, cấp biển phương tiện giao thông cơ giới đường bộ | in_force | unverified | 22/10/2023 | — | 5 | 0 | 0 |
| tt-29-2015-bgtvt | Thông tư 29/2015/TT-BGTVT quy định về cấp, sử dụng giấy phép lái xe quốc tế | replaced | reported | — | tt-108-2026-bca | 4 | 0 | 0 |
| tt-35-2024-bgtvt | Thông tư 35/2024/TT-BGTVT quy định về đào tạo, sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế; đào tạo, kiểm tra, cấp chứng chỉ bồi dưỡng kiến thức pháp luật về giao thông đường bộ | replaced | reported | 01/01/2025 | tt-12-2025-bca | 0 | 0 | 0 |
| tt-12-2025-bca | Thông tư 12/2025/TT-BCA quy định về sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế | replaced | fulltext | 01/03/2025 | tt-108-2026-bca | 5 | 0 | 0 |
| tt-108-2026-bca | Thông tư 108/2026/TT-BCA quy định về sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế | in_force | fulltext | 01/07/2026 | — | 0 | 0 | 0 |
| tt-24-2023-bca | Thông tư 24/2023/TT-BCA quy định về cấp, thu hồi đăng ký, biển số xe cơ giới | replaced | fulltext | 15/08/2023 | tt-79-2024-bca | 2 | 0 | 0 |
| tt-79-2024-bca | Thông tư 79/2024/TT-BCA quy định về cấp, thu hồi chứng nhận đăng ký xe, biển số xe cơ giới, xe máy chuyên dùng | in_force | fulltext | 01/01/2025 | — | 2 | 0 | 0 |
| tt-46-2012-bgtvt | Thông tư 46/2012/TT-BGTVT quy định về đào tạo, sát hạch, cấp giấy phép lái xe cơ giới đường bộ | replaced | unverified | — | tt-12-2025-bca | 0 | 2 | 0 |
| qd-13-2026-ttg | Quyết định 13/2026/QĐ-TTg quy định lộ trình áp dụng quy chuẩn kỹ thuật quốc gia về khí thải đối với xe mô tô, xe gắn máy | in_force | reported | 16/05/2026 | — | 7 | 0 | 0 |
| nq-57-2025-hdnd | Nghị quyết 57/2025/NQ-HĐND của HĐND thành phố Hà Nội về vùng phát thải thấp | in_force | fulltext | 06/12/2025 | — | 1 | 0 | 0 |
| nq-47-2024-hdnd | Nghị quyết 47/2024/NQ-HĐND của HĐND thành phố Hà Nội quy định thực hiện vùng phát thải thấp | amended | unverified | 01/01/2025 | nq-57-2025-hdnd | 0 | 1 | 0 |
| nq-202-2025-qh15 | Nghị quyết 202/2025/QH15 về việc sắp xếp đơn vị hành chính cấp tỉnh | in_force | unverified | 12/06/2025 | — | 3 | 0 | 0 |
| ct-20-2025-ttg | Chỉ thị 20/CT-TTg ngày 12/7/2025 của Thủ tướng Chính phủ về một số nhiệm vụ cấp bách, quyết liệt ngăn chặn, giải quyết tình trạng ô nhiễm môi trường | in_force | fulltext | 12/07/2025 | — | 1 | 0 | 0 |

## 6. Trích dẫn ngoài sổ đăng ký

Thêm văn bản vào `data/seo/legal-documents.json` (có nguồn chính thức) để đưa vào rà soát.

| Khóa | Bài | Câu mẫu |
|---|---:|---|
| — | | |
