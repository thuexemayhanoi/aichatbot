/**
 * tools-sync-web.mjs — copy app web canonical → integrations/mobile/www/
 *
 * All-deterministic: không transform, không minify, không network — chỉ copy
 * đúng các file static của GitHub Pages site (một engine duy nhất, không fork
 * business logic). www/ KHÔNG được commit.
 *
 * Run: node tools-sync-web.mjs   (từ integrations/mobile/)
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const www = join(here, 'www');

const TARGETS = [
  ['index.html', ['index.html']],
  ['manifest.webmanifest', ['manifest.webmanifest']],
  ['service-worker.js', ['service-worker.js']],
  ['embed.js', ['embed.js']],
  ['assets', ['assets']],
  ['src', ['src']],
  ['data', ['data']],
  ['blog', ['blog']],
  ['robots.txt', ['robots.txt']],
  ['sitemap.xml', ['sitemap.xml']]
];

if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

let copied = 0;
for (const [dest, sources] of TARGETS) {
  for (const src of sources) {
    const from = join(repoRoot, src);
    cpSync(from, join(www, dest), { recursive: true });
    copied += 1;
  }
}
console.log(`www/ rebuilt from canonical web app (${copied} targets). Not committed.`);
