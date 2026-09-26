/**
 * build-wordpress-plugin.mjs — deterministic ZIP for the MotoAI Agent plugin.
 *
 * Packs integrations/wordpress/motoai-agent/** into dist/motoai-agent.zip:
 *  - every entry lives under the root folder `motoai-agent/` (WP installable)
 *  - entries STORED (no compression) + CRC32, fixed date (1980-01-01) and
 *    sorted paths → byte-stable output (CI artifact is reproducible)
 *  - no third-party dependency (Node stdlib only), no network
 *
 * API (used by tests/unit/wordpress-zip.test.js):
 *   buildPlugin(outPath?)   → Promise<{ path, entries }>
 *   readZipEntries(buffer)  → Promise<Array<{ name, method, crcOk, size }>>
 *
 * CLI: node tools/build-wordpress-plugin.mjs   (writes dist/motoai-agent.zip)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'integrations', 'wordpress', 'motoai-agent');
const OUT_DIR = join(ROOT, 'dist');
const OUT_FILE = join(OUT_DIR, 'motoai-agent.zip');
const ZIP_ROOT = 'motoai-agent';

/** Deterministic CRC-32 (IEEE). */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/** Collect every file under dir as [zipPath (posix, sorted)], with content. */
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...collect(abs));
    else out.push(abs);
  }
  return out;
}

/** DOS date/time fixed at 1980-01-01 00:00:00 → deterministic bytes. */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

/** Build the ZIP buffer; returns { buffer, entries } with entry metadata. */
function buildZipBuffer(files) {
  const chunks = [];
  const central = [];
  const entries = [];
  let offset = 0;
  for (const abs of files) {
    const name = ZIP_ROOT + '/' + relative(SRC, abs).split(sep).join('/');
    const data = readFileSync(abs);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // flags: UTF-8 names
    local.writeUInt16LE(0, 8);           // method: store
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra len
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);             // method: store
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);             // extra
    cd.writeUInt16LE(0, 32);             // comment
    cd.writeUInt16LE(0, 34);             // disk
    cd.writeUInt16LE(0, 36);             // internal attrs
    cd.writeUInt32LE(0, 38);             // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    entries.push({ name, method: 0, crc, crcOk: true, size: data.length });
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return { buffer: Buffer.concat([...chunks, centralBuf, end]), entries };
}

/** Build the plugin ZIP at outPath (default dist/motoai-agent.zip). */
export async function buildPlugin(outPath = OUT_FILE) {
  const files = collect(SRC);
  if (files.length === 0) throw new Error('no plugin files found under ' + SRC);
  const { buffer, entries } = buildZipBuffer(files);
  mkdirSync(join(outPath, '..'), { recursive: true });
  writeFileSync(outPath, buffer);
  return { path: outPath, entries };
}

/** Parse a stored-method ZIP buffer → [{ name, method, crcOk, size }]. */
export async function readZipEntries(buffer) {
  const entries = [];
  let pos = 0;
  while (pos + 30 <= buffer.length && buffer.readUInt32LE(pos) === 0x04034b50) {
    const method = buffer.readUInt16LE(pos + 8);
    const crcStored = buffer.readUInt32LE(pos + 14);
    const size = buffer.readUInt32LE(pos + 18);
    const nameLen = buffer.readUInt16LE(pos + 26);
    const extraLen = buffer.readUInt16LE(pos + 28);
    const name = buffer.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    const data = buffer.slice(dataStart, dataStart + size);
    entries.push({ name, method, crcOk: crc32(data) === crcStored, size });
    pos = dataStart + size;
  }
  return entries;
}

// CLI: write the default dist artifact.
if (process.argv[1] && process.argv[1].endsWith('build-wordpress-plugin.mjs')) {
  const result = await buildPlugin();
  console.log(`dist/motoai-agent.zip: ${result.entries.length} files, ${statSync(result.path).size} bytes (stored, deterministic)`);
}
