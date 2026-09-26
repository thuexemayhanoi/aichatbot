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
