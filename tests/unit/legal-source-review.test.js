import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('read-only legal source review preserves original excerpts and missing-term evidence', () => {
  const result = execFileSync('python3', ['-c', [
    'import importlib.util, json',
    'spec = importlib.util.spec_from_file_location("review", "tools/legal-source-review.py")',
    'module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)',
    'print(json.dumps(module.excerpts("Nguyên văn: tốc độ tối đa là mức trần.", ["tốc độ", "không có"]), ensure_ascii=False))',
  ].join('\n')], { encoding: 'utf8' });
  const excerpts = JSON.parse(result);
  assert.equal(excerpts[0].text, 'Nguyên văn: tốc độ tối đa là mức trần.');
  assert.equal(excerpts[1].position, null);
  assert.equal(excerpts[1].text, 'TERM NOT FOUND');
  const owner = readFileSync(new URL('../../.github/workflows/ops-owner-review.yml', import.meta.url), 'utf8');
  const step = owner.slice(owner.indexOf('              legal-source-review)'), owner.indexOf('              pages-test)'));
  assert.match(step, /legal-source-review\.py/);
  assert.ok(!/ops-agent|git commit|git push|production_enabled/.test(step));
});

test('a missing issuer can use only a validated public CA chain, never a disabled TLS verifier', () => {
  const result = execFileSync('python3', ['-c', [
    'import importlib.util',
    'spec = importlib.util.spec_from_file_location("review", "tools/legal-source-review.py")',
    'module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)',
    'assert module.issuer_uri("CA Issuers - URI:http://crt.sectigo.com/issuer.crt") == "http://crt.sectigo.com/issuer.crt"',
    'for url in ["http://127.0.0.1/a", "https://sectigo.com.evil.test/a", "https://user:pass@crt.sectigo.com/a"]:',
    ' try: module.issuer_uri("CA Issuers - URI:" + url)',
    ' except ValueError: continue',
    ' raise AssertionError("untrusted issuer URI accepted")',
    'print("PASS")',
  ].join('\n')], { encoding: 'utf8' });
  assert.match(result, /PASS/);
  const source = readFileSync(new URL('../../tools/legal-source-review.py', import.meta.url), 'utf8');
  assert.match(source, /-verify_hostname/);
  assert.match(source, /-CAfile/);
  assert.ok(!/_create_unverified_context|CERT_NONE|check_hostname\s*=\s*False/.test(source));
});
