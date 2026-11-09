// 헤드리스 크롬을 DevTools 프로토콜로 띄워 랜딩을 열고, 누르고, 읽는다. npm 의존성 없이 Node 내장 WebSocket을 쓴다
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const PLAYWRIGHT_CACHES = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
const HEADLESS_SHELL_DIRS = ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64'];
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// GA, 글꼴, QR 라이브러리처럼 밖으로 나가는 요청은 막아서, 오프라인에서도 같은 결과가 나오고 테스트가 방문 통계에 섞이지 않게 한다
const BLOCKED_URLS = ['https://*'];

// 밖으로 나가는 링크를 눌러도 새 탭이 뜨지 않게 막는다. window에 달아서 페이지의 document 리스너(store_click)가 먼저 돈다
const BLOCK_EXTERNAL_NAVIGATION = `window.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="http"]');
  if (a && !a.href.startsWith(location.origin)) e.preventDefault();
});`;

const KEY_CODES = { ArrowLeft: 37, ArrowRight: 39, Enter: 13, Tab: 9, Escape: 27 };

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const cache of PLAYWRIGHT_CACHES) {
    if (!existsSync(cache)) continue;
    const builds = readdirSync(cache).filter((name) => name.startsWith('chromium_headless_shell-'));
    for (const build of builds) {
      for (const dir of HEADLESS_SHELL_DIRS) {
        const bin = join(cache, build, dir, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  return existsSync(MAC_CHROME) ? MAC_CHROME : null;
}

class Connection {
  #ws;
  #lastId = 0;
  #pending = new Map();
  #listeners = new Set();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.#pending.has(message.id)) {
        const { resolve, reject, method } = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
        return;
      }
      for (const listener of this.#listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#lastId;
    this.#ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject, method }));
  }

  listen(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#ws.close();
  }
}

export async function launchBrowser() {
  const bin = findChrome();
  if (!bin) throw new Error('크롬을 찾지 못했다. CHROME_PATH에 크롬이나 chrome-headless-shell 경로를 넣어야 한다.');
  const profile = await mkdtemp(join(tmpdir(), 'landing-chrome-'));
  const args = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ];
  if (!bin.includes('headless-shell')) args.unshift('--headless=new');
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('크롬이 15초 안에 뜨지 않았다.')), 15000);
    proc.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`크롬이 바로 꺼졌다(종료 코드 ${code}).`));
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const connection = new Connection(ws);
  return {
    newPage: (url, options) => openPage(connection, url, options),
    async close() {
      connection.close();
      if (proc.exitCode === null) {
        const exited = new Promise((resolve) => proc.once('exit', resolve));
        proc.kill();
        await exited;
      }
      await rm(profile, { recursive: true, force: true });
    },
  };
}

async function openPage(connection, url, { width = 1280, height = 900, reducedMotion = false } = {}) {
  const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => connection.send(method, params, sessionId);
  const page = new Page(connection, send, targetId, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: BLOCKED_URLS });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (reducedMotion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: BLOCK_EXTERNAL_NAVIGATION });
  const loaded = page.nextEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  // 페이지의 부드러운 스크롤은 scrollIntoView 뒤 좌표를 어긋나게 하므로 테스트에서는 끈다
  await page.eval(`document.documentElement.style.scrollBehavior = 'auto'`);
  return page;
}

export class Page {
  #connection;
  #send;
  #targetId;
  #sessionId;
  #stopListening;
  // 콘솔 오류와 잡히지 않은 예외. 막아 둔 외부 요청이 실패하며 남기는 네트워크 로그는 넣지 않는다
  problems = [];

  constructor(connection, send, targetId, sessionId) {
    this.#connection = connection;
    this.#send = send;
    this.#targetId = targetId;
    this.#sessionId = sessionId;
    this.#stopListening = connection.listen((message) => {
      if (message.sessionId !== sessionId) return;
      const { method, params } = message;
      if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails;
        this.problems.push(details.exception?.description ?? details.text);
      } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        this.problems.push(params.args.map((arg) => arg.value ?? arg.description).join(' '));
      } else if (method === 'Log.entryAdded' && params.entry.level === 'error' && params.entry.source !== 'network') {
        this.problems.push(params.entry.text);
      }
    });
  }

  nextEvent(eventName) {
    return new Promise((resolve) => {
      const stop = this.#connection.listen((message) => {
        if (message.sessionId === this.#sessionId && message.method === eventName) {
          stop();
          resolve(message.params);
        }
      });
    });
  }

  async eval(expression) {
    const result = await this.#send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`페이지 스크립트 오류: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async waitFor(expression, { timeout = 8000, what = expression } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      last = await this.eval(expression);
      if (last) return last;
      await sleep(50);
    }
    throw new Error(`${timeout}ms 안에 조건이 맞지 않았다: ${what} (마지막 값 ${JSON.stringify(last)})`);
  }

  isVisible(selector) {
    return this.eval(isVisibleExpression(selector));
  }

  waitForVisible(selector, options) {
    return this.waitFor(isVisibleExpression(selector), { what: `${selector} 요소가 보인다`, ...options });
  }

  waitForText(selector, text, options) {
    return this.waitFor(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() === ${JSON.stringify(text)}`, {
      what: `${selector} 요소의 글자가 「${text}」다`,
      ...options,
    });
  }

  text(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`);
  }

  texts(selector) {
    return this.eval(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.textContent.trim())`);
  }

  count(selector) {
    return this.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async center(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
    })()`);
    if (!box || !box.width || !box.height) throw new Error(`${selector} 요소를 화면에서 찾지 못했다.`);
    return box;
  }

  async hover(selector) {
    const { x, y } = await this.center(selector);
    await this.#send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async click(selector) {
    const { x, y } = await this.center(selector);
    await this.#send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.#send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.#send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async press(key) {
    for (const type of ['keyDown', 'keyUp']) {
      await this.#send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: KEY_CODES[key] });
    }
  }

  // GA에 보낸 이벤트를 dataLayer에서 읽는다. GA 스크립트는 막혀 있어도 gtag는 dataLayer에 쌓는다
  async events(name) {
    const all = await this.eval(`(window.dataLayer || [])
      .map((entry) => Array.from(entry))
      .filter((entry) => entry[0] === 'event')
      .map((entry) => ({ name: entry[1], params: entry[2] ?? null }))`);
    return name ? all.filter((event) => event.name === name) : all;
  }

  screenshot(options = {}) {
    return this.#send('Page.captureScreenshot', { format: 'png', ...options }).then((result) => result.data);
  }

  async close() {
    this.#stopListening();
    await this.#connection.send('Target.closeTarget', { targetId: this.#targetId });
  }
}

function isVisibleExpression(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  })()`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
