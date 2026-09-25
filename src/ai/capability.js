/**
 * Local-AI capability detection.
 *
 * Pure and Node-testable: everything browser-specific is read from the
 * injected `env` object (default: globalThis). Nothing here throws and
 * nothing downloads anything — detection only.
 */

/**
 * @param {object} [env] - browser-ish environment (globalThis in production,
 *                        a stub in tests). Reads: navigator, WebGPU glue.
 * @returns {{
 *   webgpu: boolean,
 *   webgpuReason: string,
 *   deviceMemoryGb: number|null,
 *   cores: number|null,
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

  // WebLLM small models (q4f16 0.5B–1B) practically need ~2 GB+ RAM.
  if (deviceMemoryGb !== null && deviceMemoryGb < 2) {
    reasons.push(`deviceMemory ${deviceMemoryGb}GB < 2GB`);
  }

  const storage = detectStorage(env);
  if (!storage.ok) reasons.push(storage.reason);

  return {
    webgpu: webgpu.ok,
    webgpuReason: webgpu.reason,
    deviceMemoryGb,
    cores,
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

function detectStorage(env) {
  // WebLLM caches model shards in the Cache API.
  if (typeof env?.caches?.open === 'function') return { ok: true, type: 'caches' };
  if (env?.indexedDB) return { ok: true, type: 'indexeddb' };
  if (typeof env?.localStorage?.setItem === 'function') return { ok: true, type: 'localstorage' };
  return { ok: false, reason: 'no storage API for model caching', type: 'none' };
}
