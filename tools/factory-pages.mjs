/** Explicit legacy Pages build after a GITHUB_TOKEN publication commit. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export function assertPagesSource(site, domain) {
  if (site.build_type !== 'legacy' || site.source?.branch !== 'main' || site.source?.path !== '/') {
    throw new Error('Pages source is not the verified main/root legacy deployment; refusing to change settings');
  }
  if (site.cname !== domain) throw new Error('Pages custom domain differs from CNAME');
}

export function buildDecision(build, sha) {
  if (build.commit !== sha) return 'wait';
  if (build.status === 'built') return 'built';
  if (build.status === 'errored') throw new Error(`Pages build failed for ${sha}: ${build.error?.message || 'unknown error'}`);
  if (!['queued', 'building'].includes(build.status)) throw new Error(`unexpected Pages build status: ${build.status}`);
  return 'wait';
}

export async function rebuildPages({ sha, domain, api, log = console.log, pause = delay, polls = 60 }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('invalid publication SHA');
  assertPagesSource(await api(''), domain);
  await api('/builds', 'POST');
  for (let attempt = 0; attempt < polls; attempt++) {
    const build = await api('/builds/latest');
    if (buildDecision(build, sha) === 'built') {
      log(`Pages build verified: ${sha} -> https://${domain}/`);
      return build;
    }
    log(`Pages waiting for ${sha}: observed ${build.commit || 'pending'} ${build.status}`);
    await pause(10000);
  }
  throw new Error(`Pages did not deploy the publication SHA after ${polls} bounded observations`);
}

async function main() {
  const repo = process.env.GH_REPO;
  if (!repo || !process.env.GH_TOKEN) throw new Error('GH_REPO and GH_TOKEN are required for Pages verification');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const domain = readFileSync('CNAME', 'utf8').trim();
  const api = async (path, method = 'GET') => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return JSON.parse(execFileSync('gh', ['api', '--method', method, `repos/${repo}/pages${path}`],
          { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }));
      } catch (error) {
        const detail = String(error.stderr || error.message);
        if (attempt === 2 || !/HTTP (?:429|5\d\d)|timed out|connection reset|temporary failure/i.test(detail)) {
          throw new Error(`Pages API ${method} ${path || '/'} failed: ${detail.slice(0, 400)}`);
        }
        await delay(5000);
      }
    }
  };
  await rebuildPages({ sha, domain, api });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(`Pages verification FAIL: ${error.message}`); process.exitCode = 1; });
}
