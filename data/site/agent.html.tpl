<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="motoai-build" content="v76">
  <title>Hỏi Agent MotoAI — Ứng dụng thuê xe máy &amp; xe điện: hỏi giá</title>
  <meta name="description" content="Ứng dụng web thuê xe máy và xe điện: Agent trả lời giá thuê, chọn xe, tính chi phí theo ngày/tuần/tháng, thủ tục nhận xe và địa chỉ của {{ business.display_name }}.">
  <meta name="google-site-verification" content="V7GztRa9fpvjtJRAfsu4tQXPrV3VzlMdDJuSsILbkx0" />
  <link rel="canonical" href="https://chatbot.thuexemaynguyentu.com/agent/">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color">
  <link rel="stylesheet" href="/assets/css/style.css?v=0">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MotoAI — {{ business.display_name }}">
  <meta property="og:title" content="Hỏi Agent MotoAI — Ứng dụng thuê xe máy & xe điện">
  <meta property="og:description" content="Hỏi giá, chọn xe, tính chi phí và xem thủ tục thuê xe máy bằng Agent — chạy ngay trên trình duyệt.">
  <meta property="og:url" content="https://chatbot.thuexemaynguyentu.com/agent/">
  <meta property="og:image" content="https://chatbot.thuexemaynguyentu.com/assets/icons/icon-512.png">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:image:alt" content="MotoAI — Trợ lý thuê xe máy">
  <meta property="og:locale" content="vi_VN">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Hỏi Agent MotoAI — Ứng dụng thuê xe máy & xe điện">
  <meta name="twitter:description" content="Hỏi giá, chọn xe, tính chi phí và xem thủ tục thuê xe máy bằng Agent — chạy ngay trên trình duyệt.">
  <meta name="twitter:image" content="https://chatbot.thuexemaynguyentu.com/assets/icons/icon-512.png">
  <script>
    // Apply theme before first paint to avoid a flash.
    (function () {
      try {
        var params = new URLSearchParams(location.search);
        var theme = (params.get('theme') || 'auto').toLowerCase();
        var dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.motoaiTheme = dark ? 'dark' : 'light';
      } catch (e) { /* default to light */ }
    })();
  </script>
</head>
<body class="chat-home">
  <main class="motoai-shell">
    <!-- The chatbot IS the homepage: it opens directly, no landing hero above it. -->
    <section class="motoai-app" id="motoai-app">
      <header class="motoai-header">
        <div class="motoai-header-text">
          <div class="motoai-brand-mark" aria-hidden="true"></div>
          <div>
            <h1 class="motoai-title">Hỗ trợ Agent</h1>
            <p class="motoai-subtitle" id="motoai-subtitle">Địa chỉ: {{ business.address.full }}, {{ business.address.country }}</p>
          </div>
        </div>
        <span class="motoai-status" id="motoai-status" role="status" aria-live="polite"></span>
        <div class="motoai-header-actions">
          <button type="button" class="motoai-theme blog-theme-toggle" id="blog-theme-toggle" aria-label="Chủ đề: tự động" title="Chủ đề: Auto → Sáng → Tối">Auto</button>
          <button type="button" class="motoai-install" id="motoai-install" hidden title="Cài MotoAI như một ứng dụng" aria-label="Cài Agent">Cài Agent</button>
          <button type="button" class="motoai-menu" id="motoai-menu-btn" title="Mở menu" aria-label="Mở menu" aria-expanded="false" aria-controls="motoai-drawer"><span class="menu-lines" aria-hidden="true"></span> <span class="motoai-menu-label">Menu</span></button>
        </div>
      </header>

      <section class="motoai-messages" id="motoai-messages" aria-live="polite" aria-label="Tin nhắn"></section>

      <div class="motoai-quick" id="motoai-quick" role="group" aria-label="Câu hỏi nhanh"></div>

      <div class="motoai-ai-panel" id="motoai-ai-panel">
        <div class="motoai-ai-explain" id="motoai-ai-explain" hidden>
          <strong>Agent (tùy chọn, nâng cao)</strong>
          <ul>
            <li>Agent chạy trên thiết bị của bạn và không cần API key — không gửi hội thoại đi đâu.</li>
            <li>Model AI chỉ tải sau khi bạn bấm xác nhận bên dưới và có thể nặng vài trăm MB.</li>
            <li>Dùng bộ nhớ và dung lượng của thiết bị; cần trình duyệt hỗ trợ WebGPU.</li>
            <li>Luôn tắt được; trợ lý cơ bản hoạt động bình thường mà không cần nó.</li>
          </ul>
          <button type="button" class="motoai-ai-confirm" id="motoai-ai-confirm">Tải model và bật Agent</button>
          <button type="button" class="motoai-ai-cancel" id="motoai-ai-cancel">Để sau</button>
        </div>
        <div class="motoai-ai-status" id="motoai-ai-status" hidden>
          <div class="motoai-ai-progress"><div class="motoai-ai-progress-bar" id="motoai-ai-progress-bar"></div></div>
          <span id="motoai-ai-status-text"></span>
          <button type="button" class="motoai-ai-off" id="motoai-ai-off" hidden>Tắt</button>
        </div>
      </div>

      <form class="motoai-composer" id="motoai-composer">
        <textarea class="motoai-input" id="motoai-input" name="message" rows="1"
               placeholder="Nhập câu hỏi của bạn..." autocomplete="off"
               enterkeyhint="send" maxlength="2000" aria-label="Câu hỏi"></textarea>
        <button class="motoai-send" type="submit" id="motoai-send" aria-label="Gửi câu hỏi"></button>
      </form>

      <!-- Bottom dock (v50): 4-item customer navigation, below the composer. -->
      <nav class="motoai-dock" id="motoai-dock" aria-label="Điều hướng nhanh">
        <a class="motoai-dock-item" href="/blog/thue-xe/"><span class="motoai-dock-icon" aria-hidden="true" data-icon="scooter"></span><span>Dịch vụ</span></a>
        <button type="button" class="motoai-dock-item" id="motoai-dock-contact"><span class="motoai-dock-icon" aria-hidden="true" data-icon="phone"></span><span>Liên hệ</span></button>
        <button type="button" class="motoai-dock-item" id="motoai-dock-price"><span class="motoai-dock-icon" aria-hidden="true" data-icon="tag"></span><span>Giá thuê</span></button>
        <a class="motoai-dock-item" id="motoai-dock-map" href="#" target="_blank" rel="noopener noreferrer"><span class="motoai-dock-icon" aria-hidden="true" data-icon="map"></span><span>Bản đồ</span></a>
      </nav>
    </section>

    <!-- Supporting SEO copy (v47.1): AFTER the chatbot, unobtrusive. Hidden in embed mode. -->
    <section class="motoai-seo" id="motoai-seo" aria-label="Giới thiệu MotoAI">
      <p class="motoai-seo-copy">
        MotoAI là app thuê xe máy, app thuê xe điện và ứng dụng thuê xe máy điện dạng web:
        hỏi giá thuê, chọn loại xe phù hợp, tính chi phí theo ngày – tuần – tháng, xem thủ tục
        nhận xe và tìm địa chỉ của {{ business.display_name }} — trả lời ngay trên trình duyệt,
        không cần cài đặt. Đọc thêm <a href="/blog/">cẩm nang thuê xe máy &amp; xe điện</a>:
        <a href="/blog/app/app-thue-xe-may-la-gi/">app thuê xe máy là gì</a>
        và <a href="/blog/huong-dan/thu-tuc-thue-xe-may/">thủ tục thuê xe máy</a>.
      </p>
      <details>
        <summary>Ứng dụng thuê xe máy MotoAI là gì?</summary>
        <p>MotoAI là ứng dụng web hỏi đáp thuê xe máy và xe điện: hỏi giá theo loại xe và thời gian, được gợi ý chọn xe, tính chi phí thuê, xem thủ tục nhận xe và tìm địa chỉ — chạy ngay trên trình duyệt, không cần cài đặt, không cần tài khoản.</p>
      </details>
      <details>
        <summary>Thuê xe máy cần thủ tục gì?</summary>
        <p>Bạn cần giấy tờ tùy thân (CCCD hoặc hộ chiếu), bằng lái phù hợp với dung tích xe và tiền đặt cọc từ {{ business.policies.deposit.min | vnd }} đến {{ business.policies.deposit.max | vnd }} tùy loại xe. Mức cọc chính xác được xác nhận khi đặt xe. Xem <a href="/chinh-sach/">chính sách thuê xe</a>.</p>
      </details>
      <details>
        <summary>Cửa hàng mở cửa lúc mấy giờ?</summary>
        <p>Cửa hàng ở {{ business.address.full }}, hoạt động {{ business.hours.display }} hằng ngày. Xem <a href="/lien-he/">thông tin liên hệ</a> hoặc <a href="/gia-thue/">bảng giá thuê xe</a>.</p>
      </details>
    </section>
  </main>

  <!-- Menu drawer (hidden in embed mode): navigation + contact + clear action. -->
  <!-- @generated drawer: renderDrawer({ mode: "chat" }) in tools/menu-drawer.mjs -->

  <noscript>MotoAI cần JavaScript để hoạt động. Vui lòng gọi {{ business.contact.phone_display }} để được hỗ trợ.</noscript>

  <script type="application/ld+json" id="motoai-schema">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": "https://chatbot.thuexemaynguyentu.com/agent/#app",
    "name": "MotoAI — Ứng dụng thuê xe máy & xe điện",
    "url": "https://chatbot.thuexemaynguyentu.com/agent/",
    "applicationCategory": "TravelApplication",
    "operatingSystem": "Web browser",
    "inLanguage": "vi",
    "description": "Ứng dụng web hỏi đáp thuê xe máy và xe điện: giá thuê, chọn xe, tính chi phí, thủ tục và địa chỉ của {{ business.display_name }}.",
    "offers": { "@type": "Offer", "price": "{{ price.from.day | raw }}", "priceCurrency": "VND", "description": "Giá thuê xe máy tham khảo theo ngày, bắt đầu từ {{ price.from.day }}." },
    "author": {
      "@type": "Organization",
      "@id": "https://chatbot.thuexemaynguyentu.com/#organization",
      "name": "{{ business.display_name }}",
      "url": "https://chatbot.thuexemaynguyentu.com/",
      "sameAs": ["{{ business.url }}"],
      "telephone": "{{ business.contact.phone_uri | tel }}",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "{{ business.address.street }}",
        "addressLocality": "{{ business.address.ward }}, {{ business.address.district }}, {{ business.address.city }}",
        "addressCountry": "VN"
      }
    }
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Ứng dụng thuê xe máy MotoAI là gì?",
        "acceptedAnswer": { "@type": "Answer", "text": "MotoAI là ứng dụng web hỏi đáp thuê xe máy và xe điện: hỏi giá theo loại xe và thời gian, được gợi ý chọn xe, tính chi phí thuê, xem thủ tục nhận xe và tìm địa chỉ — chạy ngay trên trình duyệt, không cần cài đặt, không cần tài khoản." }
      },
      {
        "@type": "Question",
        "name": "Thuê xe máy cần thủ tục gì?",
        "acceptedAnswer": { "@type": "Answer", "text": "Bạn cần giấy tờ tùy thân (CCCD hoặc hộ chiếu), bằng lái phù hợp với dung tích xe và tiền đặt cọc từ {{ business.policies.deposit.min | vnd }} đến {{ business.policies.deposit.max | vnd }} tùy loại xe. Mức cọc chính xác được xác nhận khi đặt xe." }
      },
      {
        "@type": "Question",
        "name": "Cửa hàng mở cửa lúc mấy giờ?",
        "acceptedAnswer": { "@type": "Answer", "text": "Cửa hàng ở {{ business.address.full }}, hoạt động {{ business.hours.display }} hằng ngày." }
      }
    ]
  }
  </script>

  <script type="module" src="/assets/js/main.js?v=0"></script>
</body>
</html>
