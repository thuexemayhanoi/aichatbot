# Hiệu lực văn bản pháp luật mà bài viết trích dẫn

_Sinh bởi `node tools/seo-legal-citations.mjs` từ sổ đăng ký `data/seo/legal-documents.json` (rà ngày 01/11/2026) và 323 bài đã đăng có trích dẫn văn bản. Không sửa tay. Phân loại "đang áp dụng"/"nhắc quy định cũ" là theo từ ngữ trong câu; mỗi dòng in kèm câu để người rà soát quyết định._

| Mục | Số |
|---|---:|
| Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng (cần sửa qua review body sau khi đối chiếu toàn văn) | 0 |
| Trích dẫn sai ký hiệu | 0 |
| Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu | 0 |
| Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn | 0 |
| Trích dẫn ngoài sổ đăng ký | 0 |

## 1. Bài dẫn văn bản đã hết hiệu lực như quy định đang áp dụng

Mỗi bài dưới đây phải có cờ trong `config/seo-cold-start.json` → `content_flags` (engine 06 ngừng đẩy từ khóa tới bài cho đến khi sửa). Sửa qua `tools/seo-body-review.mjs` với dữ kiện đã đối chiếu toàn văn (`data/seo/legal-facts.json`).

| Bài | Văn bản đang dẫn | Thay bởi | Từ ngày | Bằng chứng | Lượt | Câu trong bài |
|---|---|---|---|---|---:|---|
| — | | | | | | |

## 2. Trích dẫn sai ký hiệu

| Bài | Trong bài | Đúng là | Câu |
|---|---|---|---|
| — | | | |

## 3. Văn bản được sửa đổi sau khi bài đăng — chờ đối chiếu toàn văn

| Văn bản | Sửa bởi | Từ ngày | Bài đang dẫn | Việc chờ |
|---|---|---|---:|---|
| — | | | | |

Đã đối chiếu toàn văn văn bản sửa đổi: luat-36-2024 ← luat-118-2025 (rà ngày 31/10/2026, 225 bài dẫn; ghi chú trong sổ đăng ký).
Đã đối chiếu toàn văn văn bản sửa đổi: nd-168-2024 ← nd-238-2026 (rà ngày 23/10/2026, 232 bài dẫn; ghi chú trong sổ đăng ký).

## 4. Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn

Hàng đợi đối chiếu (cần truy cập nguồn chính thức: Cổng TTĐT Chính phủ, Công báo, cơ sở dữ liệu văn bản pháp luật).

| Văn bản | Trạng thái | Bằng chứng | Bài đang dẫn | Việc chờ | Nguồn để đối chiếu |
|---|---|---|---:|---|---|
| — | | | | | |

## 5. Sổ đăng ký và số bài dẫn

| Văn bản | Tên | Trạng thái | Bằng chứng | Hiệu lực | Thay/sửa bởi | Bài dẫn như hiện hành | Bài nhắc quy định cũ | Dẫn theo tên |
|---|---|---|---|---|---|---:|---:|---:|
| luat-36-2024 | Luật Trật tự, an toàn giao thông đường bộ số 36/2024/QH15 | amended | fulltext | 01/01/2025 | luat-118-2025 | 225 | 1 | 64 |
| luat-118-2025 | Luật số 118/2025/QH15 sửa đổi, bổ sung một số điều của 10 luật có liên quan đến an ninh, trật tự | in_force | fulltext | 01/07/2026 | — | 0 | 0 | 0 |
| luat-23-2008 | Luật Giao thông đường bộ số 23/2008/QH12 | replaced | reported | 01/07/2009 | luat-36-2024 | 0 | 3 | 3 |
| luat-39-2024 | Luật Thủ đô số 39/2024/QH15 | replaced | fulltext | 01/01/2025 | luat-02-2026-qh16 | 0 | 0 | 0 |
| luat-02-2026-qh16 | Luật Thủ đô số 02/2026/QH16 | in_force | fulltext | 01/07/2026 | — | 1 | 0 | 1 |
| bo-luat-dan-su-91-2015 | Bộ luật Dân sự số 91/2015/QH13 | in_force | fulltext | 01/01/2017 | — | 46 | 1 | 34 |
| bo-luat-hinh-su-100-2015 | Bộ luật Hình sự số 100/2015/QH13 | in_force | fulltext | 01/01/2018 | — | 9 | 0 | 8 |
| luat-08-2022 | Luật Kinh doanh bảo hiểm số 08/2022/QH15 | in_force | fulltext | 01/01/2023 | — | 1 | 0 | 0 |
| luat-19-2023 | Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15 | in_force | fulltext | 01/07/2024 | — | 19 | 0 | 7 |
| luat-20-2023 | Luật Giao dịch điện tử số 20/2023/QH15 | in_force | fulltext | 01/07/2024 | — | 1 | 0 | 0 |
| luat-91-2025 | Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 | in_force | fulltext | 01/01/2026 | — | 11 | 0 | 2 |
| nd-168-2024 | Nghị định 168/2024/NĐ-CP quy định xử phạt vi phạm hành chính về trật tự, an toàn giao thông trong lĩnh vực giao thông đường bộ; trừ điểm, phục hồi điểm giấy phép lái xe | amended | fulltext | 01/01/2025 | nd-238-2026 | 232 | 11 | 0 |
| nd-238-2026 | Nghị định 238/2026/NĐ-CP sửa đổi, bổ sung một số điều của Nghị định 168/2024/NĐ-CP | in_force | fulltext | 15/08/2026 | — | 3 | 0 | 0 |
| nd-100-2019 | Nghị định 100/2019/NĐ-CP xử phạt vi phạm hành chính trong lĩnh vực giao thông đường bộ và đường sắt | replaced | reported | 01/01/2020 | nd-168-2024 | 0 | 3 | 0 |
| nd-13-2023 | Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân | replaced | fulltext | 01/07/2023 | nd-356-2025 | 0 | 8 | 0 |
| nd-356-2025 | Nghị định 356/2025/NĐ-CP quy định chi tiết một số điều và biện pháp thi hành Luật Bảo vệ dữ liệu cá nhân | in_force | fulltext | 01/01/2026 | — | 4 | 1 | 0 |
| nd-67-2023 | Nghị định 67/2023/NĐ-CP về bảo hiểm bắt buộc trách nhiệm dân sự của chủ xe cơ giới, bảo hiểm cháy nổ bắt buộc, bảo hiểm bắt buộc trong hoạt động đầu tư xây dựng | in_force | fulltext | 06/09/2023 | — | 11 | 0 | 0 |
| nd-03-2021 | Nghị định 03/2021/NĐ-CP về bảo hiểm bắt buộc trách nhiệm dân sự của chủ xe cơ giới | replaced | unverified | 01/03/2021 | nd-67-2023 | 0 | 1 | 0 |
| nd-96-2016 | Nghị định 96/2016/NĐ-CP quy định điều kiện về an ninh, trật tự đối với một số ngành, nghề đầu tư kinh doanh có điều kiện | in_force | fulltext | 01/07/2016 | — | 5 | 0 | 0 |
| nd-56-2023 | Nghị định 56/2023/NĐ-CP sửa đổi, bổ sung một số điều của Nghị định 96/2016/NĐ-CP, Nghị định 99/2016/NĐ-CP, Nghị định 137/2020/NĐ-CP | in_force | fulltext | 15/08/2023 | — | 2 | 0 | 0 |
| nd-10-2022 | Nghị định 10/2022/NĐ-CP quy định về lệ phí trước bạ | in_force | fulltext | 01/03/2022 | — | 1 | 0 | 0 |
| tt-38-2024-bgtvt | Thông tư 38/2024/TT-BGTVT quy định về tốc độ và khoảng cách an toàn của xe cơ giới, xe máy chuyên dùng tham gia giao thông đường bộ | in_force | fulltext | 01/01/2025 | — | 21 | 0 | 0 |
| tt-04-2021-bkhcn | Thông tư 04/2021/TT-BKHCN ban hành Quy chuẩn kỹ thuật quốc gia về mũ bảo hiểm cho người đi mô tô, xe máy (QCVN 2:2021/BKHCN) | in_force | fulltext | 01/08/2021 | — | 4 | 0 | 0 |
| tt-60-2023-btc | Thông tư 60/2023/TT-BTC quy định mức thu, chế độ thu, nộp, miễn, quản lý lệ phí đăng ký, cấp biển phương tiện giao thông cơ giới đường bộ | replaced | fulltext | 22/10/2023 | tt-155-2025-btc | 0 | 5 | 0 |
| tt-154-2025-btc | Thông tư 154/2025/TT-BTC quy định mức thu, chế độ thu, nộp phí sát hạch lái xe, lệ phí cấp bằng, chứng chỉ được hoạt động trên các loại phương tiện và lệ phí đăng ký, cấp biển xe máy chuyên dùng | in_force | fulltext | 01/01/2026 | — | 1 | 0 | 0 |
| tt-155-2025-btc | Thông tư 155/2025/TT-BTC quy định mức thu, chế độ thu, nộp, miễn, quản lý lệ phí đăng ký, cấp biển phương tiện giao thông cơ giới đường bộ | in_force | fulltext | 01/01/2026 | — | 5 | 0 | 0 |
| tt-29-2015-bgtvt | Thông tư 29/2015/TT-BGTVT quy định về cấp, sử dụng giấy phép lái xe quốc tế | replaced | reported | — | tt-108-2026-bca | 0 | 1 | 0 |
| tt-35-2024-bgtvt | Thông tư 35/2024/TT-BGTVT quy định về đào tạo, sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế; đào tạo, kiểm tra, cấp chứng chỉ bồi dưỡng kiến thức pháp luật về giao thông đường bộ | replaced | reported | 01/01/2025 | tt-12-2025-bca | 0 | 0 | 0 |
| tt-12-2025-bca | Thông tư 12/2025/TT-BCA quy định về sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế | replaced | fulltext | 01/03/2025 | tt-108-2026-bca | 0 | 5 | 0 |
| tt-108-2026-bca | Thông tư 108/2026/TT-BCA quy định về sát hạch, cấp giấy phép lái xe; cấp, sử dụng giấy phép lái xe quốc tế | in_force | fulltext | 01/07/2026 | — | 7 | 1 | 0 |
| tt-24-2023-bca | Thông tư 24/2023/TT-BCA quy định về cấp, thu hồi đăng ký, biển số xe cơ giới | replaced | fulltext | 15/08/2023 | tt-79-2024-bca | 0 | 2 | 0 |
| tt-79-2024-bca | Thông tư 79/2024/TT-BCA quy định về cấp, thu hồi chứng nhận đăng ký xe, biển số xe cơ giới, xe máy chuyên dùng | in_force | fulltext | 01/01/2025 | — | 4 | 0 | 0 |
| tt-46-2012-bgtvt | Thông tư 46/2012/TT-BGTVT quy định về đào tạo, sát hạch, cấp giấy phép lái xe cơ giới đường bộ | replaced | unverified | — | tt-12-2025-bca | 0 | 2 | 0 |
| qd-13-2026-ttg | Quyết định 13/2026/QĐ-TTg quy định lộ trình áp dụng quy chuẩn kỹ thuật quốc gia về khí thải đối với xe mô tô, xe gắn máy | in_force | fulltext | 16/05/2026 | — | 8 | 0 | 0 |
| nq-57-2025-hdnd | Nghị quyết 57/2025/NQ-HĐND của HĐND thành phố Hà Nội về vùng phát thải thấp | in_force | fulltext | 10/12/2025 | — | 1 | 0 | 0 |
| qd-3273-2026-ubnd | Quyết định 3273/QĐ-UBND ngày 29/6/2026 của UBND thành phố Hà Nội phê duyệt Đề án "Vùng phát thải thấp trong vành đai 1, thành phố Hà Nội" | in_force | fulltext | 29/06/2026 | — | 1 | 0 | 1 |
| nq-47-2024-hdnd | Nghị quyết 47/2024/NQ-HĐND của HĐND thành phố Hà Nội quy định thực hiện vùng phát thải thấp | replaced | fulltext | 01/01/2025 | nq-57-2025-hdnd | 0 | 1 | 0 |
| nq-202-2025-qh15 | Nghị quyết 202/2025/QH15 về việc sắp xếp đơn vị hành chính cấp tỉnh | in_force | fulltext | 12/06/2025 | — | 3 | 0 | 0 |
| ct-20-2025-ttg | Chỉ thị 20/CT-TTg ngày 12/7/2025 của Thủ tướng Chính phủ về một số nhiệm vụ cấp bách, quyết liệt ngăn chặn, giải quyết tình trạng ô nhiễm môi trường | in_force | fulltext | 12/07/2025 | — | 1 | 0 | 0 |

## 6. Trích dẫn ngoài sổ đăng ký

Thêm văn bản vào `data/seo/legal-documents.json` (có nguồn chính thức) để đưa vào rà soát.

| Khóa | Bài | Câu mẫu |
|---|---:|---|
| — | | |
