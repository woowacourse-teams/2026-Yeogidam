import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const script = fileURLToPath(new URL('./frontend-release-policy.mjs', import.meta.url));
const repo = mkdtempSync(join(tmpdir(), 'frontend-release-policy-'));
const remote = mkdtempSync(join(tmpdir(), 'frontend-release-remote-'));
const output = join(repo, 'github-output');

function git(...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function run(mode, args, runNumber = '7') {
  writeFileSync(output, '');
  return spawnSync(process.execPath, [script, mode, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_RUN_NUMBER: runNumber, GITHUB_REF_TYPE: 'branch' },
  });
}

before(() => {
  execFileSync('git', ['init', '--bare', '-q', remote]);
  git('init', '-q');
  git('config', 'user.name', 'Release Policy Test');
  git('config', 'user.email', 'release-policy@example.invalid');
  git('remote', 'add', 'origin', remote);
  git('commit', '--allow-empty', '-q', '-m', 'release commit');
  git('push', '-q', 'origin', 'HEAD:refs/heads/fe-release');
});

after(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(remote, { recursive: true, force: true });
});

test('uses the version entered in Run workflow', () => {
  const result = run('validate-branch', ['android', 'fe-release', '1.2.4']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'app_version=1.2.4\nplatform=android\n');
});

test('rejects other branches', () => {
  for (const branch of ['fe-dev', 'fe-release/1.2.3']) {
    const result = run('validate-branch', ['ios', branch, '1.2.4']);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(output, 'utf8'), '');
  }
});

test('rejects a missing or malformed version', () => {
  for (const version of ['', 'v1.2.4', '1.2', '1.2.4-beta']) {
    const result = run('validate-branch', ['android', 'fe-release', version]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(output, 'utf8'), '');
  }
});

test('uses a fixed offset plus the workflow run number without creating tags', () => {
  const first = run('assign-build', ['android', '1.2.4', '42']);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'build_number=49\n');
  assert.equal(git('tag', '-l'), '');

  const rerun = run('assign-build', ['android', '1.2.4', '42']);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'build_number=49\n');

  const nextRun = run('assign-build', ['android', '1.2.4', '42'], '8');
  assert.equal(nextRun.status, 0, nextRun.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'build_number=50\n');
  assert.equal(git('tag', '-l'), '');
});

test('uses a separate platform offset and checks the Play versionCode limit', () => {
  const ios = run('assign-build', ['ios', '1.2.3', '2']);
  assert.equal(ios.status, 0, ios.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'build_number=9\n');

  const android = run('assign-build', ['android', '1.2.3', '2100000000']);
  assert.notEqual(android.status, 0);
  assert.match(android.stderr, /build number limit reached/);
  assert.equal(readFileSync(output, 'utf8'), '');
});

test('fails before upload if the offset is missing or the version is malformed', () => {
  for (const args of [['android', '1.2.4', ''], ['android', 'v1.2.4', '42']]) {
    const result = run('assign-build', args);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(output, 'utf8'), '');
  }
});

test('rejects a release branch that moved after the run started', () => {
  git('commit', '--allow-empty', '-q', '-m', 'new release commit');
  git('push', '-q', 'origin', 'HEAD:refs/heads/fe-release');
  git('checkout', '--detach', '-q', 'HEAD^');
  const result = run('assign-build', ['android', '1.2.4', '42']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not fe-release HEAD/);
  assert.equal(readFileSync(output, 'utf8'), '');
});
