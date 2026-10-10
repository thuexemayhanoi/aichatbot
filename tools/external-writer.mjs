#!/usr/bin/env node
/**
 * External prose intake for the ONE-writer factory.
 * An outside AI writes HTML bodies. This deterministic tool registers their
 * matrix metadata; it never calls a model or changes already published prose.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(ROOT, 'data/blog/published.json');
const matrixPath = join(ROOT, 'data/blog/content-matrix.csv');
const pattern = /^data\/blog\/articles\/([^/]+)\.body\.html$/;
const hardMax = 10;

function matrixRows() {
  const [head, ...lines] = readFileSync(matrixPath, 'utf8').trimEnd().split('\n');
  const keys = head.split(',');
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(',').map((value, i) => [keys[i], value])));
}
function clean(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}
function summary(row, html) {
  const first = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1])).find((p) => p.length >= 50);
  const prose = first ?? clean(html);
  const s = prose.slice(0, 150).replace(/\s+\S*$/, '').trim();
  const fallback = (row.working_title + '. ' + row.primary_keyword + ': ' + prose).slice(0, 150).trim();
  return (s.length >= 50 ? s : fallback).slice(0, 165);
}
function register(fileListPath) {
  if (!fileListPath) throw new Error('register --files <changed-path-list>');
  const files = readFileSync(fileListPath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  if (files.some((x) => x.startsWith('docs/state/'))) throw new Error('writer must not push docs/state/**');
  const bodies = files.filter((x) => pattern.test(x));
  if (bodies.length > hardMax) throw new Error('at most 10 article bodies per push (write-ahead queue)');
  if (new Set(bodies).size !== bodies.length) throw new Error('duplicate body path');
  const rows = matrixRows(), bySlug = new Map(rows.map((r) => [r.slug, r]));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.articles)) throw new Error('invalid published.json');
  const byId = new Map();
  for (const a of manifest.articles) {
    if (byId.has(a.article_id)) throw new Error('duplicate manifest article id: ' + a.article_id);
    byId.set(a.article_id, a);
  }
  const newEntries = [];
  for (const body of bodies) {
    const row = bySlug.get(body.match(pattern)[1]);
    if (!row) throw new Error('body not present in matrix: ' + body);
    if (['FAIL', 'BLOCKED'].includes(row.status)) throw new Error('row blocked: ' + row.article_id);
    if (row.status === 'PUBLISHED') continue; // published bodies never re-registered
    if (!existsSync(join(ROOT, body))) throw new Error('body missing: ' + body);
    const prior = byId.get(row.article_id);
    if (prior) {
      if (prior.slug !== row.slug || prior.body !== body || prior.category !== row.category) {
        throw new Error('manifest mismatch: ' + row.article_id);
      }
      continue; // preserve external writer metadata and any existing staged draft
    }
    const html = readFileSync(join(ROOT, body), 'utf8');
    const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => clean(m[1])).filter((x) => x.length >= 80);
    const retrieval = row.agent_retrieval === 'no' ? [] : paragraphs.slice(0, 2).map((x) => x.slice(0, 650));
    newEntries.push({
      article_id: row.article_id, category: row.category, slug: row.slug,
      title: row.working_title, description: summary(row, html),
      published_date: new Date().toISOString().slice(0, 10),
      author: row.author || 'MotoAI Editorial', pilot: false,
      body, knowledge_chunks: retrieval,
    });
  }
  if (newEntries.length) {
    manifest.articles.push(...newEntries);
    const tmp = manifestPath + '.external-writer-tmp';
    writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    renameSync(tmp, manifestPath);
  }
  console.log('registered=' + newEntries.length);
  console.log('ids=' + newEntries.map((x) => x.article_id).join(','));
}
function next() {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const registered = new Set(m.articles.map((x) => x.article_id));
  const rows = matrixRows();
  const pending = rows.filter((r) => ['QA', 'REPAIR', 'PASS', 'WRITING'].includes(r.status));
  console.log('pending=' + pending.map((r) => r.article_id).join(','));
  const planned = rows.filter((r) => r.status === 'PLANNED' && !registered.has(r.article_id));
  for (const row of planned.slice(0, hardMax)) {
    console.log([row.article_id, row.category, row.working_title,
      'data/blog/articles/' + row.slug + '.body.html'].join(' | '));
  }
}
try {
  const [cmd, flag, path] = process.argv.slice(2);
  if (cmd === 'next') next();
  else if (cmd === 'register' && flag === '--files') register(path);
  else throw new Error('usage: node tools/external-writer.mjs next | register --files changed.txt');
} catch (error) {
  console.error('external-writer: ' + error.message);
  process.exitCode = 1;
}
