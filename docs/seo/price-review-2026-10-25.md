# Rà soát giá trong bài viết theo bảng giá chuẩn — 2026-10-25

**Lý do:** `data/business/pricing.json` vừa nhận bảng giá và tiền cọc chuẩn của chủ cửa hàng (v78). Bài nào ghi giá bằng placeholder `{{ price.* }}` thì tự cập nhật khi build. Nhưng một số bài đã đăng gõ tay giá cũ, hoặc khẳng định những điều nay không còn đúng, ví dụ "xe 50cc giá liên hệ" hay "Wave chỉ có giá ngày". Những dữ kiện đó được sửa riêng từng chỗ qua quy trình review body (`tools/seo-body-review.mjs`, theo AGENTS.md). Không có bài nào bị viết lại.

## Bảng giá áp dụng (VNĐ; "Liên hệ" = chưa công bố, `null` trong dữ liệu)

| Xe | Ngày | Tuần | Tháng | Tiền cọc (khoản riêng) |
|---|---|---|---|---|
| Honda Wave | 150.000 | 700.000 | 900.000–1.200.000 | 2–3 triệu |
| Honda Vision | 200.000 | 1.000.000 | 1.800.000–2.000.000 | 4–5 triệu |
| Honda Air Blade | 200.000 | 1.000.000 | 1.500.000 | 3 triệu |
| Honda Click / Yamaha Mio | 150.000 | 700.000 | 900.000–1.200.000 | 2 triệu |
| Xe tay ga 50cc | 200.000 | Liên hệ | Liên hệ | 4 triệu |
| Xe máy điện | Liên hệ | Liên hệ | Liên hệ | Xác nhận theo mẫu xe |
| Xe đạp điện | Liên hệ | Liên hệ | Liên hệ | Xác nhận theo mẫu xe |

## Kết quả

| Lượt | Phạm vi | Bài sửa | Chỗ thay thế |
|---|---|---|---|
| 1 | 305 bài có số tiền gõ tay gần ngữ cảnh thuê xe | 205 | 762 |
| 2 | 219 bài có câu không kèm số (50cc "liên hệ", Wave tuần/tháng) hoặc giá cũ còn sót | 84 | 100 |
| Tổng | | **285 bài** (4 bài có mặt ở cả hai lượt) | **862** |

- `apply` đã chạy cổng QA của nhà máy (`tools/article-qa.mjs`) trước và sau từng bài: 289/289 lượt áp dụng thành công, 0 bài bị trả lại, không bài nào tụt điểm.
- Mọi giá thuê thay mới đều là placeholder trỏ tới `pricing.json`, nên lần đổi giá sau chỉ cần sửa một chỗ.
- Các con số tổng gõ tay chỉ được dùng khi cổng cho phép (mọi nhóm chữ số đã có sẵn trong bài). Cả 47 phép tính đã được kiểm lại, ví dụ:
  - Air Blade 2 tuần = 2.000.000đ, cao hơn giá tháng 1.500.000đ.
  - Wave 10 ngày = 1 tuần + 3 ngày = 1.150.000đ.
  - Air Blade + Click một tuần = 1.700.000đ.
- Các nhận định đổi theo giá mới. Ví dụ, "từ ngày thứ tư gói tuần rẻ hơn" của Vision/Air Blade nay thành ngày thứ năm, vì 5 × 200.000đ = 1.000.000đ.
- Mức phạt giao thông và số liệu pháp lý không bị động tới.
- Dữ kiện chung trên mọi bài được sửa một chỗ trong bộ dựng: khoảng `{{ price.x.week.min }}–{{ price.x.week.max }}` của giá có min = max nay hiển thị một giá, thay vì "1.000.000đ–1.000.000đ".

## Không sửa thành số chính xác (đã viết lại cho vẫn đúng)

Cổng review không cho thêm con số mới mà bài chưa có. Vì vậy các chỗ sau được viết lại cho đúng mà không nêu số chính xác:

- BA-1334: chi phí/ngày khi thuê theo tuần: "đến hơn 150.000đ" (chính xác khoảng 157.000đ). Một khoảng khác viết "từ khoảng 80.000đ" (chính xác 80–90 nghìn).
- BA-0974, BA-1732, BA-1945, BA-1935, BA-1682, BA-1977: giá tháng Click quy ra ngày: "không quá 40.000đ" (chính xác 30–40 nghìn).
- BA-0974: chi phí học kỳ Click/Air Blade: "tối đa khoảng 6.000.000đ" và "6.000.000đ đến hơn 7.000.000đ".
- BA-1662, BA-1811, BA-1100, BA-1823, BA-0890: tổng nhiều tháng/tuần viết bằng placeholder, ví dụ "3 × {{ price.honda-airblade.month.min }}", thay vì gõ tổng.
- BA-1058, BA-1250, BA-1220, BA-0866, BA-1939: tổng hoặc chia đôi chi phí viết dạng "không quá …" hoặc "chưa tới …".
- BA-0061, BA-0062, BA-0064, BA-0050: tiền cọc theo dòng xe viết "từ 2.000.000đ" hoặc "ghi riêng trên bảng giá".

## Còn lại, để chủ cửa hàng quyết định khi cần

- Nhiều danh sách chỉ ghi giá ngày của Wave mà không nhắc giá tuần/tháng. Danh sách không sai, chỉ thiếu thông tin, nên giữ nguyên.
- Một số lời khuyên như "từ bốn ngày hãy hỏi gói tuần" vẫn giữ, vì chỉ là gợi ý hỏi, không phải khẳng định giá.
- `knowledge_chunks` (đoạn tri thức chatbot trong `data/blog/published.json`) được rà riêng cùng đợt này.

Hoàn tác: `git revert` các commit nội dung "content(price): …". Body là file thường; log review nằm ở `data/seo/body-reviews.json`.
