#!/usr/bin/env node
/**
 * Populate integrations/mobile/www with the canonical MotoAI static app.
 * Deterministic copy — the wrapper never contains a second engine,
 * just the same files GitHub Pages serves.
 *
 * Run from integrations/mobile/:  node tools-sync-web.mjs
 * (or from repo root: node integrations/mobile/tools-sync-web.mjs)
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const WWW = join(here, 'www');

const WEB_DIRS = ['src', 'assets', 'data'];
const WEB_FILES = ['index.html', 'embed.js', 'manifest.webmanifest', 'service-worker.js'];

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

for (const dir of WEB_DIRS) {
  cpSync(join(ROOT, dir), join(WWW, dir), { recursive: true });
}
for (const file of WEB_FILES) {
  const from = join(ROOT, file);
  if (existsSync(from)) cpSync(from, join(WWW, file));
}

// Mobile wrapper source label (spec §21): distribution channel tracking.
writeFileSync(
  join(WWW, 'mobile-env.json'),
  JSON.stringify({ wrapper: 'capacitor', source: 'android', platformOverrideHint: true }, null, 2)
);

console.log('synced canonical web app to', WWW);
