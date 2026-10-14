# Dữ liệu hiệu suất thật (công tắc DATA-DRIVEN)

Thư mục này đang trống, nên `tools/seo-cold-start.mjs` chạy ở chế độ **ZERO-DATA** (chỉ dùng SERP thật + nhu cầu từ khóa đo bởi công cụ bên thứ ba).

Khi website có dữ liệu thật:

1. Xác minh Google Search Console (và Bing Webmaster Tools) cho đúng thuộc tính `https://chatbot.thuexemaynguyentu.com/`.
2. Trong Search Console → Hiệu suất → Xuất → CSV, lấy bảng **Truy vấn** và/hoặc **Trang** (giao diện tiếng Việt hoặc tiếng Anh đều đọc được), hoặc xuất JSON từ Search Console API (`rows[].keys/clicks/impressions/ctr/position`).
3. Đặt tệp `.csv`/`.json` vào thư mục này rồi chạy `node tools/seo-cold-start.mjs`: chế độ tự chuyển sang **DATA-DRIVEN** và sinh `docs/seo/cold-start/data-driven.md` (truy vấn vị trí 4–20, trang có hiển thị nhưng chưa có nhấp).

Chỉ đặt bảng số liệu tổng hợp (truy vấn/trang, nhấp, hiển thị, CTR, vị trí) — không đặt token, mật khẩu hay dữ liệu cá nhân. Nếu không muốn công khai số liệu, chạy công cụ trên máy cục bộ và không commit tệp xuất (khi đó không commit `data-driven.md`, vì CI sẽ thấy chế độ ZERO-DATA).

Không tạo tệp mẫu/giả ở đây: test `tests/unit/seo-cold-start.test.js` kiểm tra repo không có tệp xuất khi chưa có dữ liệu thật.
