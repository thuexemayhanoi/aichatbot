import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = new URL('../../tools/external-writer.mjs', import.meta.url).pathname;
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'external-writer-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'data/blog/articles'), { recursive: true });
  const columns = 'article_id,batch_id,category,status,primary_keyword,working_title,slug,agent_retrieval,author';
  const rows = [
    'BA-0400,B08,GUIDE,PLANNED,thue xe,Huong dan thue xe,huong-dan-thue-xe,yes,MotoAI Editorial',
    'BA-0401,B08,SAFE,PLANNED,quy dinh,Quy dinh moi,quy-dinh-moi,no,MotoAI Editorial',
    'BA-0300,B06,GUIDE,PUBLISHED,da dang,Da dang,da-dang,yes,MotoAI Editorial',
  ];
  writeFileSync(join(dir, 'data/blog/content-matrix.csv'), [columns, ...rows].join('\n') + '\n');
  writeFileSync(join(dir, 'data/blog/published.json'), JSON.stringify({ $schema: 'motoai/blog-published@1', articles: [] }) + '\n');
  const html = '<h2>Chuẩn bị</h2><p>' + 'Thực hiện đối chiếu tình trạng xe tại quầy trước khi ký biên nhận. '.repeat(8) + '</p>';
  for (const slug of ['huong-dan-thue-xe', 'quy-dinh-moi']) {
    writeFileSync(join(dir, 'data/blog/articles', slug + '.body.html'), html);
  }
  const changes = 'data/blog/articles/huong-dan-thue-xe.body.html\ndata/blog/articles/quy-dinh-moi.body.html\n';
  writeFileSync(join(dir, 'changes.txt'), changes);
  return { dir, changes };
}
const run = (dir, ...args) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8', env: { ...process.env, MOTOAI_FACTORY_ROOT: dir },
});

test('single outside writer registers source body files exactly once, preserving content and matrix', (t) => {
  const { dir } = fixture(t);
  const body = join(dir, 'data/blog/articles/huong-dan-thue-xe.body.html');
  const before = readFileSync(body, 'utf8');
  const matrixBefore = readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8');
  let r = run(dir, 'register', '--files', join(dir, 'changes.txt'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /registered=2/);
  let articles = JSON.parse(readFileSync(join(dir, 'data/blog/published.json'))).articles;
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'Huong dan thue xe');
  assert.equal(articles[0].body, 'data/blog/articles/huong-dan-thue-xe.body.html');
  assert.ok(articles[0].description.length >= 50);
  assert.ok(articles[0].knowledge_chunks.length > 0);
  assert.deepEqual(articles[1].knowledge_chunks, [], 'SAFE never gets automated retrieval text');
  r = run(dir, 'register', '--files', join(dir, 'changes.txt'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /registered=0/);
  articles = JSON.parse(readFileSync(join(dir, 'data/blog/published.json'))).articles;
  assert.equal(articles.length, 2);
  assert.equal(readFileSync(body, 'utf8'), before);
  assert.equal(readFileSync(join(dir, 'data/blog/content-matrix.csv'), 'utf8'), matrixBefore);
});

test('unknown body and a pushed state file fail closed before any draft mutation', (t) => {
  const { dir } = fixture(t);
  const path = join(dir, 'data/blog/published.json');
  const baseline = readFileSync(path, 'utf8');
  for (const changes of [
    'data/blog/articles/not-in-matrix.body.html\n',
    'docs/state/writer-assignments.json\ndata/blog/articles/huong-dan-thue-xe.body.html\n',
  ]) {
    writeFileSync(join(dir, 'changes.txt'), changes);
    assert.notEqual(run(dir, 'register', '--files', join(dir, 'changes.txt')).status, 0);
    assert.equal(readFileSync(path, 'utf8'), baseline);
  }
});

test('external writer lists only unpublished and unregistered article IDs', (t) => {
  const { dir } = fixture(t);
  const before = run(dir, 'next');
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /BA-0400/);
  assert.match(before.stdout, /BA-0401/);
  assert.doesNotMatch(before.stdout, /BA-0300/);
  assert.equal(run(dir, 'register', '--files', join(dir, 'changes.txt')).status, 0);
  const after = run(dir, 'next');
  assert.equal(after.status, 0, after.stderr);
  assert.doesNotMatch(after.stdout, /BA-0400/);
  assert.doesNotMatch(after.stdout, /BA-0401/);
});
