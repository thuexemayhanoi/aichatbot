# SEO Ownership — repo `thuexemayhanoi/aichatbot`

Bản quyền SEO của repo này là **APP / WEB APPLICATION / DIGITAL RENTAL ASSISTANT** (trợ lý thuê xe số). Cấu hình máy đọc được: `config/seo-ownership.json` (kiểm thử: `tests/unit/blog-foundation.test.js`).

## 1. Từ khóa quốc gia repo này SỞ HỮU

Primary (must-win):

- app thuê xe máy
- ứng dụng thuê xe máy
- app thuê xe điện
- ứng dụng thuê xe máy điện

Secondary (hỗ trợ ngữ nghĩa):

- ứng dụng thuê xe
- app tìm xe máy thuê
- công cụ tính giá thuê xe máy
- trợ lý thuê xe máy
- chọn xe máy phù hợp
- ứng dụng tìm xe máy
- thuê xe máy online
- thuê xe điện online

Homepage (`/aichatbot/`) là landing page cho cụm này: H1 “Ứng dụng thuê xe máy & xe điện”, schema `WebApplication` + `Organization` + `FAQPage`.

## 2. Phạm vi quốc gia = INTENT, không phải tồn kho

“National SEO” ở đây nghĩa là nội dung informational/product mang tầm quốc gia (cách dùng app, chọn xe điện, an toàn, thủ tục). KHÔNG tuyên bố cung cấp dịch vụ cho thuê toàn quốc. Mọi thông tin về tình trạng còn xe, vùng phục vụ, giá, cọc, giờ mở cửa phải lấy từ `data/business/business.json` — dữ liệu đã xác minh.

## 3. An toàn cross-repository (chống cannibalization)

Repo khác trong tổ chức có thể sở hữu intent thương mại địa phương:

- `thuexemayhanoi/shop`, `thuexemayhanoi/vanchinh` → sở hữu intent “thuê xe máy Hà Nội” / “cho thuê xe máy Hà Nội” (commercial landing trực tiếp).

Quy tắc bảo vệ (cấu hình trong `config/seo-ownership.json` → `protected_commercial_intents`):

- Repo này KHÔNG tạo homepage/landing riêng nhắm đúng từ khóa thương mại generic đó.
- Homepage title KHÔNG chứa “thuê xe máy Hà Nội” (test chặn).
- Bài LOCAL trong blog được phép nhắm chủ đề Hà Nội (Phố Cổ, Long Biên, Hồ Tây…) nhưng phải có góc độ riêng: hành trình cụ thể, kết hợp Agent/app, tips informational. KHÔNG sản xuất hàng loạt “app thuê xe máy quận X” chỉ đổi tên quận (test doorway guard).
- Mỗi bài chỉ thuộc đúng MỘT danh mục; không đăng hai bài cùng primary intent trùng lặp (QA duplicate-intent gate trước khi publish).

## 4. Nguyên tắc năng lực sản phẩm

Không bao giờ giới thiệu sản phẩm này là app native trên App Store / Google Play. Chữ dùng đúng: “ứng dụng web”, “Agent”, “công cụ trực tuyến”. (Test: homepage không chứa “app store”/“google play”.)

## 5. Kiểm thử liên quan

- `tests/unit/blog-foundation.test.js` — ownership, homepage intent, schema, sitemap, indexes.
- `tests/unit/seo-ownership` nằm gộp trong blog-foundation (protected keywords + docs tồn tại).
