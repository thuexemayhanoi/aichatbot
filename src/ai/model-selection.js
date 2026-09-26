/**
 * Deterministic local-model selection for WebLLM.
 *
 * Root cause fixed here (v43): the loader used to hard-code one model id
 * ("Qwen2.5-0.5B-Instruct-q4f16_1MLC") that does NOT exist in the current
 * WebLLM `prebuiltAppConfig.model_list` (real id: "...-q4f16_1-MLC", with a
 * dash before MLC), which produced "Cannot find model record in appConfig".
 *
 * The model list shipped with the CURRENT WebLLM module is the only source
 * of truth. MODEL_CANDIDATES below is an ordered PREFERENCE list only —
 * every candidate is verified against the actual list before use, and if
 * none is available `selectBestLocalModel` returns null (Local AI stays
 * gracefully disabled).
 */

/**
 * Ordered preference candidates (small, multilingual, instruct-tuned).
 * Never treated as guaranteed to exist; availability is verified at runtime.
 */
export const MODEL_CANDIDATES = Object.freeze([
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', // multilingual vi/en, ~945 MB VRAM, low_resource_required
  'Qwen3-0.6B-q4f16_1-MLC',
  'Qwen3.5-0.8B-q4f16_1-MLC',
  'Qwen2-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC'
]);

const MAX_SAFE_PARAMS_B = 1.5; // hard ceiling: never pick models larger than 1.5B for chat fallback duty

/**
 * Deterministically select the best compatible model from a WebLLM model_list.
 *
 * Priority (spec): candidate exists in list > low_resource_required >
 * lowest safe VRAM > instruct/chat tuning > multilingual family > smallest.
 *
 * @param {object}  options
 * @param {Array}   [options.modelList]     - WebLLM prebuiltAppConfig.model_list records.
 * @param {object}  [options.capabilities]  - result of detectCapabilities (WebGPU etc.).
 * @param {number|null} [options.deviceMemoryGb] - navigator.deviceMemory when available.
 * @param {Array}   [options.candidates]     - override preference order (tests).
 * @returns {{modelId: string, record: object, reason: string}|null}
 */
export function selectBestLocalModel({ modelList, capabilities, deviceMemoryGb = null, candidates = MODEL_CANDIDATES } = {}) {
  const records = validRecords(modelList);
  if (records.length === 0) return null;
  if (capabilities && capabilities.canUseLocalLlm === false) return null;

  const strict = candidates !== MODEL_CANDIDATES; // explicit preference override: no blind scoring fallback
  const byId = new Map(records.map((record) => [record.model_id, record]));
  const memoryLimitMb = memoryCeilingMb(deviceMemoryGb);

  // 1. Preference order first — but only ids that actually exist and fit.
  for (const candidateId of candidates) {
    const record = byId.get(candidateId);
    if (!record) continue;
    if (!fitsMemory(record, memoryLimitMb)) continue;
    if (tooLarge(record)) continue;
    return {
      modelId: record.model_id,
      record,
      reason: `preference #${candidates.indexOf(candidateId) + 1}, vram ${vramOf(record)}MB`
    };
  }

  // 2. No preferred id available: score everything small enough to run.
  //    (Only for the default preference list; an explicitly provided list is
  //    strict — if none of its ids exists, Local AI stays disabled.)
  if (strict) return null;
  const eligible = records.filter((record) => fitsMemory(record, memoryLimitMb) && !tooLarge(record));
  if (eligible.length === 0) return null;
  const scored = eligible
    .map((record) => ({ record, score: scoreRecord(record) }))
    .sort((a, b) => b.score - a.score || vramOf(a.record) - vramOf(b.record) || (a.record.model_id < b.record.model_id ? -1 : 1));
  const best = scored[0];
  return { modelId: best.record.model_id, record: best.record, reason: `scored ${best.score.toFixed(2)}` };
}

/** Detect parameter count ("0.5B", "1.5B", "7B") from the id; null when unknown. */
export function paramsOf(modelId) {
  const match = /(\d+(?:\.\d+)?)B/i.exec(String(modelId ?? ''));
  return match ? Number(match[1]) : null;
}

function scoreRecord(record) {
  let score = 0;
  if (record.low_resource_required === true) score += 3;
  if (/instruct/i.test(record.model_id)) score += 2;
  if (/qwen/i.test(record.model_id)) score += 2; // multilingual vi/en
  if (/math|coder|deepseek-r1|reason/i.test(record.model_id)) score -= 4; // wrong tool for chat
  const params = paramsOf(record.model_id);
  if (params !== null) score += Math.max(0, 2 - params); // smaller is better
  score -= vramOf(record) / 2048; // lower VRAM wins ties
  return score;
}

function validRecords(modelList) {
  if (!Array.isArray(modelList)) return [];
  return modelList.filter(
    (record) => record && typeof record.model_id === 'string' && record.model_id.length > 0
  );
}

function vramOf(record) {
  const n = Number(record.vram_required_MB);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

function memoryCeilingMb(deviceMemoryGb) {
  const n = Number(deviceMemoryGb);
  // navigator.deviceMemory is a coarse, capped signal (max 8). Give a wide
  // margin; it only excludes clearly insufficient devices.
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * 1024 * 0.6;
}

function fitsMemory(record, memoryLimitMb) {
  if (memoryLimitMb === null) return true;
  return vramOf(record) <= memoryLimitMb;
}

function tooLarge(record) {
  const params = paramsOf(record.model_id);
  return params !== null && params > MAX_SAFE_PARAMS_B;
}
