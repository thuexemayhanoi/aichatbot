# MotoAI FULL COMMERCIAL SEO — 2.006 URL

Date: 2026-10-29
Website: https://chatbot.thuexemaynguyentu.com/
Repository: thuexemayhanoi/aichatbot
Principal query: **cho thuê xe máy ở Hà Nội**
Target: **Google positions 2–10** for commercial head queries, as an aspiration, NEVER a guarantee.

## Owner-approved policy

MotoAI may target all relevant commercial search terms independently of other websites owned by the same business. The old sister-site commercial exclusion is superseded by config/seo-ownership.json v2. However, only one canonical URL within this repository should own each search intent. Do not generate near-identical doorway or location pages, fabricate business information, or spin content from other sites.

## Deliverables

- SEO-COMMERCIAL-2006.csv: **one source-grounded row for each published article**. Article ID, exact existing URL, original title and keyword, reviewed meta if available, proposed title, semantic keywords, cluster, page role, parent hub, conversion target, schema, internal links, legal gate, conflicts, priority, action and KPI state.
- SEO-COMMERCIAL-TARGETS.csv: **22 commercial keyword clusters**, semantic variants, candidate owner URLs and priorities.
- SEO-COMMERCIAL-ARCHITECTURE.csv: homepage, price, contact, Agent and category hubs.
- SEO-COMMERCIAL-DASHBOARD.csv: deterministic count and collisions.
- SEO-COMMERCIAL-SUMMARY.json: machine-readable counts.
- docs/seo/AICHATBOT-SEO-MASTER-MATRIX.xlsx: the existing master workbook, enhanced with **four commercial SEO sheets** (13 total sheets).

These files are generated from actual published data/blog/content-matrix.csv and data/seo/article-meta.json. They are a PLAN ONLY: none of the proposed titles automatically overwrites live pages.

## Canonical intent owners

| Intent | Existing URL |
|---|---|
| cho thuê xe máy ở Hà Nội, cho thuê xe máy Hà Nội, thuê xe máy Hà Nội | / |
| giá thuê xe máy Hà Nội / bảng giá | /gia-thue/ |
| thuê xe máy gần đây / địa chỉ / tư vấn | /lien-he/ |
| Ứng dụng web, trợ lý thuê xe máy | /agent/ |
| Các loại xe, theo ngày/tuần/tháng, 50cc, Honda Vision | /blog/thue-xe/ and matching unique article |
| Xe máy điện, xe đạp điện, pin, sạc | /blog/xe-dien/ and matching unique article |
| Long Biên, Hoàn Kiếm, Phố Cổ, Tây Hồ, Ba Đình | /blog/dia-phuong/ and distinct local articles |
| Giấy tờ, hợp đồng, tiền cọc | /blog/huong-dan/ |
| Bằng lái, luật và an toàn | /blog/an-toan/ |
| Cách dùng MotoAI | /blog/app/ |

22 head clusters do NOT mean 22 new landing pages. Multiple closely related terms can have ONE URL. Existing hub URLs in the targets sheet are initial candidates; Claude must confirm the winning unique article/intent with live content and SERP before changing production metadata.

## Source and no fabrication

Business NAP and hours: data/business/business.json. Prices: data/business/pricing.json. Do not borrow another brand's NAP, assume inventory, invent a deposit alternative, conflate deposit with rental price, or claim an unverified delivery area. Verify legal claims against authoritative rules and effective dates. Use editorial/SEO metadata review rather than writing over published article bodies.

GSC rankings, clicks, impressions and CTR are NOT MEASURED in this repository. Goal Top 2–10 is not an estimate, promise or current rank. No invented search volume, DR/DA or competitor positions. Add dated measured data when connected.

## Rebuild

1. node tools/seo-commercial-matrix.mjs
2. node tools/seo-commercial-matrix.mjs --check
3. python3 tools/seo-master-workbook.py --date 2026-10-29
4. node --test
5. node tools/site-audit.mjs
6. node tools/seo-score.mjs

Generation also runs through the Commercial SEO Matrix GitHub workflow. The workbook and CSV outputs must be generated, never manually overwritten.

## Agent continuation

Read docs/seo/commercial/CLAUDE-SEO-AGENT.md and root AGENTS.md. Work in controlled batches, checkpoint every 30 URLs, no pay-per-call API, no image work. Preserve 2006 existing URLs and the site/app behavior. Report unresolved problems instead of faking success.

## Google Search documentation

- https://developers.google.com/search/docs/essentials
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/appearance/structured-data/local-business

The older keyword-cluster-map report still contains historical sister-site exclusions until regenerated. When they conflict, the new owner approval in config/seo-ownership.json and this plan prevail; regenerate the derived reports with their own generator rather than silently deleting URLs.
