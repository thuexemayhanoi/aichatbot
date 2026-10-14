# Keyword Cluster Map — SEO tiếng Việt

> Sinh tự động bởi `node tools/seo-master-audit.mjs` từ `data/seo/keyword-clusters.json` + ma trận đã audit.
> **Chỉ SEO tiếng Việt**: các cụm tiếng Anh (motorbike rental Hanoi, Hanoi motorbike rental) bị loại khỏi phạm vi theo yêu cầu.

## Kiến trúc

```
Trang chủ (Agent, chuyển đổi) ─┬─ /gia-thue/ · /lien-he/ · /chinh-sach/   (trang chuyển đổi)
                               └─ /blog/ → 3 hub cụm → 6 hub danh mục → pillar họ chủ đề → bài hỗ trợ
Bài hỗ trợ ↔ pillar ↔ các bài cùng họ  (khối "Cùng chủ đề")
Bài ↔ bài gần nghĩa ngoài họ            (khối "Bài viết liên quan", cân bằng inbound)
```

## Cụm từ khóa thương mại do website chị em sở hữu (không nhắm trực tiếp)

- **cho thuê xe máy Hà Nội** — https://thuexemaynguyentu.com/ và repo thuexemayhanoi/shop, thuexemayhanoi/vanchinh. Chính sách: không tạo landing/tiêu đề nhắm đúng cụm này; chỉ hỗ trợ bằng nội dung thông tin long-tail.
- **thuê xe máy Hà Nội** — sister site. Chính sách: như trên.
- **dịch vụ cho thuê xe máy Hà Nội** — sister site. Chính sách: như trên.
- **thuê xe máy uy tín Hà Nội** — sister site. Chính sách: như trên; không tự xưng 'uy tín nhất'.

Lý do: `config/seo-ownership.json` + `tests/unit/seo-ownership.test.js` bảo vệ chống cannibalization giữa các domain của cùng doanh nghiệp. Subdomain này hỗ trợ các cụm đó bằng nội dung thông tin long-tail và trang chuyển đổi (/gia-thue/, /lien-he/), không tạo landing trùng.

## Dữ liệu volume thật (không ước đoán)

Nguồn: Ubersuggest keyword_suggestions (Google Ads data), location Vietnam (locId 2704), language vi · lấy ngày 2026-10-14. Chỉ ghi số liệu công cụ trả về; không ước đoán. Ô trống = công cụ không trả dữ liệu. Volume là ước tính hằng tháng của bên thứ ba, không phải dữ liệu Search Console.

| Từ khóa | Volume/tháng | SD | Cụm / chủ sở hữu | Ghi chú |
|---|---:|---:|---|---|
| thuê xe máy hà nội | 8100 | 12 | site chị em |  |
| cho thuê xe máy hà nội | 1600 | 12 | site chị em |  |
| thuê xe máy điện | 1000 | 9 | K08 |  |
| cho thuê xe máy điện | 480 | 10 | K08 |  |
| thuê xe máy điện vinfast | 390 | 9 | K08 | cần kiểm chứng xe VinFast trước khi nhắm |
| thuê xe máy điện hà nội | 260 | 9 | K08 |  |
| thuê xe máy điện vinfast hà nội | 210 | 7 | K08 | cần kiểm chứng xe VinFast trước khi nhắm |
| thuê xe máy điện honda | 210 | 13 | K08 | cần kiểm chứng dòng xe |
| thuê xe máy điện không cần bằng lái | 0 | 4 | K09 |  |
| giá thuê xe máy | — | — | K02 | công cụ không trả dữ liệu |

Kết luận: cụm **xe máy điện (K08)** là cơ hội thương mại lớn nhất subdomain này được phép nhắm → hub `/blog/xe-dien/` nhận title "Thuê xe máy điện Hà Nội: …". Hai cụm đầu (8.100 và 1.600) thuộc site chị em nên không tạo landing trùng. Cần chạy thêm khi có quota/Search Console để phủ các cụm còn lại.

## Dịch vụ cần kiểm chứng trước khi tối ưu thương mại

- **Xe 50cc, xe máy điện, xe đạp điện**: có trong `data/business/pricing.json` nhưng **chưa có giá xác minh** → chỉ viết nội dung thông tin, không hứa giá.
- **Xe điện VinFast**: chưa có xác minh dòng xe/hãng trong dữ liệu doanh nghiệp → **cần kiểm chứng**.
- **"Không cần bằng lái"**: là nhận định pháp lý (xe gắn máy dưới 50 cm³) → chỉ viết qua legal gate, đối chiếu văn bản gốc và ngày hiệu lực.
- **Giao xe tận nơi/khách sạn**: có (`policies.delivery.available=true`) nhưng phí/thời gian **xác nhận trước khi đặt**.

## Các cụm

### K01 — Ứng dụng & Agent thuê xe máy

- **Từ khóa đầu cụm:** app thuê xe máy · ứng dụng thuê xe máy · ứng dụng cho thuê xe máy · đặt thuê xe máy online
- **Ý định:** thông tin sản phẩm / điều hướng
- **Trang trụ cột (pillar):** `/` · pillar nội dung `/blog/app/app-thue-xe-may-la-gi/`
- **Bài trong cụm:** 379 (65 pillar họ chủ đề, 314 bài hỗ trợ)
  - Tránh app thuê xe lừa đảo: dấu hiệu giả mạo, bốn bước kiểm tra — `/blog/an-toan/tranh-app-thue-xe-lua-dao/` (từ khóa: tránh app thuê xe lừa đảo)
  - Agent chọn xe máy: mô tả nhu cầu để được gợi ý đúng xe — `/blog/app/agent-chon-xe-giup-ban/` (từ khóa: agent chọn xe máy)
  - Ai trả lời trong ứng dụng thuê xe: máy hay người thật? — `/blog/app/ai-tra-loi-trong-ung-dung-thue-xe/` (từ khóa: ai trả lời trong ứng dụng thuê xe)
  - App hỗ trợ thủ tục thuê xe: giấy tờ, đặt cọc, nhận và trả xe — `/blog/app/app-ho-tro-thu-tuc-thue-xe/` (từ khóa: app hỗ trợ thủ tục thuê xe)
  - App thuê xe cho khách du lịch: ứng dụng web tiện ở đâu — `/blog/app/app-thue-xe-cho-khach-du-lich/` (từ khóa: app thuê xe cho khách du lịch)
  - App thuê xe cho người nước ngoài: giấy tờ, cọc và cách đặt xe — `/blog/app/app-thue-xe-cho-nguoi-nuoc-ngoai/` (từ khóa: app thuê xe cho người nước ngoài)
  - App thuê xe không cần tài khoản: đặt xe mà không phải đăng ký — `/blog/app/app-thue-xe-khong-can-tai-khoan/` (từ khóa: app thuê xe không cần tài khoản)
  - App thuê xe máy là gì? Ứng dụng web hỏi giá, chọn xe, thủ tục — `/blog/app/app-thue-xe-may-la-gi/` (từ khóa: app thuê xe máy là gì)
  - Cách dùng ứng dụng thuê xe máy: 5 bước từ hỏi giá đến nhận xe — `/blog/app/cach-dung-ung-dung-thue-xe-may/` (từ khóa: cách dùng ứng dụng thuê xe máy)
  - Cách gửi góp ý cho ứng dụng thuê xe: kênh nào, viết thế nào — `/blog/app/cach-gui-feedback-cho-ung-dung-thue-xe/` (từ khóa: cách gửi góp ý cho ứng dụng thuê xe)
  - Cách hỏi giá xe nhanh bằng chatbot: câu hỏi đúng, đủ thông tin — `/blog/app/cach-hoi-gia-xe-nhanh-bang-chatbot/` (từ khóa: cách hỏi giá xe nhanh bằng chatbot)
  - Cách tính giá thuê xe bằng app: đọc đúng một báo giá — `/blog/app/cach-tinh-gia-thue-xe-bang-app/` (từ khóa: cách tính giá thuê xe bằng app)
  - … và 53 pillar khác (xem CSV, cột Topic Cluster)

### K02 — Giá thuê xe máy

- **Từ khóa đầu cụm:** giá thuê xe máy Hà Nội · thuê xe máy giá rẻ Hà Nội · bảng giá thuê xe máy
- **Ý định:** thương mại - thông tin
- **Trang trụ cột (pillar):** `/gia-thue/` · pillar nội dung `/blog/thue-xe/thue-xe-may-gia-re/`
- **Bài trong cụm:** 69 (10 pillar họ chủ đề, 59 bài hỗ trợ)
  - Tính chi phí thuê xe theo ngày tuần tháng: chọn gói nào hợp lý — `/blog/app/tinh-chi-phi-thue-xe-theo-ngay-tuan-thang/` (từ khóa: tính chi phí thuê xe theo ngày tuần tháng)
  - Bảng giá thuê xe máy tham khảo: theo ngày, tuần, tháng — `/blog/thue-xe/bang-gia-thue-xe-tham-khao/` (từ khóa: bảng giá thuê xe máy tham khảo)
  - Cách đọc bảng giá thuê xe máy: giá niêm yết và chi phí thực — `/blog/thue-xe/cach-doc-bang-gia-thue-xe/` (từ khóa: cách đọc bảng giá thuê xe máy)
  - Giá thuê xe máy có thay đổi theo mùa không: khi nào nhích lên — `/blog/thue-xe/gia-thue-thay-doi-theo-mua-khong/` (từ khóa: giá thuê xe máy có thay đổi theo mùa không)
  - Giá thuê xe máy theo ngày: giá từng dòng xe, cách tính ngày — `/blog/thue-xe/gia-thue-xe-may-theo-ngay/` (từ khóa: giá thuê xe máy theo ngày)
  - Chi phí đi lại khi thuê xe máy: những khoản ngoài giá thuê — `/blog/thue-xe/khoang-chi-phi-di-lai-khi-thue-xe/` (từ khóa: chi phí đi lại khi thuê xe máy)
  - So sánh giá các loại xe máy cho thuê: theo ngày, tuần, tháng — `/blog/thue-xe/so-sanh-gia-cac-loai-xe-may-cho-thue/` (từ khóa: so sánh giá các loại xe máy cho thuê)
  - Thuê xe máy giá rẻ: tính tổng chi phí và tránh phí phát sinh — `/blog/thue-xe/thue-xe-may-gia-re/` (từ khóa: thuê xe máy giá rẻ)
  - Thuê xe máy nào tiết kiệm xăng: yếu tố quyết định và cách chọn — `/blog/thue-xe/xe-nao-tiet-kiem-xang-khi-thue/` (từ khóa: thuê xe máy nào tiết kiệm xăng)
  - Chi phí điện khi thuê xe điện: tiền sạc nằm ở đâu, ai trả — `/blog/xe-dien/chi-phi-dien-khi-thue-xe-dien/` (từ khóa: chi phí điện khi thuê xe điện)

### K03 — Thuê theo ngày, tuần, tháng, dài hạn

- **Từ khóa đầu cụm:** thuê xe máy theo ngày Hà Nội · thuê xe máy theo tuần Hà Nội · thuê xe máy tháng Hà Nội · thuê xe máy dài hạn Hà Nội
- **Ý định:** thương mại - thông tin
- **Trang trụ cột (pillar):** `/blog/thue-xe/`
- **Bài trong cụm:** 58 (9 pillar họ chủ đề, 49 bài hỗ trợ)
  - Gia hạn thời gian thuê xe máy: khi nào nên, làm thế nào — `/blog/huong-dan/gia-han-thoi-gian-thue/` (từ khóa: gia hạn thời gian thuê xe máy)
  - Tính lộ trình khi thuê xe máy theo ngày: bốn bước chốt lịch — `/blog/huong-dan/tinh-lo-trinh-thue-xe-theo-ngay/` (từ khóa: tính lộ trình khi thuê xe máy theo ngày)
  - Thuê xe dài hạn cho người đi làm: tiêu chí chọn xe và chi phí — `/blog/thue-xe/thue-xe-dai-han-cho-nguoi-di-lam/` (từ khóa: thuê xe dài hạn cho người đi làm)
  - Thuê xe dài ngày giá tốt: mốc thuê, thương lượng, chi phí — `/blog/thue-xe/thue-xe-dai-ngay-gia-tot/` (từ khóa: thuê xe dài ngày giá tốt)
  - Thuê xe máy theo tháng: khi nào đáng lấy và hợp đồng cần gì — `/blog/thue-xe/thue-xe-may-theo-thang/` (từ khóa: thuê xe máy theo tháng)
  - Thuê xe máy theo tuần: khi nào đáng lấy và cần hỏi gì trước — `/blog/thue-xe/thue-xe-may-theo-tuan/` (từ khóa: thuê xe máy theo tuần)
  - Ưu đãi thuê xe máy dài hạn: các dạng ưu đãi và cách hỏi gói — `/blog/thue-xe/uu-dai-thue-xe-dai-han/` (từ khóa: ưu đãi thuê xe máy dài hạn)
  - Thuê xe điện dài ngày: nhịp sạc, chi phí và điều kiện cần chốt — `/blog/xe-dien/thue-xe-dien-dai-ngay/` (từ khóa: thuê xe điện dài ngày)
  - Thuê xe điện theo ngày: kế hoạch pin và kiểm tra khi nhận xe — `/blog/xe-dien/thue-xe-dien-theo-ngay/` (từ khóa: thuê xe điện theo ngày)

### K04 — Thủ tục, giấy tờ, hợp đồng và đặt cọc

- **Từ khóa đầu cụm:** thủ tục thuê xe máy · giấy tờ cần khi thuê xe máy · đặt cọc thuê xe máy
- **Ý định:** thông tin - chuyển đổi
- **Trang trụ cột (pillar):** `/blog/huong-dan/thu-tuc-thue-xe-may/`
- **Bài trong cụm:** 196 (33 pillar họ chủ đề, 163 bài hỗ trợ)
  - Thanh toán cọc thuê xe an toàn: bằng chứng và điều khoản — `/blog/an-toan/an-toan-khi-thanh-toan-coc/` (từ khóa: thanh toán cọc thuê xe an toàn)
  - Mua bán xe máy giấy tờ: cần những gì và sang tên thế nào — `/blog/an-toan/mua-ban-xe-may-giay-to/` (từ khóa: mua bán xe máy giấy tờ)
  - Hợp đồng thuê xe máy hợp pháp: hình thức và dấu hiệu rủi ro — `/blog/an-toan/nhan-dien-hop-dong-thue-xe-hop-phap/` (từ khóa: hợp đồng thuê xe máy hợp pháp)
  - Thủ tục khi va chạm nhẹ khi thuê xe máy: làm gì ngay sau đó — `/blog/an-toan/thu-tuc-khi-va-cham-nhe/` (từ khóa: thủ tục khi va chạm nhẹ khi thuê xe máy)
  - Chở hành lý khi thuê xe máy: xếp đồ, buộc chằng, chọn xe — `/blog/huong-dan/cho-hanh-ly-khi-thue-xe/` (từ khóa: chở hành lý khi thuê xe máy)
  - Chụp ảnh xe máy trước khi nhận xe thuê: vị trí và cách chụp — `/blog/huong-dan/chup-anh-xe-truoc-khi-nhan/` (từ khóa: chụp ảnh xe máy trước khi nhận xe thuê)
  - Đánh giá cửa hàng sau khi thuê xe: tiêu chí và bằng chứng — `/blog/huong-dan/danh-gia-cua-hang-sau-khi-thue/` (từ khóa: đánh giá cửa hàng sau khi thuê xe)
  - Đặt cọc thuê xe máy thế nào: hình thức thu và hoàn cọc — `/blog/huong-dan/dat-coc-the-nao/` (từ khóa: đặt cọc thuê xe máy thế nào)
  - Đi đèo dốc bằng xe máy thuê: kỹ thuật leo và hạ dốc an toàn — `/blog/huong-dan/deo-doc-va-xe-may-thue/` (từ khóa: đi đèo dốc bằng xe máy thuê)
  - Đi hai người trên xe máy thuê: vai trò, tốc độ và an toàn — `/blog/huong-dan/di-hai-nguoi-tren-xe-thue/` (từ khóa: đi hai người trên xe máy thuê)
  - Dịch công chứng giấy tờ thuê xe: giấy nào cần dịch, làm ở đâu — `/blog/huong-dan/dich-cong-chung-giay-to-thue-xe/` (từ khóa: dịch công chứng giấy tờ thuê xe)
  - Xe máy đi đường vành đai Hà Nội: đoạn được đi và đoạn bị cấm — `/blog/huong-dan/duong-vanh-dai-ha-noi/` (từ khóa: xe máy đi đường vành đai Hà Nội)
  - … và 21 pillar khác (xem CSV, cột Topic Cluster)

### K05 — Nhận xe, trả xe và kiểm tra xe

- **Từ khóa đầu cụm:** kiểm tra xe khi thuê · nhận xe thuê cần gì · trả xe thuê
- **Ý định:** thông tin
- **Trang trụ cột (pillar):** `/blog/huong-dan/kiem-tra-xe-khi-nhan/`
- **Bài trong cụm:** 78 (13 pillar họ chủ đề, 65 bài hỗ trợ)
  - Đổi xe máy giữa kỳ thuê: trình tự, điều kiện và xử lý tiền cọc — `/blog/huong-dan/doi-xe-giua-ky-thue/` (từ khóa: đổi xe máy giữa kỳ thuê)
  - Kiểm tra xe máy khi nhận xe thuê: từng bộ phận và ảnh gốc — `/blog/huong-dan/kiem-tra-xe-khi-nhan/` (từ khóa: kiểm tra xe máy khi nhận xe thuê)
  - Nhận xe thuê ban đêm: đặt trước, giấy tờ và an toàn — `/blog/huong-dan/nhan-xe-ban-dem/` (từ khóa: nhận xe thuê ban đêm)
  - Mức xăng khi nhận và trả xe máy thuê: ghi lại tránh tranh cãi — `/blog/huong-dan/nhien-lieu-khi-nhan-tra-xe/` (từ khóa: mức xăng khi nhận và trả xe máy thuê)
  - Quy trình nhận xe máy thuê: năm bước trong mười phút — `/blog/huong-dan/quy-trinh-nhan-xe/` (từ khóa: quy trình nhận xe máy thuê)
  - Quy trình trả xe máy thuê: bốn bước để nhận lại tiền cọc — `/blog/huong-dan/quy-trinh-tra-xe/` (từ khóa: quy trình trả xe máy thuê)
  - Thời gian nhận xe thuê sớm: cách đặt lịch và phương án thay thế — `/blog/huong-dan/thoi-gian-nhan-xe-som/` (từ khóa: thời gian nhận xe thuê sớm)
  - Trả xe thuê đúng giờ để tránh phí: giờ trả tính từ lúc nào — `/blog/huong-dan/tra-xe-dung-gio-de-tranh-phi/` (từ khóa: trả xe thuê đúng giờ để tránh phí)
  - Kiểm tra xe máy trước khi nhận xe thuê: danh mục theo cụm — `/blog/thue-xe/kiem-tra-xe-truoc-khi-nhan/` (từ khóa: kiểm tra xe máy trước khi nhận xe thuê)
  - Nhận xe thuê cần gì: giấy tờ, đặt cọc, kiểm tra năm phút — `/blog/thue-xe/nhan-xe-thue-can-gi/` (từ khóa: nhận xe thuê cần gì)
  - Trả xe thuê đúng giờ: quy trình gọn và những lỗi nên tránh — `/blog/thue-xe/tra-xe-thue-dung-gio/` (từ khóa: trả xe thuê đúng giờ)
  - Kiểm tra xe điện trước khi thuê: danh mục pin, phanh, đèn — `/blog/xe-dien/kiem-tra-xe-dien-truoc-khi-thue/` (từ khóa: kiểm tra xe điện trước khi thuê)
  - … và 1 pillar khác (xem CSV, cột Topic Cluster)

### K06 — Giao xe tận nơi, tận khách sạn

- **Từ khóa đầu cụm:** cho thuê xe máy giao tận nơi · thuê xe máy giao tận khách sạn
- **Ý định:** thương mại
- **Trang trụ cột (pillar):** `/chinh-sach/`
- **Bài trong cụm:** 32 (5 pillar họ chủ đề, 27 bài hỗ trợ)
  - Giao xe máy tại khách sạn: đặt xe, giấy tờ, kiểm tra ở sảnh — `/blog/huong-dan/giao-xe-tai-khach-san/` (từ khóa: giao xe máy tại khách sạn)
  - Giao xe tại sân bay Nội Bài: đặt xe, điểm hẹn và khi trễ bay — `/blog/huong-dan/giao-xe-tai-san-bay-noi-bai/` (từ khóa: giao xe tại sân bay Nội Bài)
  - Thuê xe máy và nhận phòng khách sạn: sắp xếp giờ cho khớp — `/blog/huong-dan/thue-xe-va-check-in-khach-san/` (từ khóa: thuê xe máy và nhận phòng khách sạn)
  - Phí giao xe thuê tận nơi: gồm những gì và cách tính thường gặp — `/blog/thue-xe/phi-giao-xe-thue/` (từ khóa: phí giao xe thuê tận nơi)
  - Thuê xe giao tận nơi: cách hoạt động, chi phí và khi nào đáng — `/blog/thue-xe/thue-xe-giao-tan-noi/` (từ khóa: thuê xe giao tận nơi)

### K07 — Chọn loại xe: xe số, xe ga, 50cc

- **Từ khóa đầu cụm:** thuê xe tay ga Hà Nội · thuê xe số Hà Nội · thuê xe máy 50cc Hà Nội · thuê xe Cub 50cc Hà Nội · thuê xe ga 50cc · so sánh các loại xe cho thuê
- **Ý định:** thương mại - so sánh
- **Trang trụ cột (pillar):** `/blog/thue-xe/`
- **Bài trong cụm:** 83 (12 pillar họ chủ đề, 71 bài hỗ trợ)
  - Gợi ý chọn xe máy phù hợp: ba câu hỏi để chọn đúng loại xe — `/blog/app/goi-y-chon-xe-may-phu-hop/` (từ khóa: gợi ý chọn xe máy phù hợp)
  - Quy trình tư vấn tự động chọn xe: bốn bước từ nhu cầu đến đặt — `/blog/app/quy-trinh-tu-van-tu-dong-chon-xe/` (từ khóa: quy trình tư vấn tự động chọn xe)
  - Chạy xe ga lần đầu: thao tác ga phanh và luyện cho người mới — `/blog/huong-dan/chay-xe-ga-lan-dau/` (từ khóa: chạy xe ga lần đầu)
  - Chọn xe máy thuê theo mục đích sử dụng: phố, đường xa, chở đồ — `/blog/thue-xe/chon-xe-theo-muc-dich-su-dung/` (từ khóa: chọn xe máy thuê theo mục đích sử dụng)
  - Thuê Honda Air Blade: giá tham khảo và kinh nghiệm chọn xe — `/blog/thue-xe/thue-honda-air-blade/` (từ khóa: thuê honda air blade)
  - Thuê Honda Vision: giá tham khảo, chi phí xăng và kiểm tra xe — `/blog/thue-xe/thue-honda-vision/` (từ khóa: thuê honda vision)
  - Thuê Wave Alpha: xe số tiết kiệm, giá và thủ tục nhận xe — `/blog/thue-xe/thue-wave-alpha/` (từ khóa: thuê wave alpha)
  - Thuê xe 50cc: ranh giới pháp lý, giấy tờ và điều cần hỏi — `/blog/thue-xe/thue-xe-50cc/` (từ khóa: thuê xe 50cc)
  - Thuê xe ga ở Hà Nội: ai nên chọn, chi phí và câu cần hỏi — `/blog/thue-xe/thue-xe-ga/` (từ khóa: thuê xe ga)
  - Thuê xe số hay xe ga cho người mới: so sánh và cách thử xe — `/blog/thue-xe/thue-xe-so-hay-xe-ga-cho-nguoi-moi/` (từ khóa: thuê xe số hay xe ga cho người mới)
  - Thuê xe số: khi nào đáng chọn và cách làm quen lại cần số — `/blog/thue-xe/thue-xe-so/` (từ khóa: thuê xe số)
  - Chọn xe điện phù hợp: ba tiêu chí và câu hỏi cho cửa hàng — `/blog/xe-dien/chon-xe-dien-phu-hop/` (từ khóa: chọn xe điện phù hợp)

### K08 — Xe máy điện và xe đạp điện

- **Từ khóa đầu cụm:** thuê xe máy điện Hà Nội · thuê xe điện VinFast Hà Nội
- **Ý định:** thương mại - thông tin
- **Trang trụ cột (pillar):** `/blog/xe-dien/`
- **Bài trong cụm:** 221 (36 pillar họ chủ đề, 185 bài hỗ trợ)
  - Chạy xe điện lần đầu: khác xe xăng thế nào, ba nguyên tắc — `/blog/huong-dan/chay-xe-dien-lan-dau/` (từ khóa: chạy xe điện lần đầu)
  - Bảo dưỡng xe điện: việc tự làm hằng tuần và việc cần thợ — `/blog/xe-dien/bao-duong-xe-dien/` (từ khóa: bảo dưỡng xe điện)
  - Cách giữ pin bền khi thuê xe điện: thói quen lái và sạc — `/blog/xe-dien/cach-giu-pin-ben-khi-thue-xe-dien/` (từ khóa: cách giữ pin bền khi thuê xe điện)
  - Chìa khóa xe điện thông minh: các dạng khóa và lưu ý khi thuê — `/blog/xe-dien/chia-khoa-xe-dien-thong-minh/` (từ khóa: chìa khóa xe điện thông minh)
  - Chính sách khuyến khích xe điện: tác động tới người thuê xe — `/blog/xe-dien/chinh-sach-khuyen-khich-xe-dien/` (từ khóa: chính sách khuyến khích xe điện)
  - Cửa hàng cho thuê xe điện: dấu hiệu đáng tin và câu nên hỏi — `/blog/xe-dien/cua-hang-cho-thue-xe-dien/` (từ khóa: cửa hàng cho thuê xe điện)
  - Đăng ký thuê xe điện: các bước làm và thông tin cần điền — `/blog/xe-dien/dang-ky-thue-xe-dien/` (từ khóa: đăng ký thuê xe điện)
  - Đi xe điện đường dài từ Hà Nội: chọn xe, pin và lộ trình sạc — `/blog/xe-dien/di-xe-dien-duong-dai/` (từ khóa: đi xe điện đường dài)
  - Dịch vụ sửa xe điện: khác sửa xe xăng ra sao, khi nào cần gọi — `/blog/xe-dien/dich-vu-sua-xe-dien/` (từ khóa: dịch vụ sửa xe điện)
  - Xe máy điện hết pin giữa đường phải làm gì: các bước xử lý — `/blog/xe-dien/het-pin-giua-duong-phai-lam-gi/` (từ khóa: xe máy điện hết pin giữa đường phải làm gì)
  - Hộp số xe điện: truyền động khác xe xăng thế nào khi thuê — `/blog/xe-dien/hop-so-xe-dien/` (từ khóa: hộp số xe điện)
  - Hướng dẫn sử dụng xe máy điện cho người thuê lần đầu — `/blog/xe-dien/huong-dan-su-dung-xe-may-dien/` (từ khóa: hướng dẫn sử dụng xe máy điện)
  - … và 24 pillar khác (xem CSV, cột Topic Cluster)

### K09 — Bằng lái và luật giao thông

- **Từ khóa đầu cụm:** bằng lái khi thuê xe máy · luật giao thông cho người thuê xe · thuê xe máy không cần bằng lái
- **Ý định:** thông tin - pháp lý (legal gate)
- **Trang trụ cột (pillar):** `/blog/an-toan/`
- **Bài trong cụm:** 101 (18 pillar họ chủ đề, 83 bài hỗ trợ)
  - Ai chịu phạt khi đi xe thuê: người lái, cửa hàng hay hợp đồng — `/blog/an-toan/ai-chiu-phat-khi-di-xe-thue/` (từ khóa: ai chịu phạt khi đi xe thuê)
  - Bằng lái A1 A2 khác gì: hạng hiện hành và điều cần đối chiếu — `/blog/an-toan/bang-lai-a1-a2-khac-gi/` (từ khóa: bằng lái a1 a2 khác gì)
  - Cầm đồ xe máy đúng luật: điều kiện hợp pháp và lưu ý xe thuê — `/blog/an-toan/cam-do-xe-may-dung-luat/` (từ khóa: cầm đồ xe máy đúng luật)
  - Camera phạt nguội khi thuê xe: mức phạt và trách nhiệm — `/blog/an-toan/camera-phat-nguoi-khi-thue-xe/` (từ khóa: camera phạt nguội khi thuê xe)
  - Vượt đèn đỏ và camera phạt nguội xe máy: quy định, cách tránh — `/blog/an-toan/den-do-va-camera-phat-nguoi/` (từ khóa: vượt đèn đỏ và camera phạt nguội xe máy)
  - Hậu quả đi ngược chiều bằng xe máy: quy định và cách phòng lỗi — `/blog/an-toan/di-nguoc-chieu-hau-qua/` (từ khóa: hậu quả đi ngược chiều bằng xe máy)
  - Không có bằng lái xe máy phạt bao nhiêu? Mức phạt, trách nhiệm — `/blog/an-toan/di-xe-khong-giay-phep/` (từ khóa: không có bằng lái xe máy phạt bao nhiêu)
  - IDP và bằng lái quốc tế: loại được công nhận và cách dùng — `/blog/an-toan/idp-va-bang-lai-quoc-te/` (từ khóa: idp và bằng lái quốc tế)
  - Kiểm định xe máy: quy định hiện nay và lưu ý cho người thuê — `/blog/an-toan/kiem-dinh-xe-may/` (từ khóa: kiểm định xe máy)
  - Quy tắc làn đường và nhường đường: Điều 13, 14 và mức xử phạt — `/blog/an-toan/lan-duong-va-quy-tac-nhuong/` (từ khóa: quy tắc làn đường và nhường đường)
  - Luật giao thông đường bộ cơ bản: điều người thuê xe cần nắm — `/blog/an-toan/luat-giao-thong-duong-bo-co-ban/` (từ khóa: luật giao thông đường bộ cơ bản)
  - Mức phạt nồng độ cồn xe máy: ba mức, trừ điểm, tước bằng — `/blog/an-toan/nong-do-con-khi-lai-xe/` (từ khóa: mức phạt nồng độ cồn xe máy)
  - … và 6 pillar khác (xem CSV, cột Topic Cluster)

### K10 — An toàn khi lái xe máy

- **Từ khóa đầu cụm:** kinh nghiệm lái xe máy an toàn ở Hà Nội · mũ bảo hiểm chuẩn
- **Ý định:** thông tin
- **Trang trụ cột (pillar):** `/blog/an-toan/`
- **Bài trong cụm:** 122 (23 pillar họ chủ đề, 99 bài hỗ trợ)
  - Đi xe máy khi có bão: dừng hay tiếp tục, cách đi an toàn — `/blog/an-toan/bao-va-xe-may/` (từ khóa: đi xe máy khi có bão)
  - Chở trẻ em trên xe máy: quy định, điều kiện an toàn, thuê xe — `/blog/an-toan/cho-tre-em-tren-xe-may/` (từ khóa: chở trẻ em trên xe máy)
  - Đèn xe máy và an toàn khi chạy đêm: quy định và kiểm tra — `/blog/an-toan/den-xe-va-an-toan-dem/` (từ khóa: đèn xe máy và an toàn khi chạy đêm)
  - Đội mũ bảo hiểm đúng cách: các bước, lỗi hay gặp và quy định — `/blog/an-toan/deo-non-dung-cach/` (từ khóa: đội mũ bảo hiểm đúng cách)
  - Đi xe máy theo nhóm an toàn: nguyên tắc đi đoàn và quy định — `/blog/an-toan/di-nhom-an-toan/` (từ khóa: đi xe máy theo nhóm an toàn)
  - Dùng điện thoại khi lái xe máy: quy định và ranh giới — `/blog/an-toan/dien-thoai-khi-lai-xe/` (từ khóa: dùng điện thoại khi lái xe máy)
  - Gương chiếu hậu xe máy an toàn: quy định và cách chỉnh — `/blog/an-toan/guong-chieu-hau-an-toan/` (từ khóa: gương chiếu hậu xe máy an toàn)
  - Khám sức khỏe lái xe: điều kiện pháp lý và cách tự kiểm tra — `/blog/an-toan/kham-suc-khoe-lai-xe/` (từ khóa: khám sức khỏe lái xe)
  - Kỹ năng phanh gấp xe máy: bốn bước luyện cú phanh an toàn — `/blog/an-toan/ky-nang-phanh-gap/` (từ khóa: kỹ năng phanh gấp)
  - Mệt mỏi khi lái xe đường dài: quy định và cách nghỉ giữa đường — `/blog/an-toan/met-moi-khi-lai-duong-dai/` (từ khóa: mệt mỏi khi lái xe đường dài)
  - Mũ bảo hiểm chuẩn: cách nhận biết mũ đạt chuẩn và cài quai — `/blog/an-toan/mu-bao-hiem-chuan/` (từ khóa: mũ bảo hiểm chuẩn)
  - Lái xe máy khi mưa lớn: quy định, chuẩn bị và đường ướt — `/blog/an-toan/mua-lon-va-lai-xe/` (từ khóa: lái xe máy khi mưa lớn)
  - … và 11 pillar khác (xem CSV, cột Topic Cluster)

### K11 — Bảo hiểm, tai nạn, quyền lợi người thuê

- **Từ khóa đầu cụm:** bảo hiểm khi thuê xe máy · trách nhiệm khi tai nạn xe thuê
- **Ý định:** thông tin - pháp lý (legal gate)
- **Trang trụ cột (pillar):** `/blog/an-toan/`
- **Bài trong cụm:** 62 (11 pillar họ chủ đề, 51 bài hỗ trợ)
  - Bảo hiểm khi thuê xe máy: loại bắt buộc và bảo hiểm cá nhân — `/blog/an-toan/bao-hiem-khi-thue-xe-may/` (từ khóa: bảo hiểm khi thuê xe máy)
  - Bảo vệ dữ liệu cá nhân khi thuê xe: cơ sở pháp lý, quyền — `/blog/an-toan/bao-ve-du-lieu-ca-nhan-khi-thue-xe/` (từ khóa: bảo vệ dữ liệu cá nhân khi thuê xe)
  - Gọi cảnh sát khi tai nạn: khi nào bắt buộc và nói gì — `/blog/an-toan/goi-canh-sat-khi-tai-nan/` (từ khóa: gọi cảnh sát khi tai nạn)
  - Khiếu nại dịch vụ thuê xe: bằng chứng, kênh gửi và cách viết — `/blog/an-toan/khien-nai-dich-vu-thue-xe/` (từ khóa: khiếu nại dịch vụ thuê xe)
  - Nghĩa vụ của bên cho thuê xe máy: giao xe, bảo dưỡng, sửa chữa — `/blog/an-toan/nghia-vu-cua-ben-cho-thue/` (từ khóa: nghĩa vụ của bên cho thuê xe máy)
  - Quyền của người thuê xe máy: dùng ổn định, sửa chữa, nhận cọc — `/blog/an-toan/quyen-cua-nguoi-thue-xe/` (từ khóa: quyền của người thuê xe máy)
  - Trách nhiệm khi tai nạn với xe thuê: ai bồi thường, mức nào — `/blog/an-toan/trach-nhiem-khi-tai-nan-voi-xe-thue/` (từ khóa: trách nhiệm khi tai nạn với xe thuê)
  - Phòng ngừa trộm xe máy: nơi hay mất xe và việc cần làm khi mất — `/blog/an-toan/trom-xe-va-phong-ngua/` (từ khóa: phòng ngừa trộm xe máy)
  - Xử lý dữ liệu cá nhân khi thuê xe online: điều bạn nên biết — `/blog/app/xu-ly-du-lieu-ca-nhan-khi-thue-xe-online/` (từ khóa: xử lý dữ liệu cá nhân khi thuê xe online)
  - Phòng tránh trộm cắp xe máy thuê: bước xử lý và trách nhiệm — `/blog/huong-dan/trom-cap-xe-va-xe-thue/` (từ khóa: phòng tránh trộm cắp xe máy thuê)
  - Xe thuê có bảo hiểm không: các loại bảo hiểm và câu cần hỏi — `/blog/thue-xe/xe-thue-co-bao-hiem-khong/` (từ khóa: xe thuê có bảo hiểm không)

### K12 — Phố cổ – Hoàn Kiếm

- **Từ khóa đầu cụm:** thuê xe máy phố cổ Hà Nội · thuê xe máy Hoàn Kiếm
- **Ý định:** địa phương - thông tin
- **Trang trụ cột (pillar):** `/blog/dia-phuong/di-pho-co-bang-xe-may/`
- **Bài trong cụm:** 84 (12 pillar họ chủ đề, 72 bài hỗ trợ)
  - Hành trình ăn bánh cuốn Hà Nội bằng xe máy: khu nên dừng chân — `/blog/dia-phuong/banh-cuon-va-hanh-trinh/` (từ khóa: hành trình ăn bánh cuốn Hà Nội)
  - Cà phê phố cổ Hà Nội bằng xe máy: khu nên dừng và lưu ý — `/blog/dia-phuong/ca-phe-pho-co/` (từ khóa: cà phê phố cổ Hà Nội bằng xe máy)
  - Cà phê trứng Hà Nội bằng xe máy: quán nổi tiếng, lưu ý lái xe — `/blog/dia-phuong/ca-phe-trung-va-xe-may/` (từ khóa: cà phê trứng Hà Nội bằng xe máy)
  - Buổi sáng ở Hồ Gươm bằng xe máy: lộ trình, gửi xe, ăn sáng — `/blog/dia-phuong/chay-buoi-sang-ho-guom/` (từ khóa: buổi sáng ở Hồ Gươm bằng xe máy)
  - Đi Phố Cổ bằng xe máy từ Long Biên: lộ trình và gửi xe — `/blog/dia-phuong/di-pho-co-bang-xe-may/` (từ khóa: đi phố cổ bằng xe máy từ long biên)
  - Du lịch Hoàn Kiếm bằng xe máy: vòng hồ, phố cổ và chỗ gửi xe — `/blog/dia-phuong/du-lich-hoan-kiem-bang-xe-may/` (từ khóa: du lịch Hoàn Kiếm bằng xe máy)
  - Hồ Gươm ban đêm: tuyến chạy, chỗ gửi xe, lưu ý chạy xe tối — `/blog/dia-phuong/ho-guom-ban-dem/` (từ khóa: Hồ Gươm ban đêm)
  - Đi Nhà Thờ Lớn Hà Nội bằng xe máy: đường đi, giờ đẹp, điểm hẹn — `/blog/dia-phuong/nha-tho-lon-ha-noi/` (từ khóa: đi Nhà Thờ Lớn Hà Nội bằng xe máy)
  - Hành trình ăn phở bò bằng xe máy: lộ trình sáng và gửi xe — `/blog/dia-phuong/pho-bo-va-hanh-trinh-sang/` (từ khóa: hành trình ăn phở bò bằng xe máy)
  - Ẩm thực phố cổ bằng xe máy: tuyến ăn tối và chỗ gửi xe — `/blog/dia-phuong/pho-co-am-thuc-xe-may/` (từ khóa: ẩm thực phố cổ bằng xe máy)
  - Đi Phố Sách Hà Nội bằng xe máy: mùa đẹp và điểm hẹn quanh đó — `/blog/dia-phuong/pho-sach-ha-noi/` (từ khóa: đi Phố Sách Hà Nội bằng xe máy)
  - Đi Phố Cổ bằng xe máy thuê: chọn xe, lộ trình, chỗ đỗ — `/blog/thue-xe/di-pho-co-bang-xe-may-thue/` (từ khóa: đi phố cổ bằng xe máy thuê)

### K13 — Ba Đình – Lăng Bác – Hoàng thành

- **Từ khóa đầu cụm:** thuê xe máy Ba Đình
- **Ý định:** địa phương - thông tin
- **Trang trụ cột (pillar):** `/blog/dia-phuong/`
- **Bài trong cụm:** 35 (5 pillar họ chủ đề, 30 bài hỗ trợ)
  - Đi Ba Đình bằng xe máy: ba cụm dừng, chỗ gửi xe và lộ trình — `/blog/dia-phuong/ba-dinh-xe-may-phuong/` (từ khóa: đi Ba Đình bằng xe máy)
  - Hành trình bảo tàng Hà Nội bằng xe máy: ghép nhiều bảo tàng — `/blog/dia-phuong/bao-tang-ha-noi-hanh-trinh/` (từ khóa: hành trình bảo tàng Hà Nội)
  - Đi chùa Một Cột bằng xe máy: vị trí, tích sen và điểm ghép — `/blog/dia-phuong/chua-mot-cot-ha-noi/` (từ khóa: đi chùa Một Cột bằng xe máy)
  - Cột cờ Hoàng Thành: nghi thức thăm cờ và cách đi bằng xe máy — `/blog/dia-phuong/cot-co-hoang-thanh/` (từ khóa: cột cờ Hoàng Thành)
  - Đi lăng Chủ tịch bằng xe máy: khung giờ và lộ trình Ba Đình — `/blog/dia-phuong/lang-chu-tich-qua-pho/` (từ khóa: đi lăng Chủ tịch bằng xe máy)

### K14 — Tây Hồ – Hồ Tây – Nhật Tân

- **Từ khóa đầu cụm:** thuê xe máy Tây Hồ
- **Ý định:** địa phương - thông tin
- **Trang trụ cột (pillar):** `/blog/dia-phuong/ho-tay-va-xe-may/`
- **Bài trong cụm:** 28 (4 pillar họ chủ đề, 24 bài hỗ trợ)
  - Ngắm hoàng hôn cầu Nhật Tân bằng xe máy: điểm dừng và lộ trình — `/blog/dia-phuong/cau-nhat-tan-hoang-hon/` (từ khóa: ngắm hoàng hôn cầu Nhật Tân bằng xe máy)
  - Đi chùa ở Hà Nội bằng xe máy: nhóm chùa và lộ trình một ngày — `/blog/dia-phuong/chua-va-ha-noi/` (từ khóa: đi chùa ở Hà Nội bằng xe máy)
  - Đi xe máy quanh Hồ Tây: vòng hồ, gửi xe, lịch trình nửa ngày — `/blog/dia-phuong/ho-tay-va-xe-may/` (từ khóa: đi xe máy quanh Hồ Tây)
  - Ngắm hoàng hôn Hồ Tây bằng xe máy: lộ trình và giờ đẹp — `/blog/dia-phuong/hoang-hon-ho-tay/` (từ khóa: ngắm hoàng hôn Hồ Tây)

### K15 — Long Biên – Gia Lâm – Bát Tràng (khu vực cửa hàng)

- **Từ khóa đầu cụm:** thuê xe máy Long Biên · thuê xe máy gần tôi · thuê xe máy gần khách sạn
- **Ý định:** địa phương - chuyển đổi
- **Trang trụ cột (pillar):** `/lien-he/`
- **Bài trong cụm:** 70 (10 pillar họ chủ đề, 60 bài hỗ trợ)
  - Đi chợ gốm Bát Tràng bằng xe máy: chọn gốm và chở về — `/blog/dia-phuong/bat-trang-gom-xe-may/` (từ khóa: đi chợ gốm Bát Tràng bằng xe máy)
  - Đi chợ Long Biên đêm bằng xe máy: xem gì, ăn đêm, lưu ý — `/blog/dia-phuong/cho-long-bien-dem/` (từ khóa: đi chợ Long Biên đêm bằng xe máy)
  - Chạy xe máy trục đường Đồng: khung giờ, an toàn, điểm dừng — `/blog/dia-phuong/duong-dong-by-bike/` (từ khóa: chạy xe máy trục đường đồng)
  - Gia Lâm và Long Biên bằng xe máy: lịch trình quanh bờ bắc — `/blog/dia-phuong/gia-lam-va-long-bien/` (từ khóa: Gia Lâm và Long Biên bằng xe máy)
  - Làng gốm Bát Tràng bằng xe máy: một ngày từ Long Biên — `/blog/dia-phuong/lang-gom-bat-trang/` (từ khóa: làng gốm Bát Tràng bằng xe máy)
  - Ngắm cảnh Long Biên bằng xe máy: cầu, bãi giữa và lộ trình — `/blog/dia-phuong/quang-di-long-bien-view/` (từ khóa: ngắm cảnh Long Biên bằng xe máy)
  - Đi cầu Long Biên và sông Hồng bằng xe máy: nửa buổi ngắm sông — `/blog/dia-phuong/song-hong-va-cau-long-bien/` (từ khóa: đi cầu Long Biên và sông Hồng bằng xe máy)
  - Thuê xe máy quanh Long Biên: câu hỏi cần hỏi và tuyến dạo — `/blog/dia-phuong/thue-xe-may-quanh-long-bien/` (từ khóa: thuê xe máy quanh long biên)
  - Đi Văn Giang bằng xe điện hay xe máy: chọn xe và lịch chạy — `/blog/dia-phuong/van-giang-ev-and-bikes/` (từ khóa: đi văn giang bằng xe điện hay xe máy)
  - Đi ven đê sông Hồng bằng xe máy: giờ đẹp và lưu ý an toàn — `/blog/dia-phuong/ven-de-song-hong/` (từ khóa: đi ven đê sông hồng bằng xe máy)

### K16 — Cầu Giấy – Đống Đa – Thanh Xuân – Hai Bà Trưng

- **Từ khóa đầu cụm:** thuê xe máy Cầu Giấy
- **Ý định:** địa phương - thông tin
- **Trang trụ cột (pillar):** `/blog/dia-phuong/`
- **Bài trong cụm:** 42 (6 pillar họ chủ đề, 36 bài hỗ trợ)
  - Đi Cầu Giấy bằng xe máy: cung đường từ Long Biên và ba cụm — `/blog/dia-phuong/cau-giay-di-xe-may/` (từ khóa: đi Cầu Giấy bằng xe máy)
  - Đi chợ hoa Hà Nội bằng xe máy: không có chợ hoa Quận 8 — `/blog/dia-phuong/cho-hoa-quan-tam/` (từ khóa: đi chợ hoa Hà Nội bằng xe máy)
  - Đi đền thờ danh nhân họ Nguyễn bằng xe máy: lộ trình, gửi xe — `/blog/dia-phuong/den-nguyen-can-bang-xe/` (từ khóa: đi đền thờ danh nhân họ nguyễn bằng xe máy)
  - Đi Đống Đa bằng xe máy: chạy cung nào, dừng ở đâu — `/blog/dia-phuong/dong-da-va-xe-may/` (từ khóa: đi đống đa bằng xe máy)
  - Hành trình Hai Bà Trưng bằng xe máy: gợi ý lịch trình một ngày — `/blog/dia-phuong/hai-ba-trung-hanh-trinh/` (từ khóa: hành trình Hai Bà Trưng bằng xe máy)
  - Đường đi Thanh Xuân bằng xe máy: cụm đáng ghé và cung chạy — `/blog/dia-phuong/thanh-xuan-duong-di/` (từ khóa: đường đi thanh xuân bằng xe máy)

### K17 — Hành trình ngoại thành và tỉnh lân cận

- **Từ khóa đầu cụm:** kinh nghiệm đi xe máy từ Hà Nội · thuê xe máy đi Ninh Bình · thuê xe máy đi Hà Giang
- **Ý định:** du lịch - thông tin
- **Trang trụ cột (pillar):** `/blog/kham-pha-an-toan/`
- **Bài trong cụm:** 117 (18 pillar họ chủ đề, 99 bài hỗ trợ)
  - Đi chùa Bái Đính bằng xe máy từ Hà Nội: lộ trình và lưu ý — `/blog/dia-phuong/bai-dinh-xe-may/` (từ khóa: đi chùa Bái Đính bằng xe máy)
  - Đi cao nguyên đá Đồng Văn bằng xe máy: lịch hai ngày, chuẩn bị — `/blog/dia-phuong/cao-nguyen-da-dong-van/` (từ khóa: đi cao nguyên đá Đồng Văn bằng xe máy)
  - Đi Cửa Lò bằng xe máy từ Hà Nội: chia chặng và kiểm tra xe — `/blog/dia-phuong/cua-lo-ven-bien/` (từ khóa: đi Cửa Lò bằng xe máy từ Hà Nội)
  - Đi vườn quốc gia Cúc Phương bằng xe máy: lộ trình từ Hà Nội — `/blog/dia-phuong/cuc-phuong-weekend/` (từ khóa: đi vườn quốc gia Cúc Phương bằng xe máy)
  - Quốc lộ 5 ngoại ô Hà Nội bằng xe máy: chặng ra phố và lưu ý — `/blog/dia-phuong/duong-5-va-ngoai-o/` (từ khóa: quốc lộ 5 ngoại ô hà nội bằng xe máy)
  - Vòng cung Hà Giang bằng xe máy: chia ngày và lưu ý đường đèo — `/blog/dia-phuong/ha-giang-vong-cung/` (từ khóa: vòng cung Hà Giang)
  - Đi Hạ Long bằng quốc lộ 18: lộ trình xe máy, lưu ý an toàn — `/blog/dia-phuong/ha-long-duong-quoc-lo/` (từ khóa: đi Hạ Long bằng quốc lộ 18)
  - Hành trình Mai Châu từ Hà Nội: bản Lác, Pom Coọng, Thung Khe — `/blog/dia-phuong/hanh-trinh-mai-chau/` (từ khóa: hành trình Mai Châu từ Hà Nội)
  - Đi Hòa Bình đường trường: từ Hà Nội qua đèo Thung Khe — `/blog/dia-phuong/hoa-binh-duong-truong/` (từ khóa: đi Hòa Bình đường trường)
  - Mèo Vạc hay Đồng Cao bằng xe máy: nên chọn điểm nào — `/blog/dia-phuong/meo-vac-dong-cao/` (từ khóa: Mèo Vạc hay Đồng Cao bằng xe máy)
  - Đi Mộc Châu đường dài bằng xe máy: lộ trình theo quốc lộ 6 — `/blog/dia-phuong/moc-chau-hanh-trinh-dai/` (từ khóa: đi Mộc Châu đường dài bằng xe máy)
  - Đi Ninh Bình bằng xe máy từ Hà Nội: lịch trình hai ngày — `/blog/dia-phuong/ninh-binh-cuoi-tuan-xe-may/` (từ khóa: đi Ninh Bình bằng xe máy từ Hà Nội)
  - … và 6 pillar khác (xem CSV, cột Topic Cluster)

### K18 — Hành trình xa, xuyên Việt

- **Từ khóa đầu cụm:** đi xe máy xuyên Việt
- **Ý định:** du lịch - thông tin
- **Trang trụ cột (pillar):** `/blog/dia-phuong/`
- **Bài trong cụm:** 36 (5 pillar họ chủ đề, 31 bài hỗ trợ)
  - Đi Đà Lạt đường xa bằng xe máy: lộ trình, thuê và trả xe — `/blog/dia-phuong/da-lat-duong-xa/` (từ khóa: đi đà lạt đường xa bằng xe máy)
  - Hành trình Bắc Nam từ Đà Nẵng bằng xe máy: điểm đến và lưu ý — `/blog/dia-phuong/da-nang-hanh-trinh-bac-nam/` (từ khóa: hành trình bắc nam từ đà nẵng bằng xe máy)
  - Huế xuyên Việt bằng xe máy: di sản, văn hóa và cách thuê xe — `/blog/dia-phuong/hue-xuyen-viet/` (từ khóa: Huế xuyên Việt bằng xe máy)
  - Đi xe máy đồng bằng sông Cửu Long: lộ trình quanh Cần Thơ — `/blog/dia-phuong/mekong-delta-ride/` (từ khóa: đi xe máy đồng bằng sông Cửu Long)
  - Đi Sài Gòn bằng xe máy từ Hà Nội: giao thông và lộ trình — `/blog/dia-phuong/sai-gon-duong-nam/` (từ khóa: đi Sài Gòn bằng xe máy từ Hà Nội)

### K19 — Kinh nghiệm thuê xe cho khách du lịch

- **Từ khóa đầu cụm:** kinh nghiệm thuê xe máy Hà Nội · thuê xe máy cho khách du lịch · thuê xe máy tự lái Hà Nội
- **Ý định:** thông tin - thương mại
- **Trang trụ cột (pillar):** `/blog/thue-xe/`
- **Bài trong cụm:** 149 (22 pillar họ chủ đề, 127 bài hỗ trợ)
  - Người nước ngoài lái xe ở Việt Nam: điều kiện và giấy phép — `/blog/an-toan/nguoi-nuoc-ngoai-lai-xe-o-viet-nam/` (từ khóa: người nước ngoài lái xe ở Việt Nam)
  - Áo mưa khi thuê xe máy: chọn loại nào và hỏi gì cửa hàng — `/blog/thue-xe/ao-mua-khi-thue-xe-may/` (từ khóa: áo mưa khi thuê xe máy)
  - Chở người thân trên xe máy thuê: chọn xe, bảo hộ, kỹ năng lái — `/blog/thue-xe/cho-nguoi-than-tren-xe-thue/` (từ khóa: chở người thân trên xe máy thuê)
  - Đặt xe máy trước hay đến trực tiếp: so sánh theo tình huống — `/blog/thue-xe/dat-xe-truoc-hay-den-truc-tiep/` (từ khóa: đặt xe máy trước hay đến trực tiếp)
  - Đồ dùng kèm theo xe thuê: nên có gì và đối chiếu thế nào — `/blog/thue-xe/dongo-kem-theo-xe-thue/` (từ khóa: đồ dùng kèm theo xe thuê)
  - Khách du lịch thuê xe máy ở Hà Nội: chuẩn bị trước khi liên hệ — `/blog/thue-xe/khach-du-lich-thue-xe-may/` (từ khóa: khách du lịch thuê xe máy ở Hà Nội)
  - Liên hệ đặt xe máy nhanh: chọn kênh và chuẩn bị thông tin — `/blog/thue-xe/lien-he-dat-xe-nhanh/` (từ khóa: liên hệ đặt xe máy nhanh)
  - Mùa cao điểm thuê xe máy: thay đổi gì và chuẩn bị ra sao — `/blog/thue-xe/mua-cao-diem-thue-xe-may/` (từ khóa: mùa cao điểm thuê xe máy)
  - Người nước ngoài thuê xe máy ở Việt Nam: bằng lái và thủ tục — `/blog/thue-xe/nguoi-nuoc-ngoai-thue-xe-may-viet-nam/` (từ khóa: người nước ngoài thuê xe máy ở Việt Nam)
  - Phí trễ hạn khi thuê xe máy: cách tính và cách tránh — `/blog/thue-xe/phi-tre-han-khi-thue-xe/` (từ khóa: phí trễ hạn khi thuê xe máy)
  - So sánh thuê xe máy và taxi: chi phí, linh hoạt, tình huống — `/blog/thue-xe/so-sanh-thue-xe-may-va-taxi/` (từ khóa: so sánh thuê xe máy và taxi)
  - Thuê xe chạy dịch vụ: chọn xe, gói thuê và chi phí thực tế — `/blog/thue-xe/thue-xe-chay-dich-vu/` (từ khóa: thuê xe chạy dịch vụ)
  - … và 10 pillar khác (xem CSV, cột Topic Cluster)

### K20 — Bảo dưỡng, sự cố và xử lý khi đi đường

- **Từ khóa đầu cụm:** xe thuê bị hỏng phải làm sao · đổ xăng xe thuê
- **Ý định:** thông tin
- **Trang trụ cột (pillar):** `/blog/huong-dan/`
- **Bài trong cụm:** 38 (6 pillar họ chủ đề, 32 bài hỗ trợ)
  - Bản đồ và định vị khi thuê xe máy: dựng tuyến, đánh dấu điểm — `/blog/huong-dan/ban-do-va-dinh-vi-khi-thue-xe/` (từ khóa: bản đồ và định vị khi thuê xe máy)
  - Đi chợ bằng xe máy thuê: chọn giờ, gửi xe và chở hàng an toàn — `/blog/huong-dan/di-cho-bang-xe-thue/` (từ khóa: đi chợ bằng xe máy thuê)
  - Đỗ xe máy thuê ở Hà Nội: chỗ nào được đỗ, chỗ nào không — `/blog/huong-dan/do-xe-o-ha-noi/` (từ khóa: đỗ xe máy thuê ở Hà Nội)
  - Sửa xe nhỏ khi đang thuê xe máy: báo lỗi, chi phí và tiền cọc — `/blog/huong-dan/sua-xe-nho-khi-dang-thue/` (từ khóa: sửa xe nhỏ khi đang thuê xe máy)
  - Hỗ trợ khi xe thuê gặp sự cố: cách gọi, cửa hàng giúp gì — `/blog/thue-xe/ho-tro-khi-xe-thue-gap-su-co/` (từ khóa: hỗ trợ khi xe thuê gặp sự cố)
  - Hỏng xe giữa đường khi thuê xe máy: dừng, báo cửa hàng, xử lý — `/blog/thue-xe/hong-xe-giua-duong-khi-thue/` (từ khóa: hỏng xe giữa đường khi thuê xe máy)
