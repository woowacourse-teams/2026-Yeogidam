import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const LANDING_DIR = fileURLToPath(new URL('../', import.meta.url));
const SKIP_DIRS = new Set(['tests', 'assets', 'node_modules', '.vercel']);

// 배포되는 페이지 파일(index.html과 CSS, JS)만 모은다. 테스트와 문서는 자원을 쓰는 곳으로 세지 않는다
async function pageFiles(dir = LANDING_DIR) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await pageFiles(path));
    else if (/\.(html|css|js)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function assetReferences() {
  const refs = [];
  for (const file of await pageFiles()) {
    const text = await readFile(file, 'utf8');
    for (const [, path] of text.matchAll(/(?:\.\.\/)?(assets\/[\w.-]+\.(?:png|jpg|svg|ico))/g)) refs.push({ file: relative(LANDING_DIR, file), path });
  }
  return refs;
}

test('페이지 파일이 가리키는 자원은 모두 assets 폴더에 있다', async () => {
  const missing = (await assetReferences()).filter(({ path }) => !existsSync(join(LANDING_DIR, path)));
  assert.deepEqual(missing, []);
});

test('assets 폴더의 자원은 모두 페이지 파일 어딘가에서 쓴다', async () => {
  const used = new Set((await assetReferences()).map(({ path }) => path));
  const unused = (await readdir(join(LANDING_DIR, 'assets'))).map((name) => `assets/${name}`).filter((path) => !used.has(path));
  assert.deepEqual(unused, []);
});
