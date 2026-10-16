# Hàng đợi nghiên cứu (agent có công cụ nghiên cứu thực hiện)

> Mốc SERP hiện tại: 2026-10-14; làm mới cùng bộ truy vấn sau 45 ngày. Lưu kết quả theo định dạng `data/seo/serp-snapshots/<ngày>.json` (xem `tools/seo-cold-start.mjs`), volume vào `data/seo/keyword-demand.json`; không nhập số tự đặt.

## 1. Chụp SERP cho nhóm có nhu cầu nhưng chưa có SERP (0)

| Nhóm | Volume/tháng | Cụm |
|---|---:|---|

## 2. Đo volume cho nhóm chỉ có trên SERP (0)

| Nhóm | Cụm | Nguồn |
|---|---|---|
| — | | |

Đã hỏi công cụ nhưng không có số (21 nhóm — nhu cầu rất thấp hoặc chưa ghi nhận, không phải 0): đặt thuê xe máy online; kinh nghiệm lái xe máy ở hà nội; thuê xe máy cho người nước ngoài; đặt cọc thuê xe máy; kiểm tra xe máy khi thuê; thuê xe máy ở ga hà nội; xe điện đi phố cổ; xe máy bị thủng lốp giữa đường; bằng lái a1 a2 khác gì; bảo hiểm xe máy thuê; tai nạn khi đi xe thuê ai chịu trách nhiệm; thuê xe máy long biên; đi phố cổ hà nội bằng xe máy; xe điện bờ hồ; thuê xe máy ba đình; đi hồ tây bằng xe máy; thuê xe máy đi hà giang; thuê xe máy đi ninh bình; đi xe máy xuyên việt; cấm xe máy xăng vành đai 1; xe thuê bị hỏng phải làm sao.

## 3. Đối chiếu văn bản gốc trước khi viết

- Vùng phát thải thấp trong Vành đai 1 (Hà Nội) và người thuê xe máy xăng: https://daibieunhandan.vn/ha-noi-thi-diem-vung-phat-thai-thap-huong-toi-thoi-quen-su-dung-phuong-tien-xanh-cua-nguoi-dan-10425277.html · https://hanoimoi.vn/ha-noi-dong-bo-trien-khai-vung-phat-thai-thap-trong-vanh-dai-1-1215488.html · https://hhtip.hanoi.gov.vn/vi/tin-tuc/hien-thuc-hoa-muc-tieu-cai-thien-moi-truong-thu-do-2897.html
- Xe máy điện: có cần bằng lái không và bao nhiêu tuổi được đi: https://thuvienphapluat.vn/van-ban/Giao-thong-Van-tai/Luat-trat-tu-an-toan-giao-thong-duong-bo-2024-so-36-2024-QH15-444251.aspx
- Các loại bằng lái xe máy theo Luật 36/2024/QH15: hạng A1, A, B1 và bằng A1, A2 cấp trước 2025: https://thuvienphapluat.vn/van-ban/Giao-thong-Van-tai/Luat-trat-tu-an-toan-giao-thong-duong-bo-2024-so-36-2024-QH15-444251.aspx

## 4. Hiệu lực văn bản pháp luật bài đang dẫn (tools/seo-legal-citations.mjs)

- Bài dẫn văn bản đã bị thay thế như quy định đang áp dụng: 10 (cờ content_flags; sửa qua review body sau khi đối chiếu toàn văn)
- Văn bản được sửa đổi sau khi bài đăng, chờ đối chiếu toàn văn: nd-168-2024 ← nd-238-2026 (227 bài)
- Văn bản dẫn như hiện hành nhưng chưa đối chiếu toàn văn: luat-39-2024 (1), bo-luat-dan-su-91-2015 (34), luat-08-2022 (1), luat-91-2025 (2), nd-238-2026 (1), nd-67-2023 (11), nd-96-2016 (5), nd-10-2022 (1), tt-38-2024-bgtvt (21), tt-04-2021-bkhcn (4), tt-60-2023-btc (5), tt-12-2025-bca (5), tt-79-2024-bca (2), qd-13-2026-ttg (7), nq-202-2025-qh15 (3)
- Chi tiết và nguồn để đối chiếu: docs/seo/legal-citations.md
