import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** No paid inference APIs, no API keys, no backend — enforced as a test. */
const FORBIDDEN_ENDPOINTS = [
  'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com',
  'api.mistral.ai', 'api.groq.com', 'api.cohere.ai', 'api.together.xyz',
  'openrouter.ai/api', 'dashscope', 'api.deepseek.com', 'huggingface.co/inference'
];
const SECRET_PATTERNS = [
  /OPENAI_API_KEY/i, /ANTHROPIC_API_KEY/i, /GEMINI_API_KEY/i, /MISTRAL_API_KEY/i,
  /GROQ_API_KEY/i, /sk-[A-Za-z0-9]{16,}/, /Bearer\s+[A-Za-z0-9\-._~+/]{16,}/i,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9+/]{16,}['"]/i
];

function listSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(js|mjs|html|json|md|yml)$/i.test(name) && !/node_modules/.test(full)) out.push(full);
  }
  return out;
}

test('no external inference API endpoints anywhere in the project', () => {
  const dirs = ['src', 'assets', 'data', '.github'].map((d) => join(ROOT, d)); // tests dir excluded: it lists the endpoints by design
  const roots = ['index.html', 'embed.js', 'package.json'];
  const files = [...roots.map((f) => join(ROOT, f)), ...dirs.flatMap(listSourceFiles)];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const endpoint of FORBIDDEN_ENDPOINTS) {
      assert.ok(!content.includes(endpoint), `${file} references forbidden inference endpoint ${endpoint}`);
    }
  }
});

test('no API keys or inference secrets in the codebase', () => {
  const dirs = ['src', 'assets', 'data'].map((d) => join(ROOT, d));
  const roots = ['index.html', 'embed.js'];
  const files = [...roots.map((f) => join(ROOT, f)), ...dirs.flatMap(listSourceFiles)];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.exec(content);
      assert.ok(!match, `${file} contains a possible secret: ${match?.[0]}`);
    }
  }
});

test('all outbound URLs are static-asset CDNs only (no inference calls)', () => {
  const checked = [join(ROOT, 'src/ai/local-llm.js'), join(ROOT, 'index.html')];
  for (const file of checked) {
    const content = readFileSync(file, 'utf8');
    const urls = [...content.matchAll(/https:\/\/[a-z0-9.\-/]+/gi)].map((m) => m[0]);
    for (const url of urls) {
      const host = new URL(url).host;
      const allowedStatic = ['esm.run', 'thuexemayhanoi.github.io', 'thuexemaynguyentu.com', 'zalo.me', 'wa.me', 'maps.app.goo.gl', 'github.com']; // github.com = doc link only
      assert.ok(allowedStatic.includes(host) || url.includes('huggingface.co/mlc-ai'),
        `unexpected outbound URL ${url} in ${file}`);
    }
  }
});
