# Mobile Wrappers — Android & iOS Foundation (Capacitor)

Nền wrapper mobile nằm ở `integrations/mobile/`. KHÔNG có engine chat thứ hai: shell Capacitor bọc đúng web app canonical (cùng `index.html`, `assets/`, `src/`, `data/` mà GitHub Pages phục vụ).

```
integrations/mobile/
├── package.json           # Capacitor deps + scripts
├── capacitor.config.ts    # appId vn.thuexemaynguyentu.motoai, webDir: www
└── tools-sync-web.mjs     # copy web app canonical → www/ (all-deterministic)
```

## Lệnh

```bash
cd integrations/mobile
npm install
node tools-sync-web.mjs     # copy canonical web app vào www/
npx cap add android
npx cap add ios
npx cap sync
npx cap open android        # Android Studio
npx cap open ios            # Xcode (cần macOS)
```

Không commit `android/`, `ios/`, `node_modules/` — sinh khi cần bằng các lệnh trên.

## Hai chiến lược wrapper

**A. Bundled static app (mặc định, khuyến nghị dài hạn).** `tools-sync-web.mjs` copy app vào `www/`; app chạy hoàn toàn offline, không phụ thuộc mạng. Tradeoff: cập nhật Agent phải build lại app (hoặc dùng Capacitor Live Updates — chưa cấu hình trong run này).

**B. Remote canonical URL** (`server.url` trỏ Pages, đang comment trong config). Luôn dùng Agent mới nhất không cần cập nhật app. Tradeoff: không hoạt động offline, cần online ngay từ launch, review store khó hơn với remote content.

Khuyến nghị: **A cho release** (local-first, đúng bản chất sản phẩm), B chỉ để test. Cập nhật được giữ maintainable nhờ sync script all-deterministic — một lệnh tái tạo `www/` từ core.

Source label: khi chạy trong shell Capacitor, app tự gắn `source=android` / `source=ios` (main.js), không chứa dữ liệu cá nhân.

## Local Agent (WebLLM) trên mobile — audit tương thích

| Môi trường | WebGPU | Local Agent |
|---|---|---|
| Chrome Android (WebView/Chrome 121+) | Có (flag/121+ mặc định) | Có thể chạy; nặng RAM, dễ bị hệ điều hành giết process. Opt-in. |
| Android WebView (Capacitor) | WebGPU bị **disable mặc định** trong WebView; cần enable-by-code hoặc WebGPU không khả dụng | Phải coi là KHÔNG hỗ trợ. Base chatbot phải không cần. |
| Safari iOS 26 (WKWebView) | WebGPU chỉ có từ iOS 18+ trong Safari; WKWebView không có quyền truy cập như Safari | Phải coi là KHÔNG hỗ trợ. |
| iOS PWA (homescreen) | Kém ổn định hơn Safari | Không đảm bảo. |

Yêu cầu bắt buộc (đã đảm bảo bằng kiến trúc): **Rules / BM25 / Calculator / Recommendation không phụ thuộc WebLLM.** Nếu Local Agent không chạy, mọi tính năng cơ bản vẫn hoạt động đầy đủ; người dùng thấy thông báo tiếng Việt thân thiện, không lỗi kỹ thuật.

## Build Android — yêu cầu thủ công (chưa publish)

APK debug/release: Android Studio → Build. AAB: `bundleRelease`. Để lên Google Play cần (ngoài run này, làm thủ công):
- Google Play developer account ($25)
- application id cố định (`vn.thuexemaynguyentu.motoai`)
- keystore signing key (release signing, giữ an toàn, không commit)
- store listing + privacy disclosures (chính sách dữ liệu: local-first, không thu thập)
- screenshots đa thiết bị
- Tuân thủ chính sách: app là WebView wrapper thuần content-sở-hữu — khai báo đúng.

**Không tuyên bố app đã lên store.** Chưa có APK/AAB nào được build hoặc submit trong run này.

## Build iOS — yêu cầu thủ công (chưa publish)

Cần Xcode trên macOS: `npx cap add ios` → `npx cap open ios` → scheme App → Archive. Để lên App Store cần:
- Apple Developer account ($99/năm)
- bundle identifier + provisioning profile
- signing certificate (Xcode quản lý)
- screenshots, App Privacy disclosure (không thu thập dữ liệu)
- App Store Connect submission + review

**Không tuyên bố đã submit App Store.** Chưa có build iOS nào trong run này.

## Test

`tests/unit/mobile-config.test.js`: cấu hình Capacitor, scripts, không dependency ngoài @capacitor/*, không platform dirs commit, không secrets, wrapper tái sử dụng app canonical.
