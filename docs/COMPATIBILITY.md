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

## Hành vi khi thiếu/nhỏ tài nguyên

- Thiếu WebGPU / RAM thấp / không storage: không hiện nút Local AI; chatbot 100% chức năng.
- Model tải dở mà lỗi: status failed + thông báo tiếng Việt; không loading vô hạn (timeout 120s import/init, 45s generation).
- Offline sau lần đầu: data + model đã cache → chatbot vẫn hoạt động (trừ lần đầu chưa tải gì).

## Hiệu năng tham chiếu (đo trên thiết bị thật khi triển khai)

- Base JS: ~116 KB source / ~30–35 KB gzip, 0 dependency.
- First chat render: chỉ phụ thuộc 3 file JSON (~15 KB).
- Model Qwen2.5-0.5B q4f16: download ~350–500 MB (một lần, sau đó cache), init vài giây–vài chục giây tùy GPU.
