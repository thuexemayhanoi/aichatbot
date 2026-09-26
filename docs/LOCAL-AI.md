# Local AI — đánh giá, lựa chọn và thiết kế

## Đánh giá các engine local-browser (9/2026)

| Tiêu chí | WebLLM | Transformers.js (ORT Web) | ONNX Runtime Web | llama.cpp WASM (wllama) |
|---|---|---|---|---|
| License | Apache-2.0 | Apache-2.0 | MIT | MIT (wllama MIT; model theo license riêng) |
| Chạy LLM generate trong browser | Có, tối ưu nhất | Có (nhỏ) | Thấp (phải tự build graph) | Có |
| WebGPU | Bắt buộc | Tùy chọn (`device: 'webgpu'`) | Có | Thử nghiệm (PR #215) |
| WASM fallback cho LLM | Không | Có (chậm) | Có (chậm) | Có (native path) |
| Model ban đầu | q4f16 0.5B–8B (MLC) | 0.5B–3B ONNX | Tùy export | GGUF bất kỳ |
| Download lần đầu (~0.5B q4) | ~350–500 MB | ~300–450 MB | tùy model | ~350–500 MB |
| RAM thực tế (~0.5B) | ~0.9–1.2 GB | ~1 GB | ~1 GB+ | ~1 GB |
| Tốc độ inference (0.5B, GPU desktop) | 30–60 tok/s | 10–25 tok/s | tùy graph | 15–40 tok/s (WebGPU) / 2–5 tok/s (WASM) |
| Mobile | iOS Safari chưa có WebGPU (chỉ Technology Preview); Android Chrome/Edge có WebGPU | WASM chạy được nhưng chậm cho generate | WASM | WASM chạy được, chậm |
| Offline sau lần đầu | Có (cache) | Có (cache) | Có | Có |
| Caching | Cache API (tự động) | browser cache / Cache API | browser cache | Cache API tự động |
| GitHub Pages | OK (JS thuần, không COOP/COEP cứng) | OK; đa luồng WASM cần COOP/COEP | OK | OK |
| Privacy | 100% on-device | 100% on-device | 100% on-device | 100% on-device |

Ghi chú: số liệu dung lượng/tốc độ là ước lượng công khai của cộng đồng, thay đổi theo version/model; không dùng làm cam kết SLA.

## Lựa chọn

- **Generative layer:** WebLLM (Apache-2.0, không backend, không API key, model cache bằng Cache API, chạy trong Web Worker được). Lý do loại khác: Transformers.js/ORT Web phù hợp embeddings hơn là generate; wllama thiếu bản build WASM phổ biến và WebGPU chưa ổn định upstream.
- **Retrieval layer:** BM25 thuần tự viết (không dependency, ~5 KB, chạy tốt trên điện thoại yếu). Semantic embeddings (Transformers.js) là bước nâng sau, bật bằng flag, không phải mặc định.

### Model discovery (v43.1 — sửa lỗi "Cannot find model record in appConfig")

Root cause: v42 hard-code id `Qwen2.5-0.5B-Instruct-q4f16_1MLC` (thiếu dấu `-` trước `MLC`) — id này KHÔNG tồn tại trong `prebuiltAppConfig.model_list` của WebLLM hiện tại, gây lỗi "Cannot find model record in appConfig".

Luồng mới (`src/ai/model-selection.js`), theo đúng thứ tự:

1. Tải module WebLLM (chỉ JS, chưa tải model bytes).
2. Đọc `webllm.prebuiltAppConfig.model_list` — nguồn sự thật duy nhất.
3. `selectBestLocalModel()` chọn deterministic theo thứ tự ưu tiên: candidate có trong list (`MODEL_CANDIDATES` chỉ là danh sách ƯA THÍCH, luôn verify) → `low_resource_required` → VRAM thấp nhất → instruct → multilingual (Qwen) → ≤1.5B tham số → vừa RAM thiết bị.
4. Nếu không có model an toàn nào → Agent tắt nhẹ nhàng (không crash, không loading vô hạn), trợ lý cơ bản vẫn trả lời đầy đủ.

Candidate ưa thích hiện tại (không đảm bảo mãi mãi, luôn verify runtime): `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (VRAM ~945 MB, low-resource, multilingual vi/en), rồi `Qwen3-0.6B`, `Qwen3.5-0.8B`, `Qwen2-0.5B`, `Qwen2.5-1.5B`, `Llama-3.2-1B`. Download lần đầu ~350–500 MB (cache sau đó).

### Lỗi thân thiện

Lỗi kỹ thuật (raw WebLLM message) chỉ vào `console.debug` + `state.error` (diagnostics). UI luôn hiển thị câu tiếng Việt: "Agent chưa dùng được trên thiết bị này. Trợ lý cơ bản vẫn hoạt động bình thường." (v45) Không bao giờ lộ stack/config internals cho người dùng.

## Cơ chế bảo vệ (không thể bịa giá)

Xem `src/ai/grounding.js`:

1. LLM **chỉ** chạy khi rule engine + retrieval đều khước từ (turn "fallback").
2. Prompt chứa **chỉ** fact từ repo (max 4 doc retrieved) + footer contact (từ `business.json`).
3. `validateLlmOutput`: bỏ output rỗng, quá dài, echo prompt, chứa script, hoặc `NOINFO`.
4. `guardFacts`: mọi con số trong output phải tồn tại trong context đã verify. Ví dụ model trả "Wave giá 99.000đ" khi data ghi 150.000đ → **loại**, fallback trả lời.
5. Câu trả lời AI luôn kèm dòng disclosure.

## Trước khi tải model

`src/ai/capability.js` kiểm tra (không tải gì trước đó):

- `navigator.gpu` + `requestAdapter` (WebGPU)
- `navigator.deviceMemory` ≥ 2 GB (nếu có API)
- storage API cho cache (Cache API / IndexedDB / localStorage)

Không đạt → nút "Bật Agent" không hiện, chatbot hoạt động 100% bằng rule + retrieval. Người dùng bấm nút thì WebLLM module được dynamic import (esm.run CDN), hiện progress bar; lỗi/t/timeout bất kỳ → status "failed" + thông báo, chatbot tiếp tục bình thường. Tắt = `unload()`, model cache giữ lại cho lần sau.

## Hiệu năng

- Base JS (không WebLLM): ~116 KB source chưa nén (src + assets), ước tính ~30–35 KB gzip, 0 dependency.
- WebLLM + model chỉ load khi người dùng bật. First render không phụ thuộc AI.
- Đo thực tế trên thiết bị thật khi triển khai: first-token latency, init time, memory — ghi lại ở docs/COMPATIBILITY.md khi có số liệu.

## v44 — Local LLM là lớp PHRASING, không phải nguồn sự thật

Từ v44, LLM tại chỗ có hai vai trò, cả hai đều bị chặn:

1. **Fallback synthesis (như cũ)** — chỉ khi rules + retrieval khước từ; output phải qua `guardFacts`.
2. **Phrasing (mới)** — khi engine trả kết quả có `structured` (recommendation/calculator) VÀ planner cho phép (`route.useLocalLlm`), LLM nhận đúng text kết quả tất định và chỉ được diễn đạt lại. Output phải qua **Fact Guard v2** (`src/ai/fact-guard.js`): mọi số, số điện thoại, giờ mở cửa phải khớp verified bundle, nếu không bỏ và dùng câu template gốc.

Planner (`src/core/planner.js`) cứng: giá/cọc/giờ/địa chỉ/liên hệ/chính sách → `useLocalLlm: false`. LLM không bao giờ được chạm business fact. Fail ở bất kỳ khâu nào → câu trả lời tất định mặc định, người dùng không thấy lỗi.
