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

test('섹션 CSS가 쓰는 애니메이션은 같은 파일이나 shared/base.css에 정의되어 있다', async () => {
  const base = await readFile(join(LANDING_DIR, 'shared/base.css'), 'utf8');
  const shared = new Set([...base.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]));
  const wrong = [];
  for (const file of ['page.css', 'demo/demo.css', 'tech/tech.css', 'journey/journey.css']) {
    const css = await readFile(join(LANDING_DIR, file), 'utf8');
    const own = new Set([...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]));
    for (const [, name] of css.matchAll(/animation:\s*([\w-]+)/g)) {
      if (name !== 'none' && !own.has(name) && !shared.has(name)) wrong.push({ file, name });
    }
  }
  assert.deepEqual(wrong, []);
});

test('index.html은 페이지가 쓰는 모듈을 모두 미리 받고, 미리 받는 모듈은 모두 있다', async () => {
  const html = await readFile(join(LANDING_DIR, 'index.html'), 'utf8');
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]).sort();
  const modules = ['main.js'];
  for (const dir of ['shared', ...SECTION_DIRS]) {
    for (const name of await readdir(join(LANDING_DIR, dir))) if (name.endsWith('.js')) modules.push(`${dir}/${name}`);
  }
  assert.deepEqual(preloaded, modules.sort());
});
