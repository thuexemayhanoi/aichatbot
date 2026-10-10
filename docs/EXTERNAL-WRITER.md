# External AI Writer — QUICK START (/aichatbot)

**Active production path:** a single AI outside GitHub Actions writes the actual article body. `blog-factory-publish.yml` performs deterministic registration, scoped QA, publication, Pages verification. No Ollama, no local model runner, no AI API keys in Actions.

## 1. First commands

```bash
git fetch origin main && git switch main && git pull --ff-only origin main
node tools/external-writer.mjs next
```

The `next` command lists pending QA/REPAIR IDs and up to 10 unregistered PLANNED IDs with the **exact file paths**. Use matrix rows as truth. Never infer ID by the largest number: existing publications can have nonconsecutive IDs.

## 2. Writing

Write 2 (up to 10) real HTML fragments directly under `data/blog/articles/<slug>.body.html`.

- Content-only fragment: h2/h3/p/ul/li, actual useful Vietnamese prose; no html/head/body/H1/script tags. Title, page shell, meta, JSON-LD, internal hub/navigation and canonical are derived by tools already in the repository.
- Editorial target **800–2.000 useful Vietnamese words**; unique angle, concrete helpfulness, no recycled paragraphs.
- Factual business fields from `data/business/business.json`. This repository represents Nguyễn Tú, **NOT** Văn Chính. Do not invent deposits, prices, hours, phone numbers, legal penalties or vehicle specifications.
- For legal topics, verify claim, applicable vehicle/person type, effective date, article and government primary source before writing.
- Do not write directly to `published.json`, matrix or `docs/state`; the workflow registers metadata and handles state transitions.

Use your external AI platform's GitHub connection to push the body source files, or commit from a terminal. Work in small pushes to minimize conflicts:

```bash
git add data/blog/articles/<slug-1>.body.html data/blog/articles/<slug-2>.body.html
git commit -m "content: external writer BA-XXXX BA-YYYY"
git pull --rebase origin main
git push origin main
```

Replace the slugs and IDs with real values from `node tools/external-writer.mjs next`. No force push. When authoring a repair, change only the corresponding unpublished body.

## 3. What happens after the push

```
push 1..10 body files to main
 → GitHub Actions: Blog Factory Publish
 → external-writer register (create missing draft records from the matrix)
 → factory-select exact pushed body IDs (new / repair)
 → transaction recovery only when a marker exists
 → prepare-chunk → article scoped QA (score >=70, no critical failure)
 → publish-chunk PASS articles (grouped transaction + one deterministic site build)
 → commit manifest + matrix + blog + sitemap + search index
 → Pages verification and publication receipts
```

Source articles are never overwritten by the build. Rejected articles remain pending repair; passing articles can publish independently.

## 4. Check result, resume

- GitHub Actions: https://github.com/thuexemayhanoi/aichatbot/actions
- True published count: `data/blog/published.json` is a catalog, but verify `data/blog/content-matrix.csv` status `PUBLISHED` and per-article production evidence.
- Run `node tools/external-writer.mjs next` again *after fetching fresh main*. If QA fails, fix the actual content; do not weaken tests or fake markers.
- If a previous run stopped after pushing source bodies but before committing the generated manifest, repeat the exact body push with an actual content correction; workflow regeneration will register it and process it. Never manually reset the 2,000-row matrix.

## 5. Scope and retired architecture

Active Actions: `blog-factory-publish.yml` (content publisher), `ci.yml`, `distribution.yml`. The 9 former autonomous/ops workflows are disabled at event and job level, preserved only for regression/incident history; they must never be re-enabled without an explicit owner decision. `src/ai` is optional **chatbot UI code**, not an article writer; the migration does not remove unrelated chatbot features.

The system will NOT autonomously call the external AI, start a new AI chat or write 1,670 articles on its own. The external AI must have an active session and the required GitHub permission to create the HTML body files; the deterministic publisher handles the rest.
