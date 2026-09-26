/**
 * Fake WebLLM module factory for tests.
 * Mirrors the real contract: CreateMLCEngine + prebuiltAppConfig.model_list
 * records ({ model_id, vram_required_MB, low_resource_required }).
 */

/** A realistic subset of the real WebLLM 0.2.85 model_list. */
export const REALISTIC_MODEL_LIST = [
  { model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', vram_required_MB: 944.62, low_resource_required: true },
  { model_id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', vram_required_MB: 1300, low_resource_required: true },
  { model_id: 'Qwen3-0.6B-q4f16_1-MLC', vram_required_MB: 1010, low_resource_required: true },
  { model_id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', vram_required_MB: 2300, low_resource_required: true },
  { model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram_required_MB: 1128.82, low_resource_required: true },
  { model_id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', vram_required_MB: 6100 },
  { model_id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', vram_required_MB: 5700 }
];

/**
 * @param {object} [options]
 * @param {Array}   [options.modelList]  - model records exposed via prebuiltAppConfig.
 * @param {string}  [options.engineError] - make CreateMLCEngine reject with this message.
 * @param {string}  [options.reply]       - canned chat completion content.
 * @returns {function} async importFn for createLocalLlm.
 */
export function createWebllmImportFn(options = {}) {
  const modelList = options.modelList ?? REALISTIC_MODEL_LIST;
  return async () => ({
    CreateMLCEngine: async (modelId, { initProgressCallback } = {}) => {
      if (options.engineError) throw new Error(options.engineError);
      if (options.verifyModel && !modelList.some((m) => m.model_id === modelId)) {
        throw new Error(`Cannot find model record in appConfig for ${modelId}`);
      }
      initProgressCallback?.({ progress: 0.4, text: 'shard 1/2' });
      initProgressCallback?.({ progress: 1, text: 'done' });
      return {
        chat: {
          completions: {
            create: async () => ({ choices: [{ message: { content: options.reply ?? 'ok' } }] })
          }
        }
      };
    },
    prebuiltAppConfig: { model_list: modelList }
  });
}
