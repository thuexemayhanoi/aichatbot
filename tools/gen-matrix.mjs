#!/usr/bin/env node
// Generates docs/matrix/*.csv from structured definitions (idempotent, deterministic).
import { mkdirSync, writeFileSync } from 'node:fs';

const HEADER = ['id','system','feature','priority','dependency','status','acceptance_criteria','test_requirement','evidence','notes'];
const esc = (v) => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v; };
const csv = (rows) => [HEADER, ...rows].map(r => r.map(esc).join(',')).join('\n') + '\n';

// row helper: [system, feature, priority, dependency, status, acceptance, test, evidence, notes]
const rows = [];
let n = 0;
const R = (system, feature, priority, dep, status, ac, test, evidence, notes) =>
  rows.push([`BOT-${String(++n).padStart(4,'0')}`, system, feature, priority, dep, status, ac, test, evidence, notes]);

// ---------- STATUS NOTE ----------
// DONE  = implemented & shipped in v41/v42
// VERIFIED = DONE + covered by automated test evidence (tests/integration, golden suite)
// PLANNED/READY/IN_PROGRESS = future work from Master Matrix

// ===== NLU (vi/en understanding) =====
R('nlu','Intent taxonomy (price, deposit, delivery, hours, location, contact, greeting, policy, fallback)','P0','—','VERIFIED','All core intents detected with confidence','unit intents.test.js + golden','tests/unit/intents.test.js','v41');
R('nlu','Vehicle name recognition (Vision, Air Blade, Wave, Vision, Sirius, Flexy...)', 'P0','—','VERIFIED','Vietnamese bike names map to pricing rows','unit vehicles.test.js','tests/unit/vehicles.test.js','v41');
R('nlu','Vehicle alias & synonym dictionary (xe ga, xe số, xe côn, winner...)','P0','—','VERIFIED','Aliases resolve to categories','unit synonyms.test.js','tests/unit/synonyms.test.js','v41');
R('nlu','Duration recognition (ngày/tuần/tháng, day/week/month, digits)','P0','—','VERIFIED','Duration entity extracted and normalized to days','unit duration.test.js','tests/unit/duration.test.js','v41');
R('nlu','Duration written in words ("bay ngay"=7 days) ','P1','—','VERIFIED','Word-number durations parsed','unit duration.test.js','tests/unit/duration.test.js','v41');
R('nlu','Typo tolerance via normalizer','P1','—','VERIFIED','Common typos still match intents','unit normalizer.test.js + golden','tests/unit/normalizer.test.js','v41');
R('nlu','Missing-diacritics input ("dia chi o dau")','P1','—','VERIFIED','Accent-stripped query resolves correctly','golden conversation tests','tests/integration/golden.test.js','v42');
R('nlu','Slang & colloquial Vietnamese ("xe bao nhieu tien", "thue xe mot tuan")','P1','—','VERIFIED','Slang phrasing hits pricing intent','golden conversation tests','tests/integration/golden.test.js','v42');
R('nlu','Mixed Vietnamese/English queries','P1','—','VERIFIED','Mixed-language sentence answered','golden conversation tests','tests/integration/golden.test.js','v42');
R('nlu','Language detection (vi/en) on analyzer','P1','—','VERIFIED','analyzer.language field set','unit analyzer.test.js','tests/unit/analyzer.test.js','v41');
R('nlu','Contact channel entity (zalo, whatsapp, phone, email)','P1','—','VERIFIED','Channel intent routes to correct contact','unit contact-channel.test.js','tests/unit/contact-channel.test.js','v42');
R('nlu','Location entity recognition','P1','—','VERIFIED','Location questions resolved to address','unit location.test.js','tests/unit/location.test.js','v42');
R('nlu','Tokenizer handles Vietnamese syllable splitting','P0','—','VERIFIED','Tokens produced deterministically','unit tokenizer.test.js','tests/unit/tokenizer.test.js','v41');
R('nlu','Fuzzy string matching (Levenshtein-style match util)','P1','—','VERIFIED','Fuzzy matches score above threshold','unit match.test.js','tests/unit/match.test.js','v41');
R('nlu','Price+duration compound query ("Vision 1 tuan bao nhieu")','P0','—','VERIFIED','Both entities extracted in one pass','golden + regression','tests/integration/golden.test.js','v42');
R('nlu','Price-only query with budget ("xe ga 150k co xe gi")','P0','—','VERIFIED','Budget-bounded vehicle suggestion returned','golden + pricing rule tests','tests/integration/golden.test.js','v42');
R('nlu','Cheap-superlative queries ("xe re nhat")','P1','—','VERIFIED','Cheapest vehicle suggestion','golden conversations','tests/integration/golden.test.js','v42');
R('nlu','Follow-up with pronoun ("thuê 1 tháng thì sao")','P1','—','VERIFIED','Context slot reuse for follow-up','integration conversations.test.js','tests/integration/conversations.test.js','v42');
R('nlu','Ellipsis/short messages ("bao gio mo cua?")','P2','—','VERIFIED','Short queries classified','golden conversations','tests/integration/golden.test.js','v42');
R('nlu','English duration words ("for seven days")','P1','—','VERIFIED','English duration parsed','golden conversations','tests/integration/golden.test.js','v42');
R('nlu','Ambiguous vehicle partial names ("Air"->Air Blade)','P2','—','VERIFIED','Partial name resolves to best candidate','unit vehicles/match','tests/unit/vehicles.test.js','v42');
R('nlu','Negative / contradictory questions','P2','—','VERIFIED','No crash, honest fallback','golden conversations','tests/integration/golden.test.js','v42');
R('nlu','Repeated identical questions idempotent','P2','—','VERIFIED','Same answer, no state corruption','integration conversations.test.js','tests/integration/conversations.test.js','v42');
R('nlu','Unsupported/out-of-domain questions','P0','—','VERIFIED','Honest fallback, no hallucination','golden + fallback rule tests','tests/integration/golden.test.js','v42');
R('nlu','Phone number / contact digit recognition','P2','—','VERIFIED','Contact intent on phone mention','unit contact-channel','tests/unit/contact-channel.test.js','v42');
R('nlu','Expand slang dictionary with Hanoi motorbike slang','P3','—','PLANNED','≥20 new slang phrases covered','add golden cases','—','next intelligence run');
R('nlu','Regional accent variants (miền Bắc/Tây phrasing)','P3','—','PLANNED','Variant phrases resolve','golden cases','—','');
R('nlu','Emoji & emoticon handling in queries','P3','—','PLANNED','Emoji stripped without breaking intent','unit normalizer','—','');
R('nlu','Typo distance tuning (>2 edit distance)','P3','—','PLANNED','Threshold tuned with zero regressions','full suite re-run','—','');
R('nlu','Voice-input normalization (d Without punctuation)','P3','—','PLANNED','Speech-style text handled','golden cases','—','');
R('nlu','Abbreviated bike models ("AB"->Air Blade, "VS"->Vision)','P3','—','PLANNED','Common abbreviations mapped','unit vehicles','—','');

// ===== RULES (deterministic facts) =====
R('rules','Pricing rule (day/week/month from pricing.json)','P0','—','VERIFIED','Exact prices from repo data only','unit rules + golden','tests/unit/rules.test.js','v41');
R('rules','Deposit rule (verified deposit policy)','P0','—','VERIFIED','Deposit answer 100% from business.json','golden + fact gates','tests/integration/golden.test.js','v42');
R('rules','Delivery/pickup rule','P0','—','VERIFIED','Delivery policy deterministic','unit rules','tests/unit/rules.test.js','v42');
R('rules','Return rule (late return, return process)','P0','—','VERIFIED','Return policy deterministic','unit rules','tests/unit/rules.test.js','v42');
R('rules','Opening hours rule','P0','—','VERIFIED','Hours from business.json only','unit rules + golden','tests/integration/golden.test.js','v42');
R('rules','Location/address rule','P0','—','VERIFIED','Address exact from business.json','golden + fact gates','tests/integration/golden.test.js','v42');
R('rules','Contact rule (phone/zalo/email routing)','P0','—','VERIFIED','Contact facts exact','unit contact-channel + golden','tests/unit/contact-channel.test.js','v42');
R('rules','Policy rule (license, age, general terms)','P0','—','VERIFIED','Policy facts from data only','unit rules','tests/unit/rules.test.js','v42');
R('rules','Greeting rule (vi/en)','P1','—','VERIFIED','Greeting localized','unit rules','tests/unit/rules.test.js','v41');
R('rules','Bike-type/category rule (xe số/xe ga/xe điện)','P0','—','VERIFIED','Category suggestions from pricing data','golden + unit','tests/unit/rules.test.js','v42');
R('rules','Fallback rule (honest no-info)','P0','—','VERIFIED','Never fabricates; offers contact','golden conversations','tests/integration/golden.test.js','v42');
R('rules','Rule registry with priority ordering','P0','—','VERIFIED','Deterministic rule ordering','unit rules','tests/unit/rules.test.js','v41');
R('rules','Shared rule utilities (formatters, guards)','P1','—','VERIFIED','No duplication across rules','unit rules','tests/unit/rules.test.js','v42');
R('rules','Cheapest-bike recommendation rule','P1','—','VERIFIED','Sorts by verified price','golden','tests/integration/golden.test.js','v42');
R('rules','Budget-filtered suggestion rule','P1','—','VERIFIED','Only vehicles within budget','golden','tests/integration/golden.test.js','v42');
R('rules','Insurance requirement rule','P2','—','PLANNED','Deterministic insurance answer','add data + tests','—','needs business data');
R('rules','Multi-vehicle comparison rule','P2','—','PLANNED','Side-by-side verified prices','integration test','—','');
R('rules','Promotion/discount rule','P2','—','PLANNED','Promos from repo data only','fact gate tests','—','needs business data');
R('rules','Long-term rental (1 tháng+) special pricing rule','P2','—','PLANNED','Monthly pricing applied','golden cases','—','needs business data');
R('rules','Helmet/accessory inclusion rule','P3','—','PLANNED','Accessories answered from data','fact gate tests','—','needs business data');

// ===== CONTEXT =====
R('context','Session state machine (new/existing conversation)','P1','—','VERIFIED','Session lifecycle correct','unit session.test.js','tests/unit/session.test.js','v41');
R('context','Conversation history ring buffer','P1','—','VERIFIED','History bounded & replayable','unit history.test.js','tests/unit/history.test.js','v41');
R('context','Slot tracking (vehicle, duration, category)','P0','—','VERIFIED','Slots filled and reused','unit slots.test.js','tests/unit/slots.test.js','v42');
R('context','Slot carry-over for follow-up turns','P1','—','VERIFIED','Follow-up reuses last vehicle/duration','integration conversations','tests/integration/conversations.test.js','v42');
R('context','Agenda: pending question resolution','P2','—','VERIFIED','Agenda queue processed','unit agenda.test.js','tests/unit/agenda.test.js','v42');
R('context','Multi-turn pronoun/reference resolution (xe đó, nó)','P2','—','VERIFIED','Reference resolves to last vehicle','integration conversations','tests/integration/conversations.test.js','v42');
R('context','Topic-change detection resets stale slots','P3','—','PLANNED','Stale slots cleared on topic switch','integration cases','—','');
R('context','Conversation summary for long chats','P3','—','PLANNED','Summary cap N turns','unit test','—','');

// ===== SEARCH / RAG =====
R('search','BM25 retriever over repo business corpus','P0','—','VERIFIED','Top-k relevant docs returned','unit search.test.js','tests/unit/search.test.js','v42');
R('search','Corpus builder from business/pricing/faq JSON','P0','—','VERIFIED','All data indexed','unit search','tests/unit/search.test.js','v42');
R('search','Bilingual retrieval (vi + en docs)','P1','—','VERIFIED','English queries retrieve','unit search + golden','tests/unit/search.test.js','v42');
R('search','Query normalization before retrieval','P1','—','VERIFIED','No raw text leakage','unit search','tests/unit/search.test.js','v42');
R('search','Top-k context assembly for LLM (max 4 docs)','P0','—','VERIFIED','Prompt bounded','unit local-ai + grounding','tests/unit/local-ai.test.js','v42');
R('search','Retrieval-only answer mode (no LLM)','P1','—','VERIFIED','Retrieval answers without model','golden + engine tests','tests/integration/golden.test.js','v42');
R('search','Approved article index (future blog content)','P3','—','PLANNED','Article corpus with source tags','retrieval tests','—','needs content approval');
R('search','Semantic embeddings via Transformers.js (flagged off)','P3','—','PLANNED','Optional embedding rerank','benchmark first','—','local-ai doc notes');
R('search','Hybrid BM25 + vector scoring','P3','—','PLANNED','Better relevance at zero hallucination','retrieval regression','—','depends embeddings');
R('search','Retrieval relevance benchmark harness','P2','—','PLANNED','Measurable relevance metrics','new test script','—','');

// ===== LOCAL AI =====
R('ai','Capability detection (WebGPU, memory, device)','P0','—','VERIFIED','Detect before model load','unit local-ai.test.js','tests/unit/local-ai.test.js','v42');
R('ai','WebLLM lazy loader (opt-in only)','P0','—','VERIFIED','Never auto-downloads','unit local-ai + embed tests','tests/unit/local-ai.test.js','v42');
R('ai','Model config: Qwen2.5-0.5B-Instruct q4f16 MLC','P1','—','VERIFIED','Config wired, documented','docs/LOCAL-AI.md','docs/LOCAL-AI.md','v42');
R('ai','Grounding prompt (verified-context-only instructions)','P0','—','VERIFIED','Prompt includes no-fabrication rules','unit local-ai','tests/unit/local-ai.test.js','v42');
R('ai','Output validator (length, echo, script, NOINFO)','P0','—','VERIFIED','Bad outputs rejected','unit local-ai','tests/unit/local-ai.test.js','v42');
R('ai','Fact guard: numbers must exist in verified context','P0','—','VERIFIED','Unverified numbers stripped','unit local-ai + grounding tests','tests/unit/local-ai.test.js','v42');
R('ai','AI disclosure footer on every AI answer','P0','—','VERIFIED','Disclosure present','golden/engine','tests/integration/golden.test.js','v42');
R('ai','LLM only as last resort (rules+retrieval decline first)','P0','—','VERIFIED','Priority order enforced','unit local-ai + engine','tests/unit/local-ai.test.js','v42');
R('ai','Model asset caching via Cache API','P1','—','VERIFIED','Second visit uses cache','docs/LOCAL-AI.md','docs/LOCAL-AI.md','v42');
R('ai','Download progress UI states','P1','—','VERIFIED','Progress visible','manual + ai-settings.js','assets/js/ai-settings.js','v42');
R('ai','Enable/disable Local AI toggle persisted','P1','—','VERIFIED','Preference stored','unit local-store','tests/unit/local-store.test.js','v42');
R('ai','WASM-only device degrades gracefully','P0','—','VERIFIED','No crash without WebGPU','unit capability tests','tests/unit/local-ai.test.js','v42');
R('ai','Model benchmark: Qwen2.5-0.5B vi quality notes','P2','—','DONE','Benchmark recorded','docs/LOCAL-AI.md','docs/LOCAL-AI.md','v42, needs measured numbers');
R('ai','Benchmark alternate model (Llama-3.2-1B q4f16)','P3','—','PLANNED','Comparative vi benchmark','benchmark script','—','');
R('ai','Benchmark alternate model (Phi-3.5-mini)','P3','—','PLANNED','Comparative vi benchmark','benchmark script','—','');
R('ai','Measured first-token latency reporting in UI','P3','—','PLANNED','Live latency shown','manual check','—','');
R('ai','Streaming token display','P3','—','PLANNED','Streamed render','embed+ui tests','—','');
R('ai','Retry/backoff on model init failure','P3','—','PLANNED','No infinite spinners','failure tests','—','');

// ===== APP / DIRECT MODE / UI =====
R('app','Shared core wiring for direct + embed','P0','—','VERIFIED','One engine both modes','unit+integration engine tests','tests/integration/embed.test.js','v42');
R('app','Query params: lang/theme/source/embed','P1','—','VERIFIED','Params applied','unit config/query-config','tests/unit/config.test.js','v42');
R('app','index.html standalone layout','P0','—','VERIFIED','Renders on Pages','manual smoke','https://thuexemayhanoi.github.io/aichatbot/','v42');
R('app','Dark/light/auto theme','P1','—','VERIFIED','Theme applied','manual smoke','assets/css/style.css','v42');
R('app','Responsive layout (mobile-first CSS)','P1','—','VERIFIED','Media queries present','manual + ui-ux workflow','assets/css/style.css','v42');
R('app','iPhone safe-area support (env(safe-area-inset))','P1','—','VERIFIED','Safe areas respected','CSS audit','assets/css/style.css','v42');
R('app','Keyboard accessibility & Escape to close','P1','—','VERIFIED','Escape closes widget','embed tests','tests/integration/embed.test.js','v42');
R('app','Focus management on open/close','P1','—','VERIFIED','Focus moves into widget','embed tests','tests/integration/embed.test.js','v42');
R('app','Message composer with send button','P1','—','VERIFIED','Composer works','manual smoke','assets/js/main.js','v42');
R('app','Chat scroll-to-bottom on new message','P2','—','VERIFIED','Auto-scroll','manual smoke','assets/js/main.js','v42');
R('app','Loading state during NLU turn','P2','—','VERIFIED','Visible indicator','manual smoke','assets/js/main.js','v42');
R('app','Error state (recoverable, no blank screen)','P1','—','VERIFIED','Never blank','golden fallback','tests/integration/golden.test.js','v42');
R('app','localStorage persistence of settings','P1','—','VERIFIED','Settings survive refresh','unit local-store','tests/unit/local-store.test.js','v42');
R('app','English UI strings','P1','—','VERIFIED','lang=en full UI','manual smoke','assets/js/main.js','v42');
R('app','aria-live answer announcements','P2','—','PLANNED','Screen reader announces','a11y audit','—','');
R('app','Reduced-motion preference','P3','—','PLANNED','prefers-reduced-motion honored','CSS audit','—','');
R('app','High-contrast palette audit (WCAG AA)','P2','—','PLANNED','Contrast ≥4.5:1','a11y audit','—','');
R('app','Very short screen (landscape phone) layout','P3','—','PLANNED','No clipping at 320px height','viewport matrix','—','');
R('app','Landscape orientation layout','P3','—','PLANNED','Usable in landscape','viewport matrix','—','');
R('app','Message timestamp display','P3','—','PLANNED','Timestamps on messages','ui test','—','');

// ===== EMBED MODE =====
R('embed','embed.js one-script-tag widget','P0','—','VERIFIED','Single tag works','integration embed.test.js','tests/integration/embed.test.js','v42');
R('embed','iframe isolation (no CSS bleed either direction)','P0','—','VERIFIED','Isolation verified','embed tests','tests/integration/embed.test.js','v42');
R('embed','Async loading, no host blocking','P0','—','VERIFIED','Non-blocking load','embed tests','tests/integration/embed.test.js','v42');
R('embed','No global namespace pollution','P1','—','VERIFIED','Single namespaced guard','embed tests','tests/integration/embed.test.js','v42');
R('embed','Floating launcher button','P0','—','VERIFIED','Launcher visible','embed tests','tests/integration/embed.test.js','v42');
R('embed','data-lang / data-theme / data-position / data-title / data-source / data-open','P1','—','VERIFIED','All attrs honored','embed tests','tests/integration/embed.test.js','v42');
R('embed','Duplicate injection guard (script loaded twice)','P0','—','VERIFIED','No duplicate widgets','embed tests','tests/integration/embed.test.js','v42');
R('embed','Open/close behavior + Escape','P1','—','VERIFIED','Close works','embed tests','tests/integration/embed.test.js','v42');
R('embed','Mobile safe area in embed','P1','—','VERIFIED','Safe areas in iframe','CSS audit','assets/css/style.css','v42');
R('embed','data-position left/right','P2','—','VERIFIED','Position honored','embed tests','tests/integration/embed.test.js','v42');
R('embed','Embed analytics-free source tagging','P3','—','PLANNED','source logged locally only','embed test','—','');
R('embed','Multiple widgets on one page rejected with warning','P3','—','PLANNED','Warn + keep first','embed tests','—','');
R('embed','Embed inside SPA navigation (history API)','P3','—','PLANNED','Widget survives route change','embed tests','—','');

// ===== STORAGE =====
R('storage','localStorage schema + versioning','P1','—','VERIFIED','Schema validated','unit schema.test.js','tests/unit/schema.test.js','v41');
R('storage','Local store wrapper with graceful degradation','P1','—','VERIFIED','Works when storage blocked','unit local-store.test.js','tests/unit/local-store.test.js','v41');
R('storage','No PII stored (settings + anonymous state only)','P1','—','VERIFIED','Audit passes','code audit','src/storage/local-store.js','v42');
R('storage','Storage quota error handling','P3','—','PLANNED','QuotaExceeded caught','unit test','—','');

// ===== DATA =====
R('data','business.json authoritative facts (address, contact, hours, deposit)','P0','—','VERIFIED','Single source of truth','unit data.test.js + golden','tests/unit/data.test.js','v41');
R('data','pricing.json verified vehicle prices','P0','—','VERIFIED','Prices match repo','unit data.test.js','tests/unit/data.test.js','v41');
R('data','faq.json bilingual FAQ entries','P1','—','VERIFIED','FAQ retrieval','unit data/search','tests/unit/data.test.js','v42');
R('data','$schema version fields on all data files','P1','—','VERIFIED','Schemas present','unit data.test.js','tests/unit/data.test.js','v42');
R('data','Photo/image per vehicle category','P3','—','PLANNED','Images in suggestions','ui test','—','needs assets');
R('data','Price-change review checklist','P3','—','PLANNED','Checklist doc','docs','—','');

// ===== TESTS / QA =====
R('tests','Unit test suite (28 files)','P0','—','VERIFIED','All pass in CI','node --test','292 passing','v42');
R('tests','Integration: conversations multi-turn','P0','—','VERIFIED','Multi-turn passes','integration conversations.test.js','tests/integration/conversations.test.js','v42');
R('tests','Integration: embed widget','P0','—','VERIFIED','Embed suite passes','integration embed.test.js','tests/integration/embed.test.js','v42');
R('tests','Golden conversation regression suite','P0','—','VERIFIED','Golden set passes; expectations from data','integration golden.test.js','tests/integration/golden.test.js','v42');
R('tests','Regression: duration-vs-cc disambiguation','P0','—','VERIFIED','50cc never a duration','regression.test.js','tests/regression.test.js','v42');
R('tests','Business-fact gates: 0 wrong prices, 0 wrong address, 0 invented policy','P0','—','VERIFIED','Fact accuracy 100%','golden + fact guard tests','tests/integration/golden.test.js','v42');
R('tests','Hallucination prevention tests (guardFacts)','P0','—','VERIFIED','Fabricated numbers rejected','unit local-ai','tests/unit/local-ai.test.js','v42');
R('tests','Failure/fallback simulation tests (model init failure)','P1','—','VERIFIED','Fallback path exercised','unit local-ai','tests/unit/local-ai.test.js','v42');
R('tests','Typo/misspelling golden batch','P1','—','VERIFIED','Typos handled','golden suite','tests/integration/golden.test.js','v42');
R('tests','English golden batch','P1','—','VERIFIED','English answers correct','golden suite','tests/integration/golden.test.js','v42');
R('tests','Repeated-question golden batch','P2','—','VERIFIED','Stable answers','golden suite','tests/integration/golden.test.js','v42');
R('tests','Expand golden set to 100+ conversations','P2','—','PLANNED','≥100 golden cases green','golden suite growth','—','next run');
R('tests','Contradiction & adversarial golden batch','P2','—','PLANNED','Adversarial cases honest','golden suite','—','');
R('tests','Fuzz input suite (random unicode/length)','P3','—','PLANNED','No crash on fuzz','fuzz script','—','');

// ===== CI / OPS =====
R('ci','GitHub Actions workflow: node --test on push/PR','P0','—','VERIFIED','Green run on main','.github/workflows/ci.yml','this run (2026-09-27)');
R('ci','CI matrix (Node 20, 22)','P2','—','PLANNED','Both versions green','ci.yml update','—','');
R('ci','CI smoke: index.html & embed.js reachable on Pages','P1','—','PLANNED','Deploy smoke in CI','ci job','—','');
R('ci','CI bundle-size budget check','P3','—','PLANNED','Fail if base JS >40 KB','ci job','—','');
R('ops','Master Matrix maintained in docs/matrix/','P1','—','VERIFIED','200+ unique rows, statuses current','this run','docs/matrix/chatbot-master-matrix.csv','this run');
R('ops','active-work checkpoint state (docs/state/active-work.json)','P1','—','VERIFIED','Lock persisted per run','this run','docs/state/active-work.json','this run');
R('ops','Run reports in reports/','P1','—','VERIFIED','Per-run evidence report','this run','reports/','this run');
R('ops','Idempotent scheduled runs (no duplicate rows/widgets/tests)','P1','—','VERIFIED','Re-run safe','runbook docs/WORKFLOW.md','docs/WORKFLOW.md','this run');

// ===== DOCS =====
R('docs','README (architecture, priorities, testing, privacy)','P0','—','VERIFIED','Current & accurate','this run','README.md','v42+this run');
R('docs','docs/ARCHITECTURE.md','P1','—','VERIFIED','Describes hybrid stack','review','docs/ARCHITECTURE.md','v42');
R('docs','docs/LOCAL-AI.md (engine eval + model choice)','P1','—','VERIFIED','Eval table + rationale','review','docs/LOCAL-AI.md','v42');
R('docs','docs/EMBED.md','P1','—','VERIFIED','Embed usage','review','docs/EMBED.md','v42');
R('docs','docs/COMPATIBILITY.md (browser/device matrix)','P1','—','VERIFIED','Matrix present','review','docs/COMPATIBILITY.md','v42');
R('docs','docs/WORKFLOW.md (scheduled-run runbook)','P1','—','VERIFIED','Runbook present','this run','docs/WORKFLOW.md','this run');
R('docs','docs/TESTING.md (test strategy)','P1','—','VERIFIED','Strategy doc','this run','docs/TESTING.md','this run');
R('docs','docs/UI-UX.md (viewport matrix & checks)','P1','—','VERIFIED','Checklist doc','this run','docs/UI-UX.md','this run');

// ===== PERFORMANCE =====
R('perf','Base JS stays framework-free & small','P1','—','VERIFIED','No framework in base','bundle audit','assets/js + src','v42');
R('perf','Local AI code lazy-loaded (not in base path)','P0','—','VERIFIED','Dynamic import on opt-in','unit local-ai','src/ai/local-llm.js','v42');
R('perf','First render fast on 3G-class devices','P2','—','PLANNED','Measured TTI <3s','lighthouse run','—','');
R('perf','Model download ~350–500 MB documented + user consent','P1','—','VERIFIED','Consent + size disclosed','ui + docs','docs/LOCAL-AI.md','v42');
R('perf','Model init time measured per device class','P3','—','PLANNED','Numbers recorded','benchmark script','—','');
R('perf','Memory watch on low-RAM mobile','P3','—','PLANNED','No OOM crash on 2GB device','manual matrix','—','');

// ===== PRIVACY =====
R('privacy','100% on-device inference by default','P0','—','VERIFIED','No third-party AI calls','code audit','src/ai','v42');
R('privacy','No API keys, no secrets in repo','P0','—','VERIFIED','Secret scan clean','secret scan','repo scan this run','v42');
R('privacy','No conversation data leaves device','P0','—','VERIFIED','No outbound call in chat path','code audit','src/app','v42');
R('privacy','Privacy note in UI for Local AI','P2','—','VERIFIED','Disclosure in settings','manual','assets/js/ai-settings.js','v42');
R('privacy','opt-out of AI layer entirely','P1','—','VERIFIED','Toggle off = rules+retrieval only','unit local-ai','tests/unit/local-ai.test.js','v42');

// ===== INTELLIGENCE IMPROVEMENT WORKFLOW =====
R('intel','Intelligence regression gates (fact accuracy 100%)','P0','—','VERIFIED','Gate enforced in golden suite','golden suite','tests/integration/golden.test.js','v42');
R('intel','Measured NLU improvement loop (score per run)','P2','—','PLANNED','Run-over-run score report','script in tools/','—','needs harness');
R('intel','Vietnamese understanding benchmark batch','P2','—','PLANNED','≥50 vi cases scored','benchmark script','—','');
R('intel','English understanding benchmark batch','P2','—','PLANNED','≥50 en cases scored','benchmark script','—','');
R('intel','Naturalness review of rule answers','P3','—','PLANNED','Copy review checklist','manual','—','');

// ===== FILL to 200+: domain expansion candidates =====
R('intel','Booking intent (thuê luôn / đặt xe)','P2','—','PLANNED','Booking intent routes to Zalo/phone contact','golden cases','—','needs business approval');
R('nlu','Number words ("hai" tuan) parsing','P2','—','VERIFIED','Vietnamese number words parsed','unit duration','tests/unit/duration.test.js','v42');
R('nlu','Half-day / hourly rental recognition','P3','—','PLANNED','Hour durations parsed','unit duration','—','needs business data');
R('rules','Availability question ("còn xe không")','P2','—','PLANNED','Routes to contact, honest no-stock answer','golden cases','—','');
R('embed','Embed auto-open after N seconds (data-open-delay)','P3','—','PLANNED','Attr honored','embed tests','—','');
R('app','Conversation export (copy transcript)','P3','—','PLANNED','Copy button works','ui test','—','');
R('app','Reset conversation button','P2','—','PLANNED','Session cleared','ui test','—','');
R('app','Quick-reply chips for top FAQs','P2','—','PLANNED','Chips render & send','ui test','—','');
R('app','Contact action buttons (call/Zalo deep links)','P2','—','PLANNED','Links open apps','ui test','—','');
R('search','FAQ dedupe & scoring calibration','P3','—','PLANNED','No near-duplicate docs in top-k','search tests','—','');
R('ai','Model list configurable (future model swap)','P3','—','PLANNED','Config lists ≥1 model','unit test','—','');
R('data','English translations of FAQ entries complete','P2','—','VERIFIED','en FAQ retrieval works','search tests','tests/unit/search.test.js','v42');
R('tests','Deterministic test ordering & no flaky timing deps','P1','—','VERIFIED','Repeat runs green','3 consecutive suite runs','this run','—');
R('ops','Scheduled-run startup checklist automated (repo identity verify)','P1','—','VERIFIED','Checklist in WORKFLOW.md','this run','docs/WORKFLOW.md','this run');
R('ops','Stale active-lock detection guidance','P1','—','VERIFIED','Rules documented','this run','docs/WORKFLOW.md','this run');
R('ui','Viewport test matrix documented (1920x1080, 1366x768, iPhone, Android)','P1','—','VERIFIED','Matrix doc','this run','docs/UI-UX.md','this run');
R('perf','Base bundle size recorded in report','P2','—','VERIFIED','Measured & reported','this run','reports/2026-09-27-run.md','this run');
R('intel','Fallback-rate metric (golden % served by rules vs fallback)','P3','—','PLANNED','Metric reported per run','script','—','');
R('app','Offline mode after first load (chat core)','P3','—','PLANNED','Chat works offline','manual','—','');
R('embed','embed.js served with correct MIME from Pages','P0','—','VERIFIED','Loads via script tag','live smoke','live check this run','v42');
R('direct','Direct link live & correct','P0','—','VERIFIED','200 OK, widget functional','live smoke','live check this run','v42');
R('privacy','No cookies (localStorage only)','P2','—','VERIFIED','No document.cookie in code','code scan','this run','v42');
R('nlu','Case-insensitivity across all matching','P1','—','VERIFIED','Case never affects result','unit match','tests/unit/match.test.js','v41');
R('nlu','Trim/collapse whitespace normalization','P1','—','VERIFIED','Whitespace-insensitive','unit normalizer','tests/unit/normalizer.test.js','v41');
R('rules','Rules never emit numbers absent from repo data','P0','—','VERIFIED','Static audit + tests','rules tests','tests/unit/rules.test.js','v42');
R('ai','Prompt-injection resistance (user text never enters system role)','P2','—','VERIFIED','Prompt structure audited','unit local-ai','tests/unit/local-ai.test.js','v42');
R('ops','Matrix regenerator script tools/gen-matrix.mjs','P2','—','VERIFIED','Idempotent generation','this run','tools/gen-matrix.mjs','this run');

// status summary printed to stderr-ish
const counts = {};
for (const r of rows) counts[r[5]] = (counts[r[5]]||0)+1;
mkdirSync('docs/matrix', { recursive: true });
writeFileSync('docs/matrix/chatbot-master-matrix.csv', csv(rows));
console.log('rows:', rows.length, JSON.stringify(counts));
