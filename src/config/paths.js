/**
 * Central registry of every asset path MotoAI loads at runtime.
 * All paths are RELATIVE so the same code works:
 *  - at a GitHub Pages project URL (https://user.github.io/<repo>/)
 *  - at a repository root or a custom domain
 * `withBase()` lets a host page or the embed loader pin an absolute base.
 */

export const PATHS = Object.freeze({
  business: 'data/business/business.json',
  pricing: 'data/business/pricing.json',
  faq: 'data/business/faq.json',
  corpus: 'data/knowledge/corpus.json',
  embeddings: 'data/knowledge/embeddings.json',
  styles: 'src/styles/',
  orama: 'vendor/orama/orama.esm.js'
});

/**
 * Resolve PATHS against a base.
 * Absolute URLs and root-relative paths are passed through untouched.
 */
export function withBase(base = '.') {
  const trimmed = String(base ?? '.').replace(/\/+$/, '');
  const resolve = (path) =>
    path.startsWith('http') || path.startsWith('/') ? path : `${trimmed}/${path}`;
  const resolved = {};
  for (const [key, value] of Object.entries(PATHS)) {
    resolved[key] = resolve(value);
  }
  return resolved;
}
