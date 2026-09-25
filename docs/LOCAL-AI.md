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

Model benchmark ban đầu: **Qwen2.5-0.5B-Instruct-q4f16_1MLC** — nhỏ, multilingual (vi/en), instruct, download ~350–500 MB.

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

Không đạt → nút "Bật AI tại chỗ" không hiện, chatbot hoạt động 100% bằng rule + retrieval. Người dùng bấm nút thì WebLLM module được dynamic import (esm.run CDN), hiện progress bar; lỗi/t/timeout bất kỳ → status "failed" + thông báo, chatbot tiếp tục bình thường. Tắt = `unload()`, model cache giữ lại cho lần sau.

## Hiệu năng

- Base JS (không WebLLM): ~116 KB source chưa nén (src + assets), ước tính ~30–35 KB gzip, 0 dependency.
- WebLLM + model chỉ load khi người dùng bật. First render không phụ thuộc AI.
- Đo thực tế trên thiết bị thật khi triển khai: first-token latency, init time, memory — ghi lại ở docs/COMPATIBILITY.md khi có số liệu.
