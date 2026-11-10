import type { Page } from '@playwright/test';

/**
 * Record every message shown in #toast (a MutationObserver runs right after the click that set it, so a short
 * toast is seen even when a slow software-rendered frame outlasts it on CI).
 */
export async function watchToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    const el = document.getElementById('toast')!;
    new MutationObserver(() => {
      if (el.textContent) w.__toasts.push(el.textContent);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

export const toasts = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
