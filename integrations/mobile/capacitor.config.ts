/**
 * Capacitor configuration — MotoAI mobile wrapper foundation.
 *
 * Strategy A (bundled static shell) is the recommended long-term mode:
 * the canonical MotoAI static app (index.html + assets/ + src/ + data/)
 * is copied to `webDir` and shipped inside the app. The engine stays
 * canonical: the same files served by GitHub Pages, never a fork.
 *
 * Strategy B (remote URL) is available by setting server.url below for
 * testing only — see docs/MOBILE.md for the tradeoffs.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.thuexemaynguyentu.motoai',
  appName: 'MotoAI',
  // Strategy A: bundled canonical static app (copied from repo root).
  // tools/sync-web.mjs populates this directory deterministically.
  webDir: 'www',
  server: {
    // Strategy B (remote, testing only) — uncomment to point at Pages:
    // url: 'https://thuexemayhanoi.github.io/aichatbot/',
    // cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true
  }
};

export default config;
