# Blog shared presentation — audit & runbook

- Static blog: 2,000 bodies in `data/blog/articles` + `data/blog/published.json`; rendered by `tools/build-blog.mjs`.
- One site shell: `tools/app-shell.mjs` (header, footer, SEO head/canonical, CTA).
- One shared UI config: `config/blog-ui.json` (CTA, banner, summary, related posts title/count).
- One lightweight slot/validation module: `tools/blog-components.mjs`.
- Design tokens: `assets/css/style.css` (light/dark); blog glass tokens and responsive CSS: `assets/css/blog.css`.
- Business/NAP: `data/business/business.json`; pricing: `data/business/pricing.json`.
- Navigation/taxonomy: `config/navigation.json`, `data/blog/taxonomy.json`.
- Schema Article/BreadcrumbList, canonical URLs, article related links, sitemap and internal link generator remain centralized in `tools/build-blog.mjs`; metadata head and footer centralized in `tools/app-shell.mjs`.

Change one shared source, never 2,000 per-article HTML files. Defaults are byte-equivalent to current visible UI; banner is opt-in (`enabled: false`). To enable, set text and internal href in the same config. All customizations must retain URLs, prose, NAP and verified business data.

On push to main, `.github/workflows/blog-shared-rebuild.yml` rebuilds generated pages/indexes/sitemap and runs full tests plus site/SEO audit, then pushes generated outputs. It retries using fresh main after writer race. No new dependencies. Local QA: `node tools/build-blog.mjs && node --test && node tools/site-audit.mjs && node tools/seo-score.mjs`.
