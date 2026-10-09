#!/usr/bin/env node
/** Scheduled self-healing orchestration. Never releases maintenance refs. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readDlq, saveDlq, promoteRetries, deferStaged, DLQ_PATH } from './factory-dlq.mjs';
import { readPublicationBudget } from './factory-target.mjs';
import { RECEIPTS_PATH, matrixRows, verifyPublications, saveReceipts, unverifiedIds } from './factory-verification.mjs';
import { recoveryChecksReady, recoveryCodeUnchanged } from './factory-recovery.mjs';
import { inferenceRun } from './ops-recovery-evidence.mjs';
import { validateOpsState } from './ops-agent.mjs';

export const STATE_PATH = 'docs/state/factory-controller.json';
export const PRODUCTION_PATHS = ['auto-writer.yml', 'writer-publisher.yml', 'writer-coordinator.yml', 'blog-factory-publish.yml'];
export const MAX_TECHNICAL_RETRIES = 3;
const ROOT = process.env.MOTOAI_FACTORY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const command = (name, args, timeout = 30000) => execFileSync(name, args, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
const git = (...args) => command('git', args).trim();
const gh = (...args) => command('gh', args);
// Only read-only API calls may be retried automatically. A dispatch with a
// lost response is protected by a persisted intent, never blindly repeated.
const api = (path) => retryTechnicalRead(() => JSON.parse(gh('api', `repos/thuexemayhanoi/aichatbot/${path}`)));
const runNode = (...args) => command(process.execPath, args, args[0] === 'tools/factory-pages.mjs' ? 720000 : 120000);

export function activeProduction(runs, currentId) {
  return runs.filter((run) => String(run.id) !== String(currentId) && run.status !== 'completed'
    && (PRODUCTION_PATHS.some((path) => run.path === `.github/workflows/${path}`)
      || /pages|ops-(?:repair|supervisor|owner)/.test(run.path ?? '')));
}
export function technicalRetryable(log) {
  return /HTTP (?:429|502|503|504)|connection reset|temporary failure|ECONNRESET|ETIMEDOUT|failed to push some refs|non-fast-forward|Pages did not deploy|cannot push after 3 attempts/i.test(log)
    && !/QA FAIL|critical:|unverified|duplicate|contradiction|unsafe|scope.*refus|permission denied|HTTP 403/i.test(log);
}
export function retryTechnicalRead(operation, limit = MAX_TECHNICAL_RETRIES) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TECHNICAL_RETRIES) throw new Error('invalid technical retry limit');
  for (let attempt = 1; attempt <= limit; attempt++) {
    try { return operation(); } catch (error) {
      if (attempt === limit || !technicalRetryable(String(error.stderr || error.message))) throw error;
    }
  }
}
export function unobservedIntent(intent, runs, now = Date.now()) {
  if (!intent || now - Date.parse(intent.at) >= 15 * 60 * 1000) return false;
  return !runs.some((r) => r.path === `.github/workflows/${intent.workflow}`
    && Date.parse(r.created_at) >= Date.parse(intent.at) - 1000);
}
export function decision({ ops, locks, busy, green, incidentPhase, deferred, pending, proofMissing, complete }) {
  if (!ops.production_enabled) return 'OWNER_STOP';
  if (ops.active_incident) {
    if (ops.active_incident.status === 'FAILED_MANUAL') return 'FAILED_MANUAL';
    if (busy || !green) return 'WAIT_MAINTENANCE';
    if (['AGENT4_ESCALATE', 'AGENT4_SUCCESS'].includes(ops.active_incident.status)
      && ops.active_incident.attempts?.agent5 === 0 && locks) return incidentPhase || 'SMOKE';
    return 'WAIT_MAINTENANCE';
  }
  if (locks) return 'LOCKED';
  // Production verification is read-only; it can observe existing live
  // pages while inference is running. Mutations/dispatches still wait.
  if (proofMissing && green) return 'VERIFY';
  if (busy || !green) return 'WAIT';
  if (complete) return 'COMPLETE';
  if (deferred) return 'DEFER_CONTENT';
  if (pending) return 'RETRY_FACTORY';
  return 'WAKE_WRITER';
}

function loadState() {
  const state = existsSync(join(ROOT, STATE_PATH)) ? readJson(STATE_PATH)
    : { schema_version: 1, attempts: {}, recoveries: {}, handled_runs: [], dispatch: null };
  if (state.schema_version !== 1 || !state.attempts || !state.recoveries || !Array.isArray(state.handled_runs)) throw new Error('invalid controller state');
  return state;
}
function persist(state, paths = []) {
  mkdirSync(join(ROOT, 'docs/state'), { recursive: true });
  writeFileSync(join(ROOT, STATE_PATH), JSON.stringify(state, null, 2) + '\n');
  git('config', 'user.name', 'motoai-bot');
  git('config', 'user.email', 'nguyentuantu2482@users.noreply.github.com');
  git('add', STATE_PATH, ...paths);
  if (!git('diff', '--cached', '--name-only')) return;
  git('commit', '-m', 'factory-controller: bounded recovery evidence [skip ci]');
  // Fast-forward only. A stale snapshot aborts instead of overwriting or
  // rebasing another actor's queue/receipt/maintenance state.
  git('push', 'origin', 'HEAD:main');
}
function testedRevision(runs) {
  // Production heartbeats can displace CI from the latest 100 global runs.
  // Fetch CI's own history, and independently re-read both exact-SHA suites.
  const candidates = runs.filter((r) => r.path === '.github/workflows/ci.yml');
  if (!candidates.length) candidates.push(...api('actions/workflows/ci.yml/runs?per_page=10').workflow_runs);
  for (const run of candidates) {
    const evidence = api(`actions/runs?head_sha=${run.head_sha}&per_page=100`).workflow_runs;
    if (!recoveryChecksReady(evidence, run.head_sha)) continue;
    if (command('git', ['merge-base', '--is-ancestor', run.head_sha, 'HEAD']) !== '') continue;
    const paths = git('diff', '--name-only', run.head_sha, 'HEAD').split('\n').filter(Boolean);
    if (recoveryCodeUnchanged(paths)) return run.head_sha;
  }
  return null;
}

function retryFailedChecks(state, runs) {
  const seen = new Set();
  for (const run of runs) {
    if (!['.github/workflows/ci.yml', '.github/workflows/distribution.yml'].includes(run.path) || seen.has(run.path)) continue;
    seen.add(run.path);
    if (run.status !== 'completed' || run.conclusion !== 'failure' || run.head_branch !== 'main'
      || !recoveryCodeUnchanged(git('diff', '--name-only', run.head_sha, 'HEAD').split('\n').filter(Boolean))) continue;
    const key = `check-${run.id}`, record = state.attempts[key] ?? { count: 0, run_attempt: 0 };
    if (record.count >= MAX_TECHNICAL_RETRIES || record.run_attempt >= (run.run_attempt || 1)) continue;
    const logs = gh('run', 'view', String(run.id), '--log-failed');
    if (!technicalRetryable(logs)) continue;
    state.attempts[key] = { count: record.count + 1, run_attempt: run.run_attempt || 1 };
    state.dispatch = { key: `${key}-${run.run_attempt || 1}`, workflow: run.path, at: new Date().toISOString() };
    persist(state); gh('run', 'rerun', String(run.id), '--failed');
    console.log(`Bounded transient infrastructure retry: ${run.id}; QA thresholds unchanged.`);
    return;
  }
}
function dispatch(state, workflow, fields, key) {
  const previous = state.dispatch;
  if (previous?.key === key && Date.now() - Date.parse(previous.at) < 15 * 60 * 1000) return false;
  // Durable intent is committed BEFORE the API mutation. A lost response
  // cannot cause a second dispatch on the immediately following heartbeat.
  state.dispatch = { key, workflow, at: new Date().toISOString() };
  persist(state);
  const args = ['workflow', 'run', workflow, '--ref', 'main'];
  for (const [name, value] of Object.entries(fields)) args.push('-f', `${name}=${value}`);
  gh(...args);
  return true;
}
function inferenceRecovery(state, incident, runs, verificationSha) {
  const record = state.recoveries[incident.incident_id] ??= { attempts: 0 };
  if (record.attempts >= MAX_TECHNICAL_RETRIES) return 'recovery exhausted; lock retained';
  for (const kind of ['smoke', 'dry']) {
    const request = record[`${kind}_request`];
    const run = request && runs.find((r) => r.display_title === `Auto Writer ${request}`);
    if (!request) {
      const tag = `controller-${incident.incident_id}-${kind}-${record.attempts}`;
      record[`${kind}_request`] = tag;
      dispatch(state, 'auto-writer.yml', { dry_run: 'true', smoke_only: String(kind === 'smoke'), request_id: tag }, tag);
      return `read-only ${kind} requested`;
    }
    if (!run) {
      // No correlated queued/running/completed run after a bounded intent
      // window: retry the request at most three times, retain every lock.
      if (state.dispatch?.key === request && Date.now() - Date.parse(state.dispatch.at) > 15 * 60 * 1000) {
        record.attempts++; delete record.smoke_request; delete record.dry_request; persist(state);
      }
      return `waiting for read-only ${kind}`;
    }
    if (run.status !== 'completed') return `waiting for read-only ${kind}`;
    if (run.conclusion !== 'success') {
      record.attempts++; delete record.smoke_request; delete record.dry_request;
      persist(state); return 'read-only recovery refused; incident and lock retained';
    }
    inferenceRun(run, api(`actions/runs/${run.id}/jobs?per_page=100`).jobs, kind === 'dry' ? 'dry-run' : 'smoke');
    record[`${kind}_run_id`] = String(run.id);
  }
  if (record.supervisor_requested) return 'Agent #5 owns independent verification';
  record.supervisor_requested = true;
  dispatch(state, 'ops-supervisor.yml', { incident_id: incident.incident_id, base_sha: incident.base_sha,
    verification_sha: verificationSha, dry_run_id: record.dry_run_id, smoke_run_id: record.smoke_run_id }, `supervisor-${incident.incident_id}`);
  return 'Agent #5 requested with real CI, Distribution, smoke and dry-run proof';
}

const contentStep = 'Content refusal retained for the dead-letter controller';
function deferredRun(runs, dlq, state) {
  for (const run of runs) {
    if (run.path !== '.github/workflows/auto-writer.yml' || run.head_branch !== 'main' || run.status !== 'completed'
      || run.conclusion !== 'success' || !/^Auto Writer /.test(run.display_title ?? '')
      || dlq.handled_runs.includes(String(run.id)) || state.handled_runs.includes(String(run.id))) continue;
    const jobs = api(`actions/runs/${run.id}/jobs?per_page=100`).jobs;
    if (jobs.some((j) => j.steps?.some((s) => s.name === contentStep && s.conclusion === 'success'))) return run;
  }
  return null;
}
function withArtifact(run, name, file, callback) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-evidence-'));
  try {
    gh('run', 'download', String(run.id), '--name', `${name}-${run.id}`, '--dir', dir);
    const path = join(dir, file), evidence = JSON.parse(readFileSync(path, 'utf8'));
    if (evidence.run_id !== String(run.id) || evidence.code_sha !== run.head_sha) throw new Error('artifact/run mismatch');
    return callback(evidence, path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function freshDeferral(evidence) {
  const active = readJson('docs/state/writer-assignments.json').active;
  const chunk = active?.chunks.find((c) => c.seq === evidence.seq);
  return active?.batch_id === evidence.batch && active.status === 'ACTIVE' && chunk?.status === 'RESERVED'
    && JSON.stringify(chunk.ids) === JSON.stringify(evidence.ids);
}
function writerGate() {
  if (process.env.GH_REPO !== 'thuexemayhanoi/aichatbot') throw new Error('writer gate repository mismatch');
  const run = deferredRun(api('actions/runs?per_page=100').workflow_runs, readDlq(ROOT), loadState());
  const blocked = run && withArtifact(run, 'writer-evidence', 'writer-work-auto-dryrun/deferred.json', freshDeferral);
  console.log(`status=${blocked ? 'WAIT_CONTROLLER' : 'OPEN'}`);
}

async function main() {
  if (process.env.GH_REPO !== 'thuexemayhanoi/aichatbot') throw new Error('controller repository mismatch');
  if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('controller requires a clean tracked tree');
  const ops = readJson('docs/state/operations/maintenance.json');
  const invalidOps = validateOpsState(ops);
  if (invalidOps.length) throw new Error(`invalid maintenance state: ${invalidOps.join('; ')}`);
  const state = loadState(), dlq = readDlq(ROOT);
  const rows = matrixRows(readFileSync(join(ROOT, 'data/blog/content-matrix.csv'), 'utf8'));
  const entries = readJson('data/blog/published.json').articles;
  const runs = api('actions/runs?per_page=100').workflow_runs;
  if (unobservedIntent(state.dispatch, runs)) { console.log('Waiting for the persisted dispatch intent; no duplicate request.'); return; }
  const locks = Boolean(git('ls-remote', '--refs', 'origin', 'refs/ops/maintenance-lock/*'));
  const busy = activeProduction(runs, process.env.GITHUB_RUN_ID).length > 0;
  const sha = testedRevision(runs), budget = readPublicationBudget(ROOT);
  const proofMissing = !existsSync(join(ROOT, RECEIPTS_PATH)) || budget.unverified > 0;
  const deferred = !ops.active_incident && !locks && !busy && sha ? deferredRun(runs, dlq, state) : null;
  const pending = rows.filter((r) => ['QA', 'REPAIR', 'PASS', 'PLANNED'].includes(r.status)
    && entries.filter((e) => e.article_id === r.article_id && e.slug === r.slug).length === 1
    && (!dlq.articles[r.article_id] || dlq.articles[r.article_id].status === 'RETRY_READY'));
  const action = decision({ ops, locks, busy, green: !!sha, proofMissing, complete: budget.complete,
    incidentPhase: 'RECOVER_INCIDENT', deferred, pending: pending.length > 0 });
  console.log(`controller=${action} verified=${budget.published}/2000 busy=${busy} lock=${locks}`);
  if (action === 'WAIT' && !busy && !sha) { retryFailedChecks(state, runs); return; }
  if (['OWNER_STOP', 'LOCKED', 'WAIT', 'WAIT_MAINTENANCE', 'FAILED_MANUAL'].includes(action)) return;
  if (action === 'RECOVER_INCIDENT') {
    if (/Auto Writer/i.test(ops.active_incident.source?.workflow ?? '')) console.log(inferenceRecovery(state, ops.active_incident, runs, sha));
    else dispatch(state, 'ops-supervisor.yml', { incident_id: ops.active_incident.incident_id,
      base_sha: ops.active_incident.base_sha, verification_sha: sha }, `supervisor-${ops.active_incident.incident_id}`);
    return;
  }
  if (action === 'VERIFY' || action === 'COMPLETE') {
    const ids = action === 'COMPLETE'
      ? rows.filter((r) => r.status === 'PUBLISHED').map((r) => r.article_id)
      : unverifiedIds(ROOT);
    if (!ids.length) throw new Error('receipt mismatch requires review; never overwrite source');
    if (!busy) runNode('tools/factory-pages.mjs');
    saveReceipts(ROOT, await verifyPublications({ ids, sha: git('rev-parse', 'HEAD') }));
    const files = [RECEIPTS_PATH];
    if (action === 'COMPLETE') {
      if (rows.filter((r) => r.status === 'PUBLISHED').length !== 2000 || !readPublicationBudget(ROOT).complete) throw new Error('completion proof incomplete');
      ops.production_enabled = false; ops.owner_pause_reason = 'Factory complete: 2000 production-verified publications.';
      writeFileSync(join(ROOT, 'docs/state/operations/maintenance.json'), JSON.stringify(ops, null, 2) + '\n');
      const summary = { ...readPublicationBudget(ROOT), verification_sha: git('rev-parse', 'HEAD'), completed_at: new Date().toISOString(), dead_letter: Object.values(dlq.articles).filter((r) => r.status !== 'RESOLVED').length };
      mkdirSync(join(ROOT, 'reports'), { recursive: true });
      writeFileSync(join(ROOT, 'reports/factory-completion.json'), JSON.stringify(summary, null, 2) + '\n');
      files.push('docs/state/operations/maintenance.json', 'reports/factory-completion.json');
    }
    persist(state, files);
    if (!busy) runNode('tools/factory-pages.mjs');
    return;
  }
  if (action === 'DEFER_CONTENT') {
    withArtifact(deferred, 'writer-evidence', 'writer-work-auto-dryrun/deferred.json', (evidence, path) => {
      if (!freshDeferral(evidence)) { state.handled_runs.push(String(deferred.id)); persist(state); return; }
      runNode('tools/writer-queue.mjs', 'defer-content', path);
      persist(state, [DLQ_PATH, 'docs/state/writer-assignments.json']);
    });
    return;
  }
  // A content QA failure is independent of infrastructure incidents. Read
  // only its signed-by-run artifact, defer exact REPAIR rows, preserve bodies.
  const qaRun = runs.find((r) => r.path === '.github/workflows/blog-factory-publish.yml' && r.head_branch === 'main'
    && r.status === 'completed' && r.conclusion === 'failure' && !dlq.handled_runs.includes(String(r.id)) && !state.handled_runs.includes(String(r.id)));
  if (qaRun) {
    const jobs = api(`actions/runs/${qaRun.id}/jobs?per_page=100`).jobs;
    if (jobs.some((j) => j.steps?.some((s) => s.name === 'Retain scoped content QA evidence for bounded retry' && s.conclusion === 'success'))
      && jobs.some((j) => j.steps?.some((s) => s.name === 'Assert clean state; report QA failures' && s.conclusion === 'failure'))) {
      withArtifact(qaRun, 'factory-evidence', 'factory-qa.json', (evidence) => {
        if (evidence.fail_ids.every((id) => rows.find((r) => r.article_id === id)?.status === 'REPAIR')) deferStaged(dlq, evidence, rows, entries);
        else state.handled_runs.push(String(qaRun.id));
      });
      saveDlq(ROOT, dlq); persist(state, [DLQ_PATH]); return;
    }
    state.handled_runs.push(String(qaRun.id)); persist(state); return;
  }
  const awaiting = new Set(unverifiedIds(ROOT));
  const verifiedIds = new Set(rows.filter((r) => r.status === 'PUBLISHED' && !awaiting.has(r.article_id)).map((r) => r.article_id));
  if (promoteRetries(dlq, rows, Date.now(), verifiedIds)) { saveDlq(ROOT, dlq); persist(state, [DLQ_PATH]); return; }
  if (action === 'RETRY_FACTORY') {
    const ids = pending.filter((row) => (state.attempts[row.article_id] ?? 0) < MAX_TECHNICAL_RETRIES).slice(0, 2).map((r) => r.article_id);
    if (!ids.length) {
      for (const row of pending) dlq.articles[row.article_id] = { article_id: row.article_id, stage: 'PUBLISH', cycles: MAX_TECHNICAL_RETRIES,
        status: 'DEAD_LETTER', reason: 'Three safe factory requeues exhausted; retain unpublished source and investigate evidence.', evidence_runs: [] };
      saveDlq(ROOT, dlq); persist(state, [DLQ_PATH]); return;
    }
    for (const id of ids) state.attempts[id] = (state.attempts[id] ?? 0) + 1;
    dispatch(state, 'writer-publisher.yml', { action: 'factory-requeue', ids: ids.join(',') }, `factory-${ids.join('-')}-${Math.max(...ids.map((id) => state.attempts[id]))}`);
    return;
  }
  // Observe again immediately before dispatch, including queued runs.
  if (activeProduction(api('actions/runs?per_page=100').workflow_runs, process.env.GITHUB_RUN_ID).length) return;
  const batch = readJson('docs/state/writer-assignments.json').active;
  const chunk = batch?.chunks.find((c) => c.status === 'RESERVED');
  dispatch(state, 'auto-writer.yml', { dry_run: 'false' }, `writer-${batch?.batch_id || 'new'}-${chunk?.seq || 'next-batch'}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = process.argv[2] === 'writer-gate' ? async () => writerGate() : main;
  run().catch((error) => { console.error(`Controller refused: ${error.message}`); process.exitCode = 1; });
}
