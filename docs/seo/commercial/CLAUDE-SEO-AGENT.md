# CLAUDE SEO AGENT — RESUMABLE COMMERCIAL MISSION

Repo: thuexemayhanoi/aichatbot
Site: https://chatbot.thuexemaynguyentu.com/
Owner approval: 2026-10-29.
Primary query: **cho thuê xe máy ở Hà Nội**.
Main goal: compete for the full Hanoi commercial keyword market, aiming at Google positions 2–10, subject to evidence. Never promise position or traffic.

## Authority and scope

The owner authorizes SEO research, technical audit, keyword ownership planning, editorial QA, metadata changes via existing reviewed layers, contextual internal linking through existing tools, documentation and safe publishing. Owner authorizes **no paid service, API key or subscription**. The image factory is paused for this mission. No need to request approval between safe 2–30 URL editorial batches. Ask only if a consequential business claim, paid action or destructive change would be required.

Root AGENTS.md and the live existing workflow contracts remain binding. This guide supersedes the OLD instruction to cede Hanoi commercial keywords to sister domains. config/seo-ownership.json v2 is the policy source. Do not alter a different website.

## Read first / source of truth

1. AGENTS.md, docs/seo/commercial/README.md, this document.
2. config/seo-ownership.json and config/site-pages.json.
3. data/blog/content-matrix.csv and data/blog/published.json (2.006 published URLs).
4. data/seo/article-meta.json (reviewed live title/description when present).
5. docs/seo/commercial/SEO-COMMERCIAL-2006.csv and SEO-COMMERCIAL-TARGETS.csv.
6. data/business/business.json, data/business/pricing.json, docs/ARTICLE-RULES.md.
7. docs/seo/master-task/checkpoint.json and docs/seo/seo-master-matrix.json.
8. Current Google Search Central docs and dated SERP evidence, not old claims.

## Commercial keyword ownership

- Homepage: cho thuê xe máy ở Hà Nội and exact-close variants; plan title/H1/lead/CTA to represent genuine commercial service **plus** Agent as supporting feature. First audit current homepage and site app schema. Do not instantly replace the live homepage without tests.
- /gia-thue/: prices, day/week/month comparisons, transparent deposits, verified model prices.
- /lien-he/: real NAP, opening hours, Maps, booking/contact options; do not assert open now without checking current time.
- /agent/: keep assistant/WebApplication focus; do not falsely claim native App Store/Google Play availability or automated reservation confirmation.
- Hubs: /blog/thue-xe/, /blog/xe-dien/, /blog/dia-phuong/, /blog/huong-dan/, /blog/app/, /blog/an-toan/.
- Each article gets one distinctive principal intent and contextual variants; do NOT inject the head phrase into all 2,006 titles, H1s or anchor texts.
- Local city districts only when place-specific details, distinct intent and real service coverage justify them. Not 51 boilerplate location doorways.

## Execute in safe phases

PHASE 0 — Baseline (one time):
- Confirm main HEAD + clean changes, latest source matrices, 2.006 actual published articles, sitemap and indexability.
- Run node tools/seo-commercial-matrix.mjs --check. Regenerate if stale.
- Check current CI, Pages deploy, canonical, robots, sitemap, H1, structured data, business facts, date-sensitive legal pages. Do not downgrade any live URL.
- Import measured GSC/GA4 if connected and permitted. If absent, mark NOT_MEASURED; never invent positions, volume, impressions, CTR, KD, backlinks or competitor numbers.
- Flag title/keyword collisions, mapping of the main commercial query, and conflicts with old reports. Fix only with the corresponding source generator.

PHASE 1 — Commercial P0:
- Audit homepage, /gia-thue/, /lien-he/, /agent/ and commercial hub before editing. Establish that homepage truly supports a commercial intent, verified offer and clear human contact; retain Agent product.
- Test proposal for indexability, schema, meta title, clear H1, click/mobile UX, conversion and facts.
- Review SERP intent and competing pages in actual Google results. Do not promise Top 2–10.
- Publish only when title, H1, description, body, canonical and structured data agree. Use pull request/CI/QA. Do not claim done without live verification.

PHASE 2 — 2.006 URLs, ongoing:
- Work P0_REVIEW and P1 rows first. Process **30 per checkpoint**, 2–10 per editorial push if permitted by the external-writer contract. Record article IDs.
- For each article: inspect live/current body and primary keyword; verify unique search intent and target owner URL; identify what the user actually needs; compare sources and dated SERP examples; propose stronger non-spammy title, H1, summary, subheadings, FAQ if genuinely useful, contextual links, verified facts and clear CTA only if relevant.
- No mandatory Google word count. Aim substantial content often 1,600–5,000 words when genuinely useful; never expand filler. Existing writer contract and critical QA gates are not lowered.
- Existing PUBLISHED body is protected; metadata edits use data/seo/article-meta.json and its approved builder; body corrections use established source/patch/review workflow, not bulk overwrites.
- Article primary keywords must not equal the homepage commercial head, except homepage itself. Don't cannibalize price/contact/Agent owners.
- Law pages: official primary legal source, validity/effective date, exemptions and exact scope; no unsupported assertions.
- Electric models/50cc: no false claims about stock, range or legal license requirements.
- Do not auto-create images: image pipeline is a separate, quota-blocked task.

PHASE 3 — Technical and authority:
- Audit broken external references, internal links, category breadcrumbs, helpful anchor texts, indexable URLs, canonical, sitemap, schema appropriateness, mobile performance and accessibility.
- Natural local entity information and public citation sources only. No link purchases, fake reviews, manufactured ranking, link exchanges or doorway networks.
- Only change shared components at their source. Preserve stable URLs, traffic and working pages.

PHASE 4 — Measurement:
- When GSC is available, group queries by landing page, impressions, CTR, position and change. Prioritize real demand + weak CTR/low average position where intent matches; remeasure after crawl.
- Track top-10 and top-3 query groups separately, qualified calls, contact clicks and real customers. Never treat a single SERP screenshot as permanent ranking.
- Make report: done/failed/blocked/next and before-after evidence every 30 URLs.

## SEO batch log template

Batch ID, branch, commit SHA, start/finish, baseline GSC date, article IDs, old URL/title/keyword, proposed owner/intent, actual content edits, internal links added, sources verified, unit tests, site audit, SEO score, Pages deploy SHA, actual live verification, remaining count, blockers, next start ID.

## Mandatory stop gates

- If facts, inventory, prices, legal applicability, NAP or ownership ambiguous: mark REVIEW_REQUIRED, do not publish that claim.
- If another agent is writing/publishing simultaneously: coordinate via the single-writer contract. Do not force-push, delete checkpoint, bypass lock or rewrite 2006 bodies.
- If CI, sitemap or canonical regresses: stop publishing, revert narrowly, report.
- If quotas end: commit checkpoint and stop; next user message “Tiếp tục” means resume the last verified checkpoint rather than restart or ask the owner to repeat the brief.

## Google policy guardrails

https://developers.google.com/search/docs/essentials/spam-policies
https://developers.google.com/search/docs/fundamentals/creating-helpful-content
https://developers.google.com/search/docs/appearance/title-link

Success is better user value, technically healthy and measured progress, not declaring victory based on simulated scores. The target of Top 2–10 is ambitious and unguaranteed.
