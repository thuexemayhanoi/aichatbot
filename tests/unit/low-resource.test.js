import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCapabilities } from '../../src/ai/capability.js';
import { resolveAgentStartup } from '../../src/ai/agent-session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Real iPadOS 17 "Request Desktop Website" profile: Mac UA + touch. */
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function desktopEnv(overrides = {}) {
  return {
    navigator: {
      gpu: { requestAdapter() {} },
      deviceMemory: 8,
      hardwareConcurrency: 8,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
      ...overrides.navigator
    },
    caches: { open() {} },
    ...overrides
  };
}

// ---------- 1. iPadOS + WebGPU + unknown memory => NOT auto-allowed ----------

test('v65: iPadOS (desktop-masked UA + touch) with WebGPU and no deviceMemory is never allowed the LLM', () => {
  const caps = detectCapabilities(
    desktopEnv({
      navigator: {
        gpu: { requestAdapter() {} },
        deviceMemory: undefined, // Safari never exposes it
        hardwareConcurrency: 6,
        userAgent: IPAD_DESKTOP_UA,
        platform: 'MacIntel',
        maxTouchPoints: 5
      }
    })
  );
  assert.equal(caps.webgpu, true, 'WebGPU is present');
  assert.equal(caps.mobileApple, true, 'MacIntel + maxTouchPoints>1 detected as iPad');
  assert.equal(caps.deviceMemoryGb, null);
  assert.equal(caps.lowResource, true, 'unknown-memory mobile => lowResource');
  assert.equal(caps.canUseLocalLlm, false, 'no green light without a RAM signal');
  assert.ok(caps.reasons.some((r) => /iOS\/iPadOS/.test(r)));
});

test('v65: classic iPhone UA with WebGPU is mobileApple + lowResource, LLM disabled', () => {
  const caps = detectCapabilities(
    desktopEnv({
      navigator: {
        gpu: { requestAdapter() {} },
        deviceMemory: undefined,
        hardwareConcurrency: 6,
        userAgent: IPHONE_UA,
        platform: 'iPhone',
        maxTouchPoints: 5
      }
    })
  );
  assert.equal(caps.mobileApple, true);
  assert.equal(caps.lowResource, true);
  assert.equal(caps.canUseLocalLlm, false);
});

test('v65: a real Mac (maxTouchPoints 0) is NOT mobileApple', () => {
  const caps = detectCapabilities(
    desktopEnv({
      navigator: {
        userAgent: IPAD_DESKTOP_UA,
        platform: 'MacIntel',
        maxTouchPoints: 0,
        deviceMemory: 8,
        hardwareConcurrency: 8
      }
    })
  );
  assert.equal(caps.mobileApple, false);
  assert.equal(caps.lowResource, false);
});

// ---------- 2/3. RAM and core floors ----------

test('v65: deviceMemory 2GB => lowResource, LLM disabled', () => {
  const caps = detectCapabilities(desktopEnv({ navigator: { deviceMemory: 2 } }));
  assert.equal(caps.lowResource, true);
  assert.equal(caps.canUseLocalLlm, false);
  assert.ok(caps.reasons.some((r) => r.includes('deviceMemory 2GB')));
});

test('v65: hardwareConcurrency <= 4 cores => lowResource, LLM disabled', () => {
  for (const cores of [2, 4]) {
    const caps = detectCapabilities(desktopEnv({ navigator: { hardwareConcurrency: cores } }));
    assert.equal(caps.lowResource, true, `${cores} cores must be lowResource`);
    assert.equal(caps.canUseLocalLlm, false);
    assert.ok(caps.reasons.some((r) => r.includes('hardwareConcurrency')));
  }
});

// ---------- 4. Strong desktop unaffected ----------

test('v65: strong desktop + WebGPU + RAM => lowResource=false, LLM still available', () => {
  const caps = detectCapabilities(desktopEnv());
  assert.equal(caps.canUseLocalLlm, true);
  assert.equal(caps.lowResource, false);
  assert.equal(caps.mobileApple, false);
  assert.deepEqual(caps.reasons, []);
});

// ---------- 5/8. Saved consent never auto-starts; manual start stays possible ----------

test('v65: saved consent NEVER auto-starts the engine on reload', () => {
  const caps = detectCapabilities(desktopEnv());
  const startup = resolveAgentStartup({ capabilities: caps, consent: '1' });
  assert.equal(startup.mode, 'consented');
  assert.equal(startup.autoStart, false, 'consent is remembered, the engine is not booted');
  assert.equal(startup.showToggle, true, 'the Agent button stays visible');
  assert.match(startup.hint, /sẵn sàng để bật/);
});

test('v65: no consent on a capable device => toggle shown, no auto start', () => {
  const caps = detectCapabilities(desktopEnv());
  const startup = resolveAgentStartup({ capabilities: caps, consent: null });
  assert.equal(startup.mode, 'available');
  assert.equal(startup.autoStart, false);
  assert.equal(startup.showToggle, true);
  assert.equal(startup.hint, null);
});

test('v65: unsupported device => no toggle, deterministic assistant remains', () => {
  const caps = detectCapabilities(desktopEnv({ navigator: { gpu: undefined } }));
  const startup = resolveAgentStartup({ capabilities: caps, consent: '1' });
  assert.equal(startup.mode, 'unsupported');
  assert.equal(startup.showToggle, false);
  assert.equal(startup.autoStart, false);
});

test('v65: main.js glue contract — exactly one startLocalAi() call site (explicit confirm)', () => {
  const main = readFileSync(join(ROOT, 'assets/js/main.js'), 'utf8');
  const callSites = main.match(/startLocalAi\(\);/g) ?? [];
  assert.equal(callSites.length, 1, 'only the explicit confirm button starts the engine');
  // The old reload-time auto-start condition must be gone for good.
  assert.ok(!main.includes("getItem(ENABLE_STORAGE_KEY) === '1'"), 'no consent===1 engine boot branch');
  // aiOff is bound once outside startLocalAi (no listener accumulation).
  assert.equal((main.match(/aiOff\.addEventListener/g) ?? []).length, 1);
});
