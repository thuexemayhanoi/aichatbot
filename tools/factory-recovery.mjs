/** Read-only gate for backlog retry following a code repair. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function recoveryChecksReady(runs, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('invalid verification SHA');
  return ['.github/workflows/ci.yml', '.github/workflows/distribution.yml'].every((path) => {
    const latest = runs.filter((run) => run.head_sha === sha && run.head_branch === 'main'
      && run.event === 'push' && run.path === path).sort((a, b) => b.id - a.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}

export function recoveryCodeUnchanged(paths) {
  return paths.every((path) => /^(?:data\/blog\/(?:articles\/|published\.json$|content-matrix\.csv$|knowledge-index\.json$)|blog\/|reports\/|docs\/state\/|sitemap\.xml$|robots\.txt$)/.test(path));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sha = process.argv[2];
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('invalid verification SHA');
  const repo = process.env.GH_REPO;
  if (repo !== 'thuexemayhanoi/aichatbot') throw new Error('unexpected recovery repository');
  const { workflow_runs } = JSON.parse(execFileSync('gh', ['api',
    `repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`], { encoding: 'utf8' }));
  const changed = execFileSync('git', ['diff', '--name-only', sha, 'HEAD'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  console.log(`ready=${recoveryChecksReady(workflow_runs, sha) && recoveryCodeUnchanged(changed)}`);
}
