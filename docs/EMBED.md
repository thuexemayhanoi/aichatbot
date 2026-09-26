# Embed widget

## Dùng trên bất kỳ website nào

```html
<script
  src="https://thuexemayhanoi.github.io/aichatbot/embed.js"
  data-motoai
  data-lang="vi"
  data-theme="auto"
  data-position="right"
  data-title="Hỗ trợ Agent"
  data-source="myblog"
  data-open="false"
  async>
</script>
```

Không cần React/Vue, không cần build step, không CSS xung đột.

## Thuộc tính

| Attribute | Giá trị | Mặc định | Ghi chú |
|---|---|---|---|
| `data-motoai` | (bắt buộc) | — | Đánh dấu script embed. |
| `data-lang` | `vi`, `en` | `vi` | Ngôn ngữ chat. |
| `data-theme` | `auto`, `light`, `dark` | `auto` | `auto` theo `prefers-color-scheme`. |
| `data-position` | `right`, `left` | `right` | Vị trí launcher. |
| `data-title` | text (max 40 ký tự) | `Hỗ trợ Agent` | aria-label của launcher + dialog. |
| `data-source` | text (max 64 ký tự) | — | Nhãn nguồn, tách storage scope từng trang. |
| `data-open` | `true`/`false` | `false` | Mở widget ngay khi tải trang. |

## Cách hoạt động

- `embed.js` chạy async, không block host; tự mount sau `DOMContentLoaded`.
- Tạo launcher button (fixed, `env(safe-area-inset-*)` cho iPhone notch) + iframe `index.html?embed=1&lang=...&theme=...&source=...`.
- Iframe dùng **cùng core** với direct link (một engine duy nhất).
- Isolation: mọi UI nằm trong iframe — CSS/JS host không thể làm hỏng widget và ngược lại. Không global JS pollution ngoài `window.MotoAIEmbed` (dùng để control thủ công).
- Escape đóng widget (keydown trong host và postMessage `motoai:close` từ trong iframe). Focus chuyển vào iframe khi mở, về launcher khi đóng. `aria-expanded`, `role="dialog"`, `aria-live` đầy đủ.
- Responsive: `width: min(92vw, 384px)`, `height: min(78vh, 640px)`.

## Control bằng JS

```js
MotoAIEmbed.mount(document);                  // mount thủ công / test
const w = document['motoai-embed-mounted'];   // { open, close, toggle, config, frameUrl }
w.open(); w.close(); w.toggle();
```

Mount hai lần không tạo widget duplicate (guard bằng flag trên document).

## Chống xung đột khi nhúng nhiều trang

`data-source` tạo scope storage riêng cho mỗi website host — history/session các trang không đè nhau.
