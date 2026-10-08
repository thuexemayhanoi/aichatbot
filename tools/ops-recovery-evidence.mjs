/** Read-only proof required before consuming Agent #5's single attempt. */
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function greenRun(runs, sha, name) {
  const run = runs.find((r) => r.headSha === sha);
  if (!run || run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error(`${name} has no completed GREEN run for ${sha}`);
  }
  return run;
}

export function inferenceRun(run, jobs, kind) {
  if (run.status !== 'completed' || run.conclusion !== 'success' ||
      run.head_branch !== 'main' || run.path !== '.github/workflows/auto-writer.yml') {
    throw new Error(`${kind} is not a successful main Auto Writer run`);
  }
  const steps = jobs.flatMap((j) => j.steps ?? []);
  const concluded = (name, result) => steps.some((s) => s.name === name && s.conclusion === result);
  if (!concluded('Smoke test local Ollama before long-form generation', 'success')) {
    throw new Error(`${kind} did not execute real Ollama smoke`);
  }
  const generation = 'Generate the next chunk (AI writer + sandboxed production QA)';
  if (!concluded(generation, kind === 'dry-run' ? 'success' : 'skipped')) {
    throw new Error(`${kind} generation step does not match read-only verification`);
  }
  if (kind === 'dry-run' && !concluded('Dry run stop (validated, nothing pushed)', 'success')) {
    throw new Error('dry-run did not reach validated read-only stop');
  }
  for (const prefix of ['Mark the chunk READY_TO_PUSH', 'Push the writer branch', 'Dispatch the writer-publisher']) {
    const step = steps.find((s) => s.name.startsWith(prefix));
    if (!step || step.conclusion !== 'skipped') throw new Error(`${kind} mutation step was not skipped: ${prefix}`);
  }
}

export function dryRunEvidence(evidence, chunk, hashes) {
  if (!evidence.inventory_unchanged || JSON.stringify(evidence.before) !== JSON.stringify(evidence.after)) {
    throw new Error('dry-run changed inventory or checkpoint');
  }
  if (evidence.batch !== chunk.batch_id || evidence.seq !== chunk.seq ||
      JSON.stringify(evidence.ids) !== JSON.stringify(chunk.ids)) {
    throw new Error('dry-run evidence does not cover the current reserved chunk');
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.code_sha ?? '') || !evidence.models?.length ||
      evidence.results?.length !== chunk.ids.length) throw new Error('incomplete dry-run evidence');
  for (const id of chunk.ids) {
    const r = evidence.results.find((v) => v.article_id === id);
    const score = r && new RegExp(`^QA PASS ${id} score=(\\d+)`, 'm').exec(r.qa);
    if (!r || !Number.isInteger(r.words) || r.words < 1600 || r.words > 2200 || !score || Number(score[1]) < 70 ||
        /^FAIL\s|^WARN\s+no-(?:cross-article-duplicate|duplicate-paragraphs|duplicate-sentences|filler)\b/m.test(r.qa)) {
      throw new Error(`${id} lacks passing long-form pair QA`);
    }
  }
  for (const [path, hash] of Object.entries(evidence.after)) {
    if (hashes[path] !== hash) throw new Error(`production changed after dry-run: ${path}`);
  }
}

const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function gh(...args) { return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' }); }
function api(path) { return JSON.parse(gh('api', `repos/${process.env.GH_REPO}/${path}`)); }

function assertTestedCode(sha, paths = []) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('missing verification SHA');
  git('merge-base', '--is-ancestor', sha, 'HEAD');
  const changed = git('diff', '--name-only', sha, 'HEAD', '--', ...paths);
  if (changed) throw new Error(`code changed since verification ${sha}: ${changed}`);
}

function main() {
  const state = readJson(join(ROOT, 'docs/state/operations/maintenance.json'));
  const incident = state.active_incident;
  if (!incident || incident.incident_id !== process.env.INCIDENT_ID) throw new Error('active incident mismatch');
  const ci = JSON.parse(gh('run', 'list', '--workflow', 'ci.yml', '-L', '40', '--json', 'headSha,status,conclusion,databaseId'));
  const sha = process.env.VERIFICATION_SHA || ci[0]?.headSha;
  greenRun(ci, sha, 'CI');
  greenRun(JSON.parse(gh('run', 'list', '--workflow', 'distribution.yml', '-L', '40', '--json', 'headSha,status,conclusion,databaseId')), sha, 'Distribution');
  assertTestedCode(sha, ['tools', 'tests', 'config', '.github/workflows', 'package.json']);

  if (/Auto Writer/i.test(incident.source?.workflow ?? '')) {
    const dryId = process.env.DRY_RUN_ID;
    const smokeId = process.env.SMOKE_RUN_ID;
    if (!/^\d+$/.test(dryId ?? '') || !/^\d+$/.test(smokeId ?? '')) throw new Error('writer incident requires real smoke and dry-run run IDs');
    for (const [id, kind] of [[smokeId, 'smoke'], [dryId, 'dry-run']]) {
      inferenceRun(api(`actions/runs/${id}`), api(`actions/runs/${id}/jobs?per_page=100`).jobs, kind);
    }
    const dir = mkdtempSync(join(tmpdir(), 'ops-evidence-'));
    try {
      gh('run', 'download', dryId, '--name', `writer-evidence-${dryId}`, '--dir', dir);
      const evidence = readJson(join(dir, 'writer-work-auto-dryrun/qa.json'));
      const active = readJson(join(ROOT, 'docs/state/writer-assignments.json')).active;
      const reserved = active?.chunks.find((c) => c.status === 'RESERVED');
      if (!reserved) throw new Error('no reserved chunk to verify');
      const hashes = Object.fromEntries(Object.keys(evidence.after ?? {}).map((p) =>
        [p, createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex')]));
      const bodies = readdirSync(join(ROOT, 'data/blog/articles')).map((f) => `data/blog/articles/${f}`);
      if (bodies.some((p) => !(p in hashes))) throw new Error('published body inventory grew after dry-run');
      dryRunEvidence(evidence, { ...reserved, batch_id: active.batch_id }, hashes);
      assertTestedCode(evidence.code_sha, ['tools/auto-writer.mjs', 'tools/auto-writer-model.mjs',
        'tools/article-qa.mjs', 'tools/blog-factory.mjs', 'tools/factory-target.mjs', 'tools/writer-queue.mjs',
        '.github/workflows/auto-writer.yml', 'config']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(`Independent recovery evidence PASS: CI/Distribution ${sha}, smoke=${process.env.SMOKE_RUN_ID || 'n/a'}, dry-run=${process.env.DRY_RUN_ID || 'n/a'}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main(); } catch (error) { console.error(`Recovery evidence FAIL: ${error.message}`); process.exit(1); }
}
