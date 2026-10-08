# Custom-domain migration and technical SEO audit — 2026-10-08

Canonical public root: https://chatbot.thuexemaynguyentu.com/

| Check | Result |
|---|---:|
| Migration gate | PASS |
| PUBLISHED articles | 304 |
| Topic matrix rows | 2000 |
| Generated pages / sitemap URLs | 365 / 365 |
| Legacy project-path URLs in public runtime/source | 0 |
| Legacy GitHub Pages URLs in public runtime/source | 0 |
| Broken internal links / assets | 0 |
| Internal URLs checked offline | 33516 |
| Local weighted SEO score on custom domain | 99.1/100 |
| Full npm test | 880 passed; 0 failed |

The hard migration gate audits runtime assets, HTML, source fragments, JS imports, CSS URLs, navigation, search/knowledge indexes, PWA, robots, sitemap and schema. All generated pages, including 32 subtopic hubs and 12 paginated category pages, have self canonicals and matching OG/schema URLs. The sitemap includes every generated page. robots.txt declares the custom-domain sitemap.

## Root causes fixed

- `src/config/site.js`: shared canonical site root for builders and SEO checks.
- `tools/app-shell.mjs`, `tools/build-blog.mjs`, `tools/taxonomy.mjs`, `config/navigation.json`: root routes, generation, navigation, article/search/knowledge URLs, pagination schema and sitemap coverage.
- `tools/seo-score.mjs`: root-relative and same-origin absolute links are checked; all generated pages are scored; migration failures force FAIL and zero score with a nonzero CLI exit.
- `tools/site-audit.mjs`: hard migration gate, with regression tests in `tests/unit/custom-domain.test.js` that inject stale URLs, bad origins and broken links.
- `index.html`, `assets/js/app-shell.js`, `manifest.webmanifest`, `service-worker.js`: canonical root, business-data fetch, PWA scope/id/start_url, cache version v66 and safe root offline fallback.
- Blog/legal bodies and embed/WordPress/mobile examples: mechanical URL migration only; derived pages rebuilt with the existing generator.
- CI, Distribution and Blog Factory Publish: custom-domain gates; CI also checks deterministic rebuilds.
- `tests/unit/factory-progress.test.js`: fixes a pre-existing CI failure from comparing a stale production report with a current fixture; verifies production-file isolation directly.

## SEO polish and preserved behavior

OG/Twitter images use an existing lightweight same-origin icon. Articles declare OG type `article` and their schema URL. Homepage FAQs appear below the chatbot and match existing schema and verified facts. The chatbot remains the first main screen. No remote inference endpoint, backend or dependency was added.

All article body changes are limited to URLs (plus one trailing-space cleanup). The published manifest, 2000-row matrix, taxonomy, business facts and pricing are byte-identical to the pre-migration commit. Article IDs, PUBLISHED status and factory architecture are preserved. Generated icons and the WordPress plugin ZIP also passed distribution checks. Base JavaScript is 231930 bytes, within the existing 232000-byte guard.

## Limits of the numeric score

This is a repository-local heuristic score, not a Google score or proof of indexing/ranking. The full score report retains 181 advisory findings, including meta-length preferences, list/Q&A presence and deposit-keyword heuristics. Article content was not rewritten to remove these or inflate the score. Migration and broken-link checks independently pass with zero errors.

Historical dated reports and explicit negative-test fixtures can retain old URLs as evidence; they are excluded from the public runtime migration count. Current SEO reports use the new domain. Post-push CI/Pages and live checks are reported separately at completion.
