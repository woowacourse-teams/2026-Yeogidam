import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`Frontend release policy: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function assertReleaseHead() {
  let remoteCommit;
  let checkedOutCommit;
  try {
    remoteCommit = git('ls-remote', '--heads', 'origin', 'refs/heads/fe-release').split('\t')[0];
    checkedOutCommit = git('rev-parse', 'HEAD');
  } catch {
    fail('cannot resolve fe-release on origin');
  }
  if (!remoteCommit) fail('cannot resolve fe-release on origin');
  if (checkedOutCommit !== remoteCommit) {
    fail(`checked-out commit ${checkedOutCommit} is not fe-release HEAD ${remoteCommit}`);
  }
}

function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) fail('GITHUB_OUTPUT is not set');
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function parseNonnegativeInteger(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) fail(`${label} must be a nonnegative integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail(`${label} is too large`);
  return number;
}

const [mode, platform, value, versionOrOffset, extra] = process.argv.slice(2);

if (mode === 'validate-branch') {
  if (!['android', 'ios'].includes(platform) || value !== 'fe-release' || !versionPattern.test(versionOrOffset ?? '') || extra !== undefined) {
    fail('select fe-release, an android or ios platform, and a version such as 1.1.0');
  }
  if (process.env.GITHUB_REF_TYPE && process.env.GITHUB_REF_TYPE !== 'branch') {
    fail('select a release branch, not a tag, in Run workflow');
  }
  assertReleaseHead();
  writeOutputs({ app_version: versionOrOffset, platform });
  console.log(`Validated fe-release for ${platform} v${versionOrOffset}`);
  process.exit(0);
}

if (mode !== 'assign-build' || !['android', 'ios'].includes(platform) || !versionPattern.test(value ?? '') || extra !== undefined) {
  fail('usage: node frontend-release-policy.mjs assign-build <android|ios> <version> <build number offset>');
}

assertReleaseHead();
const offset = parseNonnegativeInteger(versionOrOffset, 'build number offset');
const runNumber = parseNonnegativeInteger(process.env.GITHUB_RUN_NUMBER, 'GITHUB_RUN_NUMBER');
if (runNumber === 0) fail('GITHUB_RUN_NUMBER must be positive');

// 오프셋은 최초 설정한 뒤 고정한다. 같은 Actions 실행의 재시도는 같은 번호를 사용한다.
const buildNumber = offset + runNumber;
const limit = platform === 'android' ? 2100000000 : Number.MAX_SAFE_INTEGER;
if (!Number.isSafeInteger(buildNumber) || buildNumber > limit) {
  fail(`${platform} build number limit reached`);
}
writeOutputs({ build_number: buildNumber });
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Frontend Beta\n\n- Platform: ${platform}\n- App version: ${value}\n- Build number: ${buildNumber}\n- Commit: ${git('rev-parse', 'HEAD')}\n`);
}
console.log(`Assigned ${platform} build ${buildNumber} from workflow run ${runNumber}`);
