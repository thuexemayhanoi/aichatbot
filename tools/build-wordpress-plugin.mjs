#!/usr/bin/env node
/**
 * Deterministic WordPress plugin packager.
 *
 * Builds dist/motoai-agent.zip from integrations/wordpress/motoai-agent/
 * with a fixed file order, fixed timestamps and STORED (uncompressed)
 * entries so the output byte stream is fully deterministic.
 *
 * Pure Node (no dependencies, no native zip needed) — the ZIP format for
 * "stored" entries is simple enough to write directly.
 *
 * Usage:  node tools/build-wordpress-plugin.mjs [output.zip]
 * Import: buildPlugin(outPath) for tests.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = join(ROOT, 'integrations', 'wordpress', 'motoai-agent');
// Fixed 1980-01-01T00:00:00Z DOS timestamp — deterministic output.
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

// ---------- CRC-32 (IEEE, stored entries still require the real CRC) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Recursively collect files (fixed sort order). */
async function collectFiles(dir) {
  const out = [];
  async function walk(d) {
    for (const name of (await readdir(d)).sort()) {
      const full = join(d, name);
      if ((await stat(full)).isDirectory()) await walk(full);
      else out.push(full);
    }
  }
  await walk(dir);
  return out;
}

export async function buildPlugin(outPath) {
  const files = await collectFiles(PLUGIN_DIR);
  if (files.length === 0) throw new Error('plugin source directory is empty');

  const chunks = [];
  const central = [];
  let offset = 0;

  for (const full of files) {
    const name = 'motoai-agent/' + relative(PLUGIN_DIR, full).split(sep).join('/');
    const data = await readFile(full);
    if (data.length === 0) throw new Error(`refusing to zip empty file: ${name}`);
    const crc = crc32(data);

    // Local file header (stored, no extra fields).
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);        // version needed
    local.writeUInt16LE(0, 6);         // flags
    local.writeUInt16LE(0, 8);         // method 0 = stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, Buffer.from(name, 'utf8'), data);

    // Central directory record.
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(DOS_TIME, 12);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, Buffer.from(name, 'utf8')]));

    offset += local.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  await mkdir(dirname(outPath), { recursive: true });
  const stream = createWriteStream(outPath);
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(Buffer.concat([...chunks, centralBuf, end]));
  });
  return { path: outPath, files: files.length, entries: files.map((f) => 'motoai-agent/' + relative(PLUGIN_DIR, f).split(sep).join('/')) };
}

/** Parse a ZIP's central directory (for validation tests). */
export async function readZipEntries(buf) {
  const entries = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a valid zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // Verify the local header + stored data CRC.
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const dataOffset = localOffset + 30 + buf.readUInt16LE(localOffset + 26);
    entries.push({
      name,
      method,
      size,
      crc,
      crcOk: method === 0 && crc32(buf.subarray(dataOffset, dataOffset + size)) === crc
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cdOffset + cdSize) throw new Error('central directory size mismatch');
  return entries;
}

// CLI entry (not under import).
if (process.argv[1] && process.argv[1].endsWith('build-wordpress-plugin.mjs')) {
  const out = process.argv[2] || join(ROOT, 'dist', 'motoai-agent.zip');
  const result = await buildPlugin(out);
  console.log(`built ${result.path} (${result.files} files)`);
}