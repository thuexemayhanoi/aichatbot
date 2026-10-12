# MotoAI SEO Audit & Monitoring — 2026-10-13

## Scope and ownership

Repository: thuexemayhanoi/aichatbot. Canonical: https://chatbot.thuexemaynguyentu.com/.
This repo owns APP / WEB APPLICATION / DIGITAL RENTAL ASSISTANT intent, not the generic commercial query "thuê xe máy Hà Nội"; see config/seo-ownership.json.

The active writing contract is AGENTS.md: one external author writes actual prose; Blog Factory alone publishes PUBLISHED articles from the 2,000-slot matrix. No SEO automation may edit content-matrix.csv, published.json, published bodies, writer locks, transactions, blog pages, or run legacy auto-writers.

## Independent read-only monitor

- Workflow: .github/workflows/seo-audit-monitor.yml (daily at 02:17 UTC and manual dispatch).
- Offline: tools/site-audit.mjs checks canonical, sitemap, robots, internal links, JSON-LD and indexability signals for generated pages; tools/seo-score.mjs provides a repository heuristic, not a Google ranking score.
- Live: tools/seo-live-monitor.mjs GETs deployed robots.txt and sitemap.xml and samples home, blog, price, contact and one article from each available category. Checks HTTP, redirects, canonical, lang, one H1 and parseable JSON-LD.
- Reports are GitHub Actions artifacts (14 days) and job summaries. Workflow needs no secrets, makes no commits and does not trigger the external Writer.
- Sampled HTTP results do not establish indexation. Unindexed-page diagnoses require Google Search Console / Bing Webmaster Tools URL inspection or search performance data.

## Seven-area priority matrix

| Area | Current guard / next evidence | Priority |
| --- | --- | --- |
| Technical SEO | Offline gate plus new live smoke. Validate canonical, sitemap coverage, redirects, true HTTP 404s and Google indexing reports. | P0 |
| Architecture/on-page | Keep APP intent ownership; use existing pillar/hub/category links, static titles/metas/H1; audit URL-intent collisions before merging. | P0 |
| Performance/CWV | Run Lighthouse mobile and CrUX field data for actual LCP/INP/CLS; test Quick Call / Agent startup and lazy-loading. Do not invent scores. | P1 |
| Schema/entity | Check WebApplication, LocalBusiness/Organization, Article and BreadcrumbList where appropriate. Verify against business source; no fake reviews or blanket FAQPage. | P0 |
| GEO/AEO | Provide concise first-paragraph answers and verifiable sources in article bodies. An llms.txt file is optional discovery, not a Google ranking factor. | P1 |
| E-E-A-T/local trust | Confirm NAP, actual bike photos, prices, deposits, authorship and legal primary sources for 50cc/licensing. | P0 |
| Off-page | Editorially relevant mentions from real travel/local sources; no paid link schemes or cross-domain anchor rings. | P2 |
| Index/maintenance | Configure GSC and Bing at the exact subdomain property; ingest clicks, impressions, CTR, positions, indexing and intent collisions when authorized. | P1 |

## P0 business data discrepancies flagged during audit

The shared data/business/pricing.json does not fully match the approved Nguyễn Tú price sheet:
- Honda Vision weekly value in repo: 800,000–1,000,000 VND; reference: 1,000,000 VND/week.
- Honda Air Blade repo: 800,000 VND/week and 1,400,000 VND/month; reference: 1,000,000 VND/week and 1,500,000 VND/month.
- Business address omits Bồ Đề; its Maps link is a shortened redirect rather than the approved CID URL.

Correction must be atomic: update shared facts, rebuild dependent pages, run node --test plus price/chat golden tests, and inspect deployed pages before merging. Do not make up deposit exemptions or delivery costs. Prices remain illustrative until confirmed with the business.

## Measurement policy

VibeSEO's currently visible project is for thuexemaynguyentu.com, not this chatbot subdomain. Its AI-visibility results must not be attributed to chatbot.thuexemaynguyentu.com. GSC/Bing search impressions, click-through and actual index status remain unmeasured here without authorized property data.

## Release criteria

1. Rebase on fresh main and inspect active production Writer.
2. Run node --test; node tools/build-blog.mjs then git diff --exit-code for generated files; node tools/site-audit.mjs; node tools/seo-score.mjs.
3. Confirm CI + Distribution + Pages on merged SHA. Confirm monitor runs successfully and review live artifacts.
4. Never modify publication status or move canonical URLs merely to increase article count.
