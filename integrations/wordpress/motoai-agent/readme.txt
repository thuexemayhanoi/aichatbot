=== MotoAI Agent ===
Contributors: thuexemayhanoi
Tags: chatbot, support, widget, motorbike rental, local-first
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Lightweight loader for the MotoAI motorbike-rental chatbot. No API key, no backend, no bundled engine — the canonical Agent is loaded from GitHub Pages.

== Description ==

MotoAI Agent adds the MotoAI chat widget to any WordPress site with one settings page. The plugin is a thin, safe loader: it prints a single async script tag that loads the canonical embed.js. All chat logic (deterministic rules, BM25 + hybrid retrieval, calculator, recommendation) stays on GitHub Pages and is updated there — updating the Agent does NOT require reinstalling or updating this plugin.

Privacy: the plugin stores only its own settings. Chat conversations are processed in the user's browser (local-first); no conversation data is sent to your WordPress server or to any inference API.

== Installation ==

1. Upload `motoai-agent.zip` via Plugins → Add Plugin → Upload Plugin, then activate.
2. Open Settings → MotoAI Agent and enable the Agent.
3. Optional: restrict pages via include/exclude page IDs, or place `[motoai_agent]` in any post.

== Frequently Asked Questions ==

= Does it need an API key? =
No. There is no OpenAI/Anthropic/Google/Mistral key, no backend, no paid inference. Static CDN asset delivery only.

= How do I update the chatbot? =
You usually don't. The engine lives on GitHub Pages and is updated centrally. Only reinstall the plugin when its loader/settings change.

= Does it work with caching plugins? =
Yes. The loader is a plain async script tag in wp_footer and is cache-safe.

== Changelog ==

= 1.0.0 =
* Initial release: settings page (Settings API), visibility rules, device rules, include/exclude pages, auto-open with delay, `[motoai_agent]` shortcode, uninstall cleanup.
