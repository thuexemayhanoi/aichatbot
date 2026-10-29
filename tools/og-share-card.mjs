#!/usr/bin/env node
/**
 * og-share-card.mjs — render the site's default share image
 * (assets/images/og/motoai-share.png, 1200×630) from tools/og/share-card.html
 * with the pre-installed Chromium. The card uses only the site's own brand
 * mark, colours and font; re-run after changing the HTML.
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/images/og/motoai-share.png');
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(ROOT, 'tools/og/share-card.html')).href);
await page.evaluate(() => document.fonts.ready);
mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${OUT.slice(ROOT.length + 1)}`);
