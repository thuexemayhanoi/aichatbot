/**
 * Local-AI capability detection.
 *
 * Pure and Node-testable: everything browser-specific is read from the
 * injected `env` object (default: globalThis). Nothing here throws and
 * nothing downloads anything — detection only.
 *
 * v65 low-resource policy: WebLLM\'s smallest engines (~0.5B, ~1GB VRAM)
 * still need a real multi-core WebGPU pipeline. iPhones/iPads and other
 * weak devices froze the whole UI when the engine booted, so detection is
 * now conservative by default:
 *   - deviceMemory < 4GB  -> Local LLM disabled, lowResource.
 *   - hardwareConcurrency <= 4 -> Local LLM disabled, lowResource.
 *   - iOS/iPadOS (incl. iPadOS-as-Mac) with unknown memory -> Local LLM
 *     disabled: Safari never exposes navigator.deviceMemory, so "null"
 *     on an Apple mobile device means "unknown", NOT "strong".
 *   - Desktop/WebGPU machines with real memory signals are unaffected.
 */

/**
 * @param {object} [env] - browser-ish environment (globalThis in production,
 *                        a stub in tests). Reads: navigator, WebGPU glue.
 * @returns {{
 *   webgpu: boolean,
 *   webgpuReason: string,
 *   deviceMemoryGb: number|null,
 *   cores: number|null,
 *   mobileApple: boolean,
 *   lowResource: boolean,
 *   storage: boolean,
 *   storageType: string,
 *   canUseLocalLlm: boolean,
 *   reasons: string[]
 * }}
 */
export function detectCapabilities(env = globalThis) {
  const reasons = [];

  const webgpu = detectWebgpu(env);
  if (!webgpu.ok) reasons.push(webgpu.reason);

  const deviceMemoryGb = readDeviceMemory(env);
  const cores = readCores(env);
  const mobileApple = detectMobileApple(env);

  const lowMemory = deviceMemoryGb !== null && deviceMemoryGb < 4;
  const lowCores = cores !== null && cores <= 4;
  // Safari on iOS/iPadOS does not expose navigator.deviceMemory at all.
  // On an Apple mobile device a null reading is "unknown memory", never a
  // green light for a ~1GB-VRAM engine.
  const unknownMemoryMobile = mobileApple && deviceMemoryGb === null;

  if (lowMemory) reasons.push(`deviceMemory ${deviceMemoryGb}GB < 4GB`);
  if (lowCores) reasons.push(`hardwareConcurrency ${cores} <= 4 cores`);
  if (unknownMemoryMobile) reasons.push('unknown memory on iOS/iPadOS (no navigator.deviceMemory)');

  const storage = detectStorage(env);
  if (!storage.ok) reasons.push(storage.reason);

  return {
    webgpu: webgpu.ok,
    webgpuReason: webgpu.reason,
    deviceMemoryGb,
    cores,
    mobileApple,
    lowResource: lowMemory || lowCores || unknownMemoryMobile,
    storage: storage.ok,
    storageType: storage.type,
    canUseLocalLlm: reasons.length === 0,
    reasons
  };
}

function detectWebgpu(env) {
  const gpu = env?.navigator?.gpu;
  if (!gpu) return { ok: false, reason: 'no navigator.gpu (WebGPU unsupported)' };
  if (typeof gpu.requestAdapter !== 'function') {
    return { ok: false, reason: 'navigator.gpu.requestAdapter unavailable' };
  }
  return { ok: true, reason: '' };
}

function readDeviceMemory(env) {
  const dm = env?.navigator?.deviceMemory;
  const n = Number(dm);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readCores(env) {
  const hc = env?.navigator?.hardwareConcurrency;
  const n = Number(hc);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Apple mobile detection that works on all current UA profiles:
 *  - classic iPhone/iPad UA contains "iPhone"/"iPad";
 *  - iPadOS 13+ "Request Desktop Website" masks as Mac Safari: platform
 *    "MacIntel" + maxTouchPoints > 1 (real Macs report 0 touch points).
 */
function detectMobileApple(env) {
  const nav = env?.navigator ?? {};
  const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  const platform = typeof nav.platform === 'string' ? nav.platform : '';
  const touch = Number(nav.maxTouchPoints);
  return platform === 'MacIntel' && Number.isFinite(touch) && touch > 1;
}

function detectStorage(env) {
  // WebLLM caches model shards in the Cache API.
  if (typeof env?.caches?.open === 'function') return { ok: true, type: 'caches' };
  if (env?.indexedDB) return { ok: true, type: 'indexeddb' };
  if (typeof env?.localStorage?.setItem === 'function') return { ok: true, type: 'localstorage' };
  return { ok: false, reason: 'no storage API for model caching', type: 'none' };
}
