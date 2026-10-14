/** One edit updates all blog presentation defaults. No browser runtime dependency. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BLOG_UI = Object.freeze(JSON.parse(readFileSync(join(ROOT, 'config/blog-ui.json'), 'utf8')));
if (!BLOG_UI.summary?.title || !BLOG_UI.related?.title || !BLOG_UI.cta?.articleLabel || !BLOG_UI.cta?.footerLabel) {
  throw new Error('blog-ui: component labels must be present');
}
if (!Number.isInteger(BLOG_UI.related.limit) || BLOG_UI.related.limit < 1 || BLOG_UI.related.limit > 8) {
  throw new Error('blog-ui: related.limit must be from 1 to 8');
}
if (BLOG_UI.banner.enabled && (!BLOG_UI.banner.text || !/^\/(?!\/)/.test(BLOG_UI.banner.href || ''))) {
  throw new Error('blog-ui: enabled banner requires text and safe internal href');
}
export function bannerSlot(esc) {
  if (!BLOG_UI.banner.enabled) return '';
  return '    <aside class="blog-global-banner" aria-label="Thông báo">\n' +
    '      <a href="' + esc(BLOG_UI.banner.href) + '">' + esc(BLOG_UI.banner.text) + '</a>\n' +
    '    </aside>\n';
}
