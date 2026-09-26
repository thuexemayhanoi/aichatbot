# TESTING — MotoAI test strategy

Run: `npm test` (alias for `node --test`). CI runs the same.

## Layout

```
tests/unit/          # one file per module (nlu, rules, search, ai, storage, context, utils)
tests/integration/   # conversations.test.js, embed.test.js, golden.test.js
tests/regression.test.js  # historical regression locks (e.g. "50cc is never a duration")
tests/helpers/       # data loaders, engine fixture, storage stubs
```

## Suites

| Suite | Purpose | Gate |
|---|---|---|
| unit | every module contract | must be green |
| integration/conversations | multi-turn, slots, follow-up references | must be green |
| integration/embed | widget contract: attributes, isolation, duplicate guard, escape/focus | must be green |
| integration/golden | Golden Conversation regression incl. business-fact gates | must be green, 100% fact accuracy |
| regression | never-regress locks | must be green |
| unit/model-selection | model được chọn động, luôn tồn tại trong model_list, empty list → graceful | must be green |
| unit/privacy | không inference endpoint, không API key, outbound URL chỉ CDN tĩnh | must be green |
| unit/ui-tokens | token palette tồn tại, không dùng đỏ lỗi làm màu chính, a11y (focus-visible, reduced-motion, 16px input, safe-area) | must be green |

## Non-negotiable gates

1. Business-fact accuracy **100%**: wrong prices 0, wrong address 0, invented policy 0, hallucinated facts 0.
2. Golden expectations are computed from `data/business/*.json` — never hard-coded strings, so data changes automatically re-baseline tests.
3. Local-AI tests simulate init failure / no-WebGPU and assert the fallback path (never blank screen).
4. Never delete a test to get green. If a test is wrong, prove why in a commit message.

## Adding tests

- New business behavior → unit test + at least one golden conversation case.
- New embed attribute → extend `tests/integration/embed.test.js`.
- New slang/typo handling → add cases to golden suite (typo, no-accent, mixed vi/en batches exist as groups).
- Matrix row for the feature should reference the test file in its `evidence` column.

## v44 — hybrid intelligence suites

- `tests/unit/rider.test.js` — rider/trip entity parsing (height, experience, transmission, budget, luggage, usage, destination, electric), "50cc never a height", vi/en language detection.
- `tests/unit/dates.test.js` — date ranges: inclusive day counts, invalid/reversed ranges rejected, leap years, 2-digit years, Vietnamese/English connectors.
- `tests/unit/analyze-turn.test.js` — `analyzeTurn` + `planTurn`: resolved entities (context merge, turn wins), missing entities, route gating (price → NO LLM).
- `tests/unit/recommender.test.js` — deterministic recommendation: verified models only, no invented specs, height → missingInfo, budget filter, transmission filter.
- `tests/unit/rental-calculator.test.js` — 1/7/12/30 days, transparent cheapest-package breakdown, 35-day comparison sorted, unpriced = null.
- `tests/unit/hybrid.test.js` — deterministic reranker (max-normalization, tie-break by id), hybrid retriever with stubbed local embeddings, BM25-only degradation, irrelevant-query rejection.
- `tests/unit/fact-guard.test.js` — Fact Guard v2: invented prices/phones/hours rejected; verified numbers pass; legacy guardFacts intact.
- `tests/integration/multi-turn.test.js` — golden multi-turn A–G: follow-up keeps Vision, height carries into recommendation, Wave 12 ngày breakdown, 150k budget, English context, "Không, Air Blade cơ" override, "xe 50cc" never 50 days; date-range pricing; English durations; comparison; resetContext.

Total: **393 tests** (was 317). No old assertion weakened; slot-shape tests updated to the extended context-memory schema.
## v45 — distribution suites

- `tests/unit/wordpress-plugin.test.js` — cấu trúc plugin, header chuẩn WP, Settings API (capability + nonce), sanitize/escape toàn vẹn, loader đúng URL canonical + async + once-guard, data-attribute đầy đủ, visibility rules, shortcode whitelist, uninstall sạch, không secrets/endpoints.
- `tests/unit/wordpress-zip.test.js` — ZIP tất định (2 lần build byte-identical), root `motoai-agent/`, đủ file, không dev files, CRC từng entry, không secrets, installable qua WP Upload.
- `tests/unit/pwa.test.js` — manifest hợp lệ + scope `/aichatbot/`, versioned caches, không precache model, SW không đăng ký trong embed mode, install UI gated, iOS hint one-time, direct mode không đổi.
- `tests/unit/mobile-config.test.js` — Capacitor config/scripts, chỉ deps `@capacitor/*`, không platform dirs/node_modules, sync tái dùng app canonical, không secrets.

Total: **447 tests** (was 406). No old assertion weakened. PHP syntax check chạy khi có `php` binary (không bắt buộc); CI build ZIP + sinh icon PNG (distribution.yml).
