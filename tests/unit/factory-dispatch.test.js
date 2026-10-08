import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const publisher = readFileSync(new URL('../../.github/workflows/writer-publisher.yml', import.meta.url), 'utf8');
const start = publisher.indexOf("      - name: 'Run the factory for exactly this chunk'");
const block = publisher.slice(start, publisher.indexOf('\n      - name:', start + 1));
const shell = block.slice(block.indexOf('        run: |\n') + '        run: |\n'.length).split('\n').map((s) => s.replace(/^          /, '')).join('\n');

for (const includeOurRun of [true, false]) {
  test(`publisher ${includeOurRun ? 'watches its correlated run even after HEAD moves' : 'refuses an unrelated GREEN run'}`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-dispatch-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const runs = [{ databaseId: 99, displayTitle: 'Factory BA-0400,BA-0401 request 999-1' }];
    if (includeOurRun) runs.push({ databaseId: 42, displayTitle: 'Factory BA-0305,BA-0306 request 123-1' });
    writeFileSync(join(dir, 'runs.json'), JSON.stringify(runs));
    writeFileSync(join(dir, 'gh'), `#!/bin/bash\nset -e\nif [ "$1 $2" = "workflow run" ]; then exit 0; fi\nif [ "$1 $2" = "run list" ]; then cat "$FIXTURE/runs.json"; exit 0; fi\nif [ "$1 $2" = "run watch" ]; then echo "$3" > "$FIXTURE/watched"; [ "$3" = 42 ]; exit; fi\nexit 2\n`, { mode: 0o755 });
    writeFileSync(join(dir, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
    const out = join(dir, 'outputs');
    const result = spawnSync('bash', ['-e', '-c', shell], { cwd: dir, encoding: 'utf8', env: { ...process.env,
      PATH: `${dir}:${process.env.PATH}`, FIXTURE: dir, IDS: 'BA-0305,BA-0306', MODE: 'new', SHA: 'old-head',
      GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: out } });
    if (includeOurRun) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(dir, 'watched'), 'utf8').trim(), '42');
      assert.match(readFileSync(out, 'utf8'), /run_id=42\nresult=success/);
    } else {
      assert.equal(result.status, 1);
      assert.match(result.stdout, /factory run not found/);
    }
  });
}

test('continuation is a separate bounded job after healthy publication or a new reservation', () => {
  const continuation = publisher.slice(publisher.indexOf("      - name: 'Continue with one new writer job"), publisher.indexOf("      - name: 'Factory failed"));
  assert.match(continuation, /steps\.factory\.outputs\.result == 'success'/);
  assert.match(continuation, /ops-agent\.mjs gate/);
  assert.equal((continuation.match(/gh workflow run auto-writer\.yml/g) ?? []).length, 1);
  const coordinator = readFileSync(new URL('../../.github/workflows/writer-coordinator.yml', import.meta.url), 'utf8');
  assert.match(coordinator, /created == 'true' && inputs\.dry_run != 'true'/);
});
