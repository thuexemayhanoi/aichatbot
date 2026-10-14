import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_UI, bannerSlot } from '../../tools/blog-components.mjs';
import { askAgentAction, appShellPage } from '../../tools/app-shell.mjs';

test('shared presentation defaults preserve 2,000 article HTML output', () => {
  assert.equal(BLOG_UI.summary.title, 'Tóm tắt nhanh');
  assert.equal(BLOG_UI.related.title, 'Bài viết liên quan');
  assert.equal(BLOG_UI.related.limit, 5);
  assert.equal(BLOG_UI.cta.articleLabel, '⚡ Hỏi Agent về chủ đề này');
  assert.equal(bannerSlot(String), '');
  assert.match(askAgentAction('Thủ tục'), /Hỏi Agent về chủ đề này/);
});
test('shared shell retains canonical and site footer', () => {
  const html = appShellPage({ title: 'Test', description: 'Test', path: 'blog/', screen: 'test', contentHtml: '<h1>Test</h1>' });
  assert.match(html, /rel="canonical" href="https:\/\/chatbot.thuexemaynguyentu.com\/blog\/"/);
  assert.match(html, /class="blog-footer-cta"/);
  assert.doesNotMatch(html, /blog-global-banner/);
});
