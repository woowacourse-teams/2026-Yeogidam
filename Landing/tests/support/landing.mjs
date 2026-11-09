// 테스트 파일마다 정적 서버 하나와 크롬 하나를 띄우고, 테스트마다 새 탭으로 랜딩을 연다
import { after, before } from 'node:test';
import { launchBrowser } from './browser.mjs';
import { startServer } from './server.mjs';

export function useLanding() {
  let server;
  let browser;
  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
  });
  after(async () => {
    await browser?.close();
    await server?.close();
  });
  return {
    async open(t, path = '/', options = {}) {
      const page = await browser.newPage(server.url(path), options);
      t.after(() => page.close());
      return page;
    },
  };
}
