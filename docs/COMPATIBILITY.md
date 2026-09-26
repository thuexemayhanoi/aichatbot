# Tương thích trình duyệt & thiết bị

## Chatbot cơ bản (rule + retrieval — luôn khả dụng)

| Nền tảng | Trạng thái |
|---|---|
| iOS Safari ≥ 15 | Hoạt động (localStorage degrade an toàn ở private mode; `100dvh` + safe-area cho khung chat) |
| iOS/Android Chrome, Edge | Hoạt động |
| Desktop Chrome/Edge/Firefox/Safari | Hoạt động |
| Trình duyệt cũ không có ES modules | Hiện trang vẫn tải nhưng JS không chạy — `noscript`/status báo lỗi, không blank screen trên các trình duyệt hiện đại |

Yêu cầu kỹ thuật của base: ES2018+ (ES modules), `fetch`, `localStorage` (tự fallback in-memory).

## Local AI (WebLLM — opt-in)

Yêu cầu: **WebGPU** (`navigator.gpu`), đủ RAM (~2 GB+), Cache API để cache model.

| Nền tảng | WebGPU | Ghi chú |
|---|---|---|
| Desktop Chrome/Edge 113+ | Có | Nhanh nhất; WebGPU bật mặc định từ Chrome 113 |
| Android Chrome/Edge | Có (tùy GPU/driver) | Model 0.5B khả thi trên máy tầm trung trở lên |
| iOS Safari | Chưa ổn định (Technology Preview) | Nút "Bật AI" sẽ không hiện khi thiếu WebGPU |
| Desktop Safari 18+ | Có (macOS) | Kiểm tra runtime qua capability detection |
| Firefox | Đang enable dần theo version | Fallback tự động khi không có `navigator.gpu` |

WASM fallback cho generative LLM: WebLLM không có; khi thiếu WebGPU, MotoAI **không** tự chạy model WASM (chậm, đốt pin trên mobile) — chatbot dùng rule + retrieval, vẫn trả lời đúng mọi fact kinh doanh.

Model id được phát hiện động từ `prebuiltAppConfig.model_list` của bản WebLLM đang tải (`src/ai/model-selection.js`), nên việc WebLLM thêm/bỏ model theo version không phá Local AI. Thiếu model phù hợp → AI tại chỗ tự tắt nhẹ nhàng.

## Hành vi khi thiếu/nhỏ tài nguyên

- Thiếu WebGPU / RAM thấp / không storage: không hiện nút Local AI; chatbot 100% chức năng.
- Model tải dở mà lỗi: status failed + thông báo tiếng Việt; không loading vô hạn (timeout 120s import/init, 45s generation).
- Offline sau lần đầu: data + model đã cache → chatbot vẫn hoạt động (trừ lần đầu chưa tải gì).

## Hiệu năng tham chiếu (đo trên thiết bị thật khi triển khai)

- Base JS: ~116 KB source / ~30–35 KB gzip, 0 dependency.
- First chat render: chỉ phụ thuộc 3 file JSON (~15 KB).
- Model Qwen2.5-0.5B q4f16: download ~350–500 MB (một lần, sau đó cache), init vài giây–vài chục giây tùy GPU.

## v44 — Hybrid retrieval (semantic layer)

- **BM25 + rules + NLU + context**: chạy trên mọi trình duyệt hiện đại, kể cả không WebGPU, không WASM.
- **Lớp semantic** (Transformers.js, WASM): lazy — chỉ warm-up sau lượt chat đầu, không chặn tương tác đầu; model `Xenova/multilingual-e5-small` (~30MB quantized, cache Cache Storage khi trình duyệt cho phép). Máy yếu/mất mạng/không tải được → tự động về BM25-only, không báo lỗi cho người dùng.
- **Local LLM (WebLLM)**: như v43.1 — cần WebGPU (không có trên iOS Safari hiện tại); không có thì chatbot chính vẫn đầy đủ.
- Bundle base JS: 186.095 bytes (guard CI < 190.000); embed launcher không đổi (7.657 bytes). Không thêm dependency bundle nào — Transformers.js/WebLLM đều CDN-import runtime.
## v45 — Local Agent theo môi trường wrapper

| Môi trường | WebGPU | Local Agent |
|---|---|---|
| Chrome desktop / Android 121+ | Có | Chạy được (opt-in, nặng RAM) |
| Android WebView (Capacitor) | Disable mặc định | Coi là KHÔNG hỗ trợ |
| Safari iOS 18+ | Có (Safari) | Có thể; không đảm bảo |
| iOS WKWebView (Capacitor) | Không như Safari | Coi là KHÔNG hỗ trợ |
| PWA install (Android/iOS) | Theo browser host | Theo host |

Rules / BM25 / Calculator / Recommendation không phụ thuộc WebLLM: khi Local Agent không chạy, mọi tính năng cơ bản vẫn đầy đủ (bắt buộc bởi kiến trúc + test). Xem docs/MOBILE.md và docs/PWA.md.
