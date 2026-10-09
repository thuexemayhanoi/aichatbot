# Báo cáo khôi phục Auto Factory — 2026-10-09

Trạng thái: **ĐANG KIỂM CHỨNG**, chưa RESUME, chưa kết luận SUCCESS.

Repository: https://github.com/thuexemayhanoi/aichatbot

Production: https://chatbot.thuexemaynguyentu.com

## Mốc dữ liệu trước khôi phục

- Base SHA: `43cafac9bc7c27ca31486f80b2dc10c701981fcb`.
- 304 dòng PUBLISHED và 304 bản ghi manifest, trên tổng matrix 2.000 dòng.
- Đối chiếu từng bản ghi manifest và SHA-256 của toàn bộ 304 file body với base: nguyên vẹn.
- Sitemap production: HTTP 200, 365 URL duy nhất, tất cả đúng custom domain.
- BA-0303/BA-0304: HTTP 200, tiêu đề và canonical đúng với manifest/matrix.
- Batch đang mở: `WRITER-BATCH-0013`, chunk #4, BA-0305/BA-0306 RESERVED.
- Incident `INC-20261008144724-577x`: Agent #4 đã ESCALATE; Agent #5 chưa tiêu thụ lượt; production_enabled=false và maintenance lock được giữ.

## Những nguyên nhân và bản sửa

- Writer cũ dùng inference API GitHub Models đã ngừng hoạt động. Repository `/vanchinh` đã hoàn thành 2.000 bài bằng writer bên ngoài; chỉ áp dụng cơ chế QA/publish tương thích, không coi nó là bằng chứng inference local.
- Ollama cũ đợi toàn bộ response dài trước khi trả về, gặp lỗi fetch ở khoảng 5 phút. Adapter hiện đọc streaming NDJSON, có timeout tổng hữu hạn, UTF-8 xuyên chunk, xác nhận done và từ chối dữ liệu bị cắt/lỗi/trailing.
- Monolithic Qwen3 4B streaming ổn định nhưng chỉ sinh 1.199/1.147 từ, bị QA từ chối. Writer hiện sinh outline và năm phần có giới hạn riêng, ghép bài rồi chạy QA thật cho từng bài và cả cặp; không thêm đoạn đệm hoặc cắt bài để đạt độ dài.
- Qwen3 1.7B không đáp ứng độ dài và sinh khẳng định pháp lý sai trong dry-run; không dùng các bài đó. Model hiện là `qwen3:4b-instruct-2507-q4_K_M`, context 4.096, một model/luồng inference, loopback, không API AI trả phí hay token model.
- Schema retrieval cố định mảng rỗng cho SAFE và đúng hai knowledge chunks cho bài retrieval. Giới hạn title/description được đưa vào schema. Mọi component/candidate bị từ chối được lưu để điều tra.
- BA-0305 dùng dữ kiện và nguồn tốc độ đã đối chiếu; loại liên kết pháp lý không liên quan. Các mâu thuẫn pháp lý đã quan sát bị từ chối. Chỉ sửa typo Mai Châu ở dòng BA-0306 còn PLANNED.
- Writer không ghi đè body/manifest có sẵn; full pair QA từ chối trùng câu, đoạn, bài và filler, kể cả khi tổng điểm có thể đạt 70.
- Publisher xác định đúng factory run bằng correlation ID, chờ cả queued/pending, kiểm tra scope bài trước push, retry commit race an toàn có giới hạn và phục hồi staged chunk/checkpoint.
- Coordinator có actions:write và GH_TOKEN; khi reserve batch mới, dispatch đúng một writer tiếp theo. Publisher cũng dispatch một lượt tiếp theo sau checkpoint hoàn tất.
- Factory chủ động yêu cầu Pages build vì push bằng GITHUB_TOKEN không tự kích hoạt Pages. Kiểm tra main/root/custom domain trước, chỉ chấp nhận SHA triển khai đúng commit đã publish. Recovery complete-only vẫn xác minh Pages.
- Watchdog fail-closed khi không quan sát được API, tôn trọng owner pause/incident/lock và chỉ đánh thức một entrypoint khi thực sự idle.
- Recovery Agent #5 yêu cầu CI/Distribution GREEN trên mã đã kiểm chứng, real smoke và dry-run đạt QA với inventory không đổi trước khi nhận incident. Không xóa incident/lock để bỏ qua lỗi.
- Publication budget giới hạn đúng 2.000 PUBLISHED có manifest/body/page đối ứng. Batch cuối bị chặn theo số chỗ còn lại; đạt mục tiêu thì audit, ghi báo cáo hoàn thành và tự tắt production.

## Bằng chứng đã có

| Kiểm tra | Run / SHA | Kết quả thực tế |
| --- | --- | --- |
| Full local tests | `541f728f850299ab353f681b32a451f58987a033` | 944/944 PASS; 0 fail, 0 skip |
| CI | [37882677077](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37882677077) | GREEN trên `541f728` |
| Distribution | [37882677212](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37882677212) | GREEN trên `541f728` |
| Pages | [37882676693](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37882676693) | GREEN trên `541f728` |
| Real exact-model smoke | [37880775795](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37880775795) | Ollama sinh JSON thật; 4B Instruct Q4_K_M; không swap/OOM |
| Token-auth Pages request | [37879032899](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37879032899) | Yêu cầu và xác nhận Pages build đúng SHA `304c1dd5d1978f7348278f657abb8fb1173e24ed` |
| Monolithic 4B dry-run | [37821331522](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37821331522) | RED đúng chuẩn: 1.199/1.147 từ; HTTP streaming 11,45/8,50 phút, swap 0 |
| 1.7B dry-runs | [37878076696](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37878076696), [37879272052](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37879272052) | RED đúng chuẩn; metadata/độ dài/khẳng định nguồn không đạt; không publish |
| 4B Instruct metadata trial | [37880999484](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37880999484) | RED đúng chuẩn: description 195–283 ký tự, vượt 165; RAM còn khoảng 11 GiB, swap 0 |
| Dry-run sau bản sửa metadata | [37883733740](https://github.com/thuexemayhanoi/aichatbot/actions/runs/37883733740) | RED đúng chuẩn: metadata qua, phần đầu 312–351 từ vượt khung ghép bảy phần cũ; chưa có cặp bài đạt QA |

Component của run `37883733740` có số công văn bịa `3045/2024/CP`, tên cơ quan nguồn sai, câu khuyên duy trì tốc độ tối đa trong mọi điều kiện và khẳng định loại ngoại ô/khu công nghiệp khỏi phạm vi khu đông dân cư. Commit `0e8dd08953aaf31aeaa484c2eee4ec3af1b57ce0` đưa các lỗi quan sát đó vào regression và guard nguồn, cung cấp đúng tên văn bản của Sở Giao thông vận tải Lai Châu. Không nới allowlist nguồn.

Bản ghép tiếp theo dùng năm phần 300–370 từ để khớp độ dài tự nhiên đã đo của 4B, với phản hồi retry đúng hướng rút gọn/bổ sung chi tiết. Bộ QA toàn bài/cặp và giới hạn 1.600–2.200 từ giữ nguyên; đây chưa phải bằng chứng production đã khôi phục.

## Điều kiện còn phải chứng minh

1. Cặp BA-0305/BA-0306 sinh thật đạt QA, nội dung đúng và inventory/checkpoint không đổi.
2. Agent #5 xác minh độc lập, đóng đúng incident, lưu lịch sử và giải phóng lock; sau đó owner RESUME.
3. BA-0305/BA-0306 PUBLISHED, factory/Pages triển khai đúng, URL và sitemap sống.
4. Ít nhất một cặp tiếp theo chạy hoàn toàn bằng continuation Actions, không cần request từ phiên Work.
5. Số bài trước/sau và hash 304 bài ban đầu được xác minh lại; lịch và chế độ vận hành tự động được xác nhận.

Chưa có điều kiện nào ở trên được đánh dấu hoàn tất chỉ dựa vào unit test hoặc một smoke ngắn. Báo cáo sẽ được cập nhật bằng run ID, commit SHA và URL thực tế sau khi từng bước đạt.

## Recovery continuation at 05:38 UTC
- Full test suite at `aa8b95bb1f0d4f344aa9edea9cebdf4884c71b84`: 945 passed, zero failures/skips; CI `37886694135`, Distribution `37886694092`, Pages `37886693888` GREEN.
- Real dry-run `37887122359` at `1a51254305c7136be7b64e25d95aa9f431a4be3e` is RED, not a successful recovery proof. Ollama smoke passed; two outlines were refused; the next outline and five sections succeeded (322, 358, 349, 314, 316 words). Complete BA-0305 was refused because it lacked the required HTML action list. BA-0306 was not accepted or published.
- Runner: 15 GiB RAM, 11 GiB available after generation, 3 GiB swap configured with zero use; local streamed requests completed without fetch failures. Original evidence artifact: `11596679245`, SHA-256 `f477d82d9459de0c09ff46fe12146d383730d34c18527160d3048565d3b9da1f`.
- The fourth section now validates its action list within bounded component retry. Whole-article length and full pair QA remain mandatory.
- The Work execution environment returned `409 environment_offline`. Repository access through GitHub remains available. Further full tests execute on GitHub Actions; read-only evidence review can expose the original artifact bodies/components without publishing them.
- Another concrete remaining issue: 200 PLANNED legal-gate rows cover 47 subjects, but most still fall back to unrelated prior article links. Subject-specific current primary-source packs are being prepared. This work is not complete and production remains PAUSED with the incident and maintenance lock preserved.
