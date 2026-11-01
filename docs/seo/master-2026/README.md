# Master SEO Matrix 2026 (lô M1)

Bộ bằng chứng cho **SEO MASTER COMMAND 2026** trên `chatbot.thuexemaynguyentu.com`. Mọi tệp ở đây được
sinh lại từ HTML build và dữ liệu đã cam kết trong repository — không sửa tay.

```bash
node tools/article-qa-snapshot.mjs      # QA nhà máy cho mọi bài đã đăng → article-qa.json
node tools/seo-cwv-lab.mjs              # CWV LAB (cần Playwright + Chromium; không chạy trong CI)
python3 tools/seo-master-2026.py --verify   # workbook + bằng chứng + kiểm công thức bằng LibreOffice
```

| Tệp | Nội dung |
| --- | --- |
| `../MASTER-SEO-MATRIX-2026.xlsx` | 23 sheet bắt buộc + 4 phụ lục (X-COMPETITOR DOMAINS, X-SERP BENCHMARK, X-OFF-PAGE BACKLINKS, X-DATA SOURCES); font Arial, cố định dòng tiêu đề, bộ lọc |
| `summary.json` | Số đo tổng hợp (URL, nguồn, phân loại, QA proxy, kiểm tra kỹ thuật, 12 nhóm hub) |
| `report.md` | Báo cáo ngắn của lô (sinh cùng lúc với workbook) |
| `checkpoint.json` | Lô đã xong, commit đã xác minh, backlog mở, quy tắc tiếp tục |
| `url-inventory.csv` | 1 dòng / URL: nguồn xác nhận, QA proxy, phân loại, lý do |
| `backlog.csv` | Backlog P0–P3 (Technical → Homepage/Pillar → Hub/Silo → Nội dung hiện có → Internal links → Nội dung mới → Nâng cao) |
| `formula-check.json` | Kết quả tính lại công thức EXECUTIVE DASHBOARD bằng LibreOffice headless (phải 0 lỗi) |
| `article-qa.json` | Điểm QA nhà máy (`tools/article-qa.mjs` qua `tools/article-qa-snapshot.mjs`) của từng bài đã đăng |
| `cwv-lab.json` | LCP, CLS, TBT, tương tác chạm menu (proxy INP) theo mẫu trang — **LAB**, không phải field |

## Phương pháp

- **Kiểm kê URL ≥ 3 nguồn**: `sitemap.xml`, mọi `index.html` của site build, đồ thị liên kết nội bộ (phân vùng
  thân bài / nội dung chính / menu-chân trang), manifest `data/blog/published.json`; HTTP live lấy mẫu từ
  `docs/seo/master-task/technical-audit.csv`.
- **Phân loại theo bằng chứng** (chỉ là ứng viên — không gộp, đổi URL, redirect hay noindex trong lô này):
  - `EXPAND`: bài bị QA nhà máy cảnh báo `body-words` (dưới 800 từ) hoặc trang giá dưới 500 từ nội dung chính.
  - `IMPROVE`: cờ nội dung lỗi thời đang mở, cảnh báo QA nhà máy (trừ `local-angle` là dữ liệu matrix của owner),
    chưa gán từ khóa chính, hoặc QA proxy < 85.
  - `CONSOLIDATE-CANDIDATE`: nhiều bài cùng từ khóa chính, hoặc họ biến thể có Jaccard 5-gram ≥ 0,5; `WATCH` từ 0,3.
    Không gộp chỉ vì từ khóa giống nhau; khi có Search Console, thêm điều kiện URL hoán đổi trên cùng truy vấn.
  - `REDIRECT-CANDIDATE` / `NOINDEX-CANDIDATE`: chỉ khi trùng nội dung và ý định đã chứng minh; trang phân trang
    tự canonical là chuỗi hợp lệ, không noindex.
- **QA proxy 100 điểm** (ý định 20, chính xác 20, on-page 15, kiến trúc 15, kỹ thuật 15, UX/media/chuyển đổi 10,
  schema/địa phương 5; mục tiêu ≥ 85) tính từ tín hiệu đo được. Trang phân trang (`…/page/N/` của hub danh mục và hub chủ đề con)
  là trang điều hướng, không nhắm từ khóa: ý định chấm theo việc trang ghi số trang trong title, kiến trúc chỉ cần
  được liên kết từ chuỗi phân trang của nó. Phần "chính xác" chỉ đo cờ nội dung, sổ văn bản
  pháp luật và QA nhà máy — không thay review biên tập/pháp lý.
- **Structured data**: đọc mọi khối JSON-LD; đối chiếu thuộc tính theo tài liệu Google cho Article,
  BreadcrumbList, Organization, LocalBusiness (AutoRental); ghi chú FAQPage không còn rich result (Google, 05/2026)
  và WebApplication không đủ điều kiện rich result khi không có đánh giá thật.
- **NAP/CTA**: so với `data/business/business.json`; liệt kê mọi số điện thoại khác xuất hiện trên site.

## Không bịa số

Search Console, CrUX (CWV field), Google Business Profile và backlink của website chưa có nguồn dữ liệu kết nối:
ô tương ứng ghi `N/A` kèm nguồn thiếu. Volume từ khóa chỉ lấy từ `data/seo/keyword-demand.json` và
`data/seo/battle/keyword-metrics.json` (công cụ + ngày ghi trong tệp). Vị trí SERP là ảnh chụp một thời điểm.
