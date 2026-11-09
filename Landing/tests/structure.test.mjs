import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const LANDING_DIR = fileURLToPath(new URL('../', import.meta.url));
const SECTION_DIRS = ['demo', 'tech', 'journey'];

async function importsOf(dir) {
  const result = [];
  for (const name of await readdir(join(LANDING_DIR, dir))) {
    if (!name.endsWith('.js')) continue;
    const text = await readFile(join(LANDING_DIR, dir, name), 'utf8');
    for (const [, from] of text.matchAll(/^import .* from '([^']+)';$/gm)) result.push({ file: `${dir}/${name}`, from });
  }
  return result;
}

test('shared 모듈은 섹션 폴더(demo, tech, journey)를 import하지 않는다', async () => {
  const wrong = (await importsOf('shared')).filter(({ from }) => !from.startsWith('./'));
  assert.deepEqual(wrong, []);
});

test('섹션 폴더끼리는 서로 import하지 않고 shared만 가져다 쓴다', async () => {
  const wrong = [];
  for (const dir of SECTION_DIRS) {
    for (const entry of await importsOf(dir)) {
      if (!entry.from.startsWith('./') && !entry.from.startsWith('../shared/')) wrong.push(entry);
    }
  }
  assert.deepEqual(wrong, []);
});
