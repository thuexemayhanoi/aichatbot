import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Chiến lược A (mặc định): bundled static app — tools-sync-web.mjs copy app
 * canonical vào www/, app chạy offline hoàn toàn.
 * Chiến lược B (chỉ để test): bỏ comment `server.url` để luôn load từ Pages
 * (online bắt buộc, review store khó hơn với remote content).
 */
const config: CapacitorConfig = {
  appId: 'vn.thuexemaynguyentu.motoai',
  appName: 'MotoAI',
  webDir: 'www',
  // server: {
  //   url: 'https://thuexemayhanoi.github.io/aichatbot/',
  //   cleartext: false
  // }
};

export default config;
