# Index Monitoring — MotoAI /aichatbot (13 October 2026)

## Evidence, not assumptions

Source: GitHub thuexemayhanoi/aichatbot; canonical https://chatbot.thuexemaynguyentu.com/.

- Matrix: 2,000 rows; **780 PUBLISHED**, 1,220 PLANNED, no REPAIR at snapshot e53bd82bf3f55a48fc6f77a4be3c94cb733c8637.
- Sitemap: **859 distinct URLs**, no exact duplicates; **all 780/780 published pages present**, 79 additional navigation/hubs/pagination/static pages.
- Listing a page in a sitemap is NOT confirmation Google indexed it.
- The read-only offline coverage audit is tools/seo-index-coverage.mjs; daily workflow uploads its JSON report with existing site-audit and live checks.

## Google Search Console — subdomain property

Connected source: Windsor.ai Search Console, account https://chatbot.thuexemaynguyentu.com/. Data fetched 13 October for 1–12 October, latest finalized day returned: **10 October 2026**.

| Day | Impressions | Clicks | Avg position |
| --- | ---: | ---: | ---: |
| 9 Oct | 12 | 0 | 6.08 |
| 10 Oct | 118 | 3 | 10.96 |
| Observed total | **130** | **3** | Not a simple mean |

Observed aggregate CTR: **2.31%** (3 clicks / 130 impressions).

44 page rows were returned, including:
- 43 impressions / 2 clicks / position 7.84 for https://chatbot.thuexemaynguyentu.com/blog/dia-phuong/ho-tay-va-xe-may/
- 31 impressions / 1 click / position 5.74 for https://chatbot.thuexemaynguyentu.com/blog/dia-phuong/du-lich-hoan-kiem-bang-xe-may/

Nine query/page rows were returned and cannot justify claims about all keyword cannibalization. Query rows are routinely partial.

Three returned page URLs include /index.html instead of directory-slash form:
- /blog/huong-dan/doi-xe-giua-ky-thue/index.html
- /blog/huong-dan/tinh-lo-trinh-thue-xe-theo-ngay/index.html
- /blog/xe-dien/khac-biet-xe-dien-va-xe-xang/index.html

Do not redirect without verifying Google-selected canonical and actual HTTP responses; these rows are NOT proof of duplicate indexed pages.

## Sitemap connector lag

- Sitemap path: https://chatbot.thuexemaynguyentu.com/sitemap.xml
- Windsor GSC sitemap record: submitted=365, indexed=0, last submitted 8 Oct 10:34 UTC, last downloaded 8 Oct 11:03 UTC, errors=0, warnings=0.
- These are older than the latest 859-URL sitemap. The field indexed=0 is not an index census, especially when actual search impressions exist. Confirm with fresh GSC Page indexing report filtered to this sitemap and URL Inspection.

## Operational checklist

1. Run locally or in the daily workflow: node tools/seo-index-coverage.mjs --json. It only checks generated sitemap against Matrix PUBLISHED and manifest. No network or credentials.
2. Use the exact chatbot subdomain GSC property. Open **Page indexing**, filter **All submitted pages** or the specific sitemap, and record date, indexed/not-indexed totals and top exclusion reasons. This data is not currently exposed by the connected performance-only API.
3. Inspect the two pages with clicks, the one-per-category samples and eight most recent articles listed in the report, plus three /index.html URL aliases. Record Google-selected canonical for each.
4. For an authorized local GSC page-performance export (JSON array), run: node tools/seo-index-coverage.mjs --json --gsc-pages /private/path/gsc-pages.json. Do not check private exports or tokens into the public repo. These results remain **performance observations** and never URL Inspection proof.
5. Prioritize verified canonical conflicts, errors, crawl blocks and low-value content groups. Do not mass-noindex, redirect, merge or rewrite PUBLISHED articles from sitemap mismatch alone.
6. Compare 7-day and 28-day finalized GSC metrics after the updated sitemap is processed; not merely the count of Writer-produced articles. Protect the Single External Writer and publication matrix.

## Official references

- https://support.google.com/webmasters/answer/7440203 — Page indexing
- https://support.google.com/webmasters/answer/7451001 — Sitemaps report
- https://support.google.com/webmasters/answer/96568 — Data limitations
- https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site — site: is not exhaustive

This is a dated evidence snapshot. Writer activity can change published and sitemap counts.
