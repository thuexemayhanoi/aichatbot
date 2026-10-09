/** Read-only, bounded rendering of retained writer evidence for human review. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function renderWriterEvidence(root, limit = 120000) {
  if (!Number.isInteger(limit) || limit < 100 || limit > 200000) throw new Error('invalid evidence log limit');
  const lines = ['EVIDENCE | REVIEW ONLY: this output does not certify QA or enable production.'];
  let remaining = limit;
  const emit = (name, content) => {
    if (remaining <= 0) return;
    const visible = String(content).slice(0, remaining);
    lines.push('EVIDENCE | FILE ' + name, ...visible.split(/\r?\n/).map((line) => 'EVIDENCE | ' + line));
    remaining -= visible.length;
    if (visible.length < String(content).length) lines.push('EVIDENCE | LOG TRUNCATED; the full original remains in the Actions artifact.');
  };
  if (!existsSync(root)) return [...lines, 'EVIDENCE | No generation files were retained.'];
  const qaPath = join(root, 'qa.json');
  if (existsSync(qaPath)) {
    const qa = JSON.parse(readFileSync(qaPath, 'utf8'));
    emit('qa.json summary', JSON.stringify({ code_sha: qa.code_sha, batch: qa.batch, seq: qa.seq,
      ids: qa.ids, models: qa.models, inventory_unchanged: qa.inventory_unchanged,
      snapshots_equal: JSON.stringify(qa.before) === JSON.stringify(qa.after), results: qa.results }, null, 2));
  }
  const files = readdirSync(root, { withFileTypes: true }).filter((f) => f.isFile() && /\.body\.html$/.test(f.name))
    .map((f) => f.name).sort();
  for (const dir of ['candidates', ...(existsSync(qaPath) ? [] : ['components'])]) {
    if (!existsSync(join(root, dir))) continue;
    files.push(...readdirSync(join(root, dir), { withFileTypes: true })
      .filter((f) => f.isFile() && /\.json$/.test(f.name)).map((f) => dir + '/' + f.name).sort());
  }
  for (const file of files) emit(file, readFileSync(join(root, file), 'utf8'));
  if (remaining <= 0) lines.push('EVIDENCE | Remaining files omitted from the log; review the full Actions artifact.');
  return lines;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  for (const line of renderWriterEvidence(process.argv[2] || 'writer-work-auto-dryrun')) console.log(line);
}
