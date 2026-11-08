import { test, expect } from '@playwright/test';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/** CrazyGames build: one self-contained file, the only external request is the SDK, nothing fails. */
test('CrazyGames build is one file and makes no failing request', async ({ page }) => {
  await page.route(SDK_URL, (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.CrazyGames = { SDK: {} };' }));
  const requests: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?t=1&q=low');
  await page.waitForFunction(() => (window as unknown as { __art?: { ready: boolean } }).__art?.ready === true, null, { timeout: 120_000 });
  const own = requests.filter((u) => u.startsWith('http://localhost') && !u.startsWith('data:'));
  expect(own.map((u) => new URL(u).pathname)).toEqual(['/']);
  expect(requests.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('data:'))).toEqual([SDK_URL]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
