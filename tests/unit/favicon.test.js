import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p));

test('favicon.ico holds 16, 32 and 48 px PNG entries (Google Search wants a multiple of 48 px)', () => {
  const ico = read('favicon.ico');
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], 'ICO header');
  const count = ico.readUInt16LE(4);
  const entries = Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i;
    const size = ico[at] || 256;
    const offset = ico.readUInt32LE(at + 12);
    const png = ico.subarray(offset, offset + ico.readUInt32LE(at + 8));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size, 'PNG width matches the directory entry');
    return size;
  });
  assert.deepEqual(entries, [16, 32, 48]);
});

test('every page shell declares the favicon (homepage, Agent, article, 404)', () => {
  const pages = {
    'index.html': '', 'agent/index.html': '/', 'blog/thue-xe/thue-xe-ga/index.html': '../../../', '404.html': '/'
  };
  for (const [page, prefix] of Object.entries(pages)) {
    const html = read(page).toString();
    assert.ok(html.includes(`<link rel="icon" href="${prefix}favicon.ico" sizes="16x16 32x32 48x48">`), page);
    assert.ok(html.includes(`<link rel="icon" href="${prefix}assets/icons/icon.svg" type="image/svg+xml">`), page);
  }
});

test('favicon.ico is generated with the PWA icons and committed by the distribution workflow', () => {
  assert.match(read('tools/gen-icons.py').toString(), /write_ico\(os\.path\.join\(here, 'favicon\.ico'\), FAVICON_SIZES\)/);
  assert.match(read('.github/workflows/distribution.yml').toString(), /git add assets\/icons\/\*\.png favicon\.ico/);
});
