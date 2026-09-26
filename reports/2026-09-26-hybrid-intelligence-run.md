# Run report — v44: Context-aware hybrid intelligence

- Run ID: `2026-09-26-hybrid-intelligence`
- Start SHA: `2e1f79c08ada114a829416ea65abcb464e1a1476`
- Status: COMPLETE
- Feature commit: `26b2dca85fc6f4cc484a18379bfdc5aabd7ee12d`
- Tests: **317 → 393**, all green (`node --test`, 393/393)

## What changed

### 1. Context memory (src/context/slots.js)
Extended slot schema: vehicle, durationDays, dateRange, location, language, heightCm, experience, transmission, electric, luggage, usage, budget, destination, prevIntent. Anti-reset guarantee kept (a turn only fills what it carries); explicit new input always overrides memory ("Không, Air Blade cơ"). All local (namespaced localStorage, TTL), no server state. `engine.resetContext()` + UI 🧹 button clears slots+agenda+history.

### 2. Intent/entity pipeline (src/nlu/)
New deterministic extractors (zero LLM): `entities/rider.js` (height 1m55/155cm, experience, transmission, budget 150k/nghìn/triệu, luggage, usage city/long, electric, destination gazetteer with word-boundary matching so "thuê" never matches "Hue"), `entities/dates.js` (date ranges, inclusive days, invalid/reversed/leap-year validation), `language.js` (vi/en detection). English duration units added. New intents: `recommendation_query`, `compare_query`. `analyze-turn.js` produces {intent, entities, resolvedEntities, missingEntities, confidence, normalizedQuery}.

### 3. Rules stay authoritative
Registry unchanged in priority; added `recommend-rule`. Pricing rule now supports date ranges, transparent cheapest-package breakdowns and cross-model comparison — all numbers only from pricing.json.

### 4. Hybrid retrieval (src/search/)
`semantic-retriever.js`: Transformers.js (WASM, in-browser), model `Xenova/multilingual-e5-small` quantized (~30MB, cached in browser Cache Storage), e5 query:/passage: prefixes, unit-normalized vectors. `reranker.js`: deterministic merge, weights 0.6 lexical / 0.4 semantic, max-normalization, id tie-break. `hybrid-retriever.js`: engine-contract wrapper; warm-up only AFTER the first user turn (never on page load); any failure degrades silently to BM25-only; irrelevant queries still decline (honest fallback). Answer source becomes traceable `*-hybrid`.

### 5. Recommendation engine (src/recommend/recommender.js)
Deterministic scoring from verified data only: category/transmission filters, experience ("dễ điều khiển/nhẹ" from published descriptions), usage (city/long), duration-priced availability, budget ceiling, popularity. Structured output {recommendedModels, reasons, tradeoffs, missingInfo, confidenceSource}. No invented seat height/fuel/availability: a stated height produces an explicit "confirm by phone" gap, not a guess.

### 6. Smart calculator (src/calc/rental-calculator.js)
Day/week/month + date ranges + mixed NL durations; transparent breakdown lines ("1 tuần × 800.000đ/tuần + 5 ngày × 200.000đ/ngày = …"); cheapest valid package always shown; comparison across models sorted cheapest-first; unpriced vehicles yield "contact", never 0đ.

### 7. Planner (src/core/planner.js)
planTurn routes each turn: rule-only facts NEVER allow the LLM; price/duration/compare → calculator+rules, no LLM; recommendation → engine + optional grounded phrasing; unknown → retriever + optional grounded synthesis. The engine emits a `plan` trace event; moto-app enforces the gate before any phrasing call.

### 8. Local LLM as phrasing layer (src/ai/)
`local-llm.phrase()` receives ONLY the deterministic structured text; output must pass Fact Guard v2 (`fact-guard.js`): every number, phone-like sequence and clock time must exist in the verified bundle (docs + structured texts + pinned business fields). Failure → deterministic template answer, silently.

### 9. Source trace
Every turn carries an internal source (RULE/pricing-data/agenda/recommendation/hybrid/bm25/local-llm/fallback). Exposed only with `?debug=1` as a small `[debug] nguồn: …` line; normal users see clean answers, no fake percentages.

## Privacy
No server-side profile, no conversation upload, no analytics with conversation text. All context in local namespaced storage; 🧹 clears it. Privacy tests extended to the semantic layer: no inference endpoints, no API keys, outbound URLs are static CDN assets only (esm.run + HF model shards).

## Performance
- Initial load: rules + NLU + BM25 only; embeddings and WebLLM never load on page load.
- Bundle: base JS 134.117 → 186.095 bytes (guard raised to < 190.000, documented); embed launcher unchanged at 7.657 bytes. No bundled dependencies added — Transformers.js/WebLLM are runtime CDN imports.

## Test gates (all green before push)
393/393 node --test · secret scan clean · no API endpoint scan clean · bundle guard green · direct mode covered by golden+multi-turn · embed mode covered by embed tests · LLM-failure fallback covered · hybrid fallback covered · privacy/local storage verified.

## Remaining limitations
- Real-device benchmarks for the embedding warm-up (and first-token latency for WebLLM) still unmeasured.
- iOS Safari: no WebGPU → no local LLM (chatbot fully functional; semantic layer works via WASM but is skipped when warm-up fails).
- Recommendation engine cannot rank by seat height because the shop publishes no such data; it says so explicitly instead.
- Matrix PLANNED rows still open: offline mode, conversation export, auto-open-delay (unchanged from v43.1).
