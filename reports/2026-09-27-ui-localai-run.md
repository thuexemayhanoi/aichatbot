# Run report — 2026-09-27-ui-localai (v43.1)

Run ID: `2026-09-27-ui-localai` · Feature: `BOT-0204..BOT-0218` · Status: DONE

## Scope

1. UI/UX visual refresh (calm indigo/slate design tokens, red removed from brand).
2. Local AI bug fix: "Cannot find model record in appConfig" → dynamic model discovery.

## Start / end

- Start commit: `4dbe23cf6bb7d95933c7c296157586b3e1bde957`
- End commit: see `docs/state/active-work.json` (filled after push).

## UI changes

- Palette: old primary `#c8102e` (harsh red) → `--color-primary: #4f46e5` (indigo), dark `#7c7cf4`. Red now ONLY `--color-error: #d2193c` for real errors.
- Semantic tokens: bg/surface/surface-elevated/primary/primary-hover/primary-soft/text/text-muted/border/success/warning/error + radius/space/duration/shadow scales, light + dark.
- Header: brand mark + title/subtitle hierarchy; status line with data-tone (not color-only).
- Chips: flex-wrap (no horizontal clipping). Composer: textarea (Enter send, Shift+Enter newline, auto-grow, 16px font), send disabled while busy, aria-busy.
- Typing indicator (3 dots, reduced-motion safe); autoscroll only when near bottom.
- Local AI: compact "AI tại chỗ" toggle → explain panel (on-device, no API key, large download, WebGPU needed) → explicit confirm → progress bar → friendly Vietnamese status. Technical errors go to console.debug + state only.

## Local AI root cause + fix

- Root cause: hard-coded id `Qwen2.5-0.5B-Instruct-q4f16_1MLC` (missing `-` before `MLC`) does not exist in WebLLM 0.2.85 `prebuiltAppConfig.model_list` (real id: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`).
- Fix: `src/ai/model-selection.js` — at runtime load WebLLM module, read `prebuiltAppConfig.model_list`, deterministic selection (preference candidates verified → low_resource_required → lowest VRAM → instruct → multilingual → ≤1.5B → device-memory fit). No safe model → Local AI disabled gracefully.
- Available models discovered (WebLLM 0.2.85, 165 records incl. Qwen2/2.5/3/3.5, Llama-3.2, Gemma, Phi...). Selected on typical device: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (VRAM ~945 MB, low_resource_required, multilingual vi/en) — smallest multilingual instruct model that safely fits mobile.

## Gates

- Tests: 317/317 green (was 292; +25: model-selection 10, local-ai +5 new cases, ui-tokens 8, privacy 3; 1 old test replaced by discovery-contract equivalents).
- Secret scan: clean (CI grep + privacy.test.js).
- Bundle: base JS 134,117 bytes < 150,000 guard (baseline updated in ci.yml; growth = model-selection + UI logic).
- No API endpoints/keys: enforced by tests/unit/privacy.test.js; outbound URLs limited to esm.run (static JS) + HuggingFace model shards — inference stays in-browser.
- Direct + embed: same core; lang/theme/source/embed/auto-open/Escape/focus/dedupe preserved (embed + golden suites green).

## Live verification (after push)

- Direct: https://thuexemayhanoi.github.io/aichatbot/ → 200, new UI served.
- Embed: embed.js → 200, indigo launcher.
- Docs: LOCAL-AI/ARCHITECTURE/COMPATIBILITY/UI-UX/TESTING/README updated; matrix 218 rows; state checkpoint written.
